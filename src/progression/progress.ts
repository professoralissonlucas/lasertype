// The player's progress and how it grows (pure). A match or a login becomes a ProgressGain;
// applying it credits each award (chest, mission, streak day) to `owed` and marks it in the same
// step (`level`, `missions.paid`, `lastLogin`), so nothing is ever credited twice: the client
// applies gains locally to show them at once, and the reward transaction applies the same gains
// on top of the server's document (firebase/profile.ts).
import { CONFIG } from '../config.ts';
import type { MatchReport } from '../game/report.ts';
import { dailyMissions, mergeAmounts, missionAmounts } from './missions.ts';
import { claimLogin } from './streak.ts';
import type { Award, MissionGain, MissionState, Progress, ProgressGain, ProgressionConfig, Stats } from './types.ts';
import { chestCoins, levelOf, matchXp } from './xp.ts';

const COUNTERS = ['games', 'words', 'bosses'] as const;
const BESTS = ['bestScore', 'bestWpm', 'bestBurst', 'bestCombo', 'bestWave'] as const;
/** Every statistic, in the order they are stored. */
export const STAT_KEYS = [...COUNTERS, ...BESTS, 'bestStreak'] as const satisfies readonly (keyof Stats)[];

export function emptyProgress(): Progress {
  return { xp: 0, level: 1, streak: 0, lastLogin: null, stats: { ...emptyGain().stats, bestStreak: 0 }, missions: null, owed: 0 };
}

export function emptyGain(): ProgressGain {
  const stats = { games: 0, words: 0, bosses: 0, bestScore: 0, bestWpm: 0, bestBurst: 0, bestCombo: 0, bestWave: 0 };
  return { xp: 0, stats, missions: [], logins: [] };
}

export function isEmptyGain(gain: ProgressGain): boolean {
  return (
    gain.xp === 0 &&
    gain.missions.length === 0 &&
    gain.logins.length === 0 &&
    [...COUNTERS, ...BESTS].every((key) => gain.stats[key] === 0)
  );
}

/** One decimal, never rounded up (99.96 WPM is not 100). */
const tenths = (value: number): number => Math.floor(value * 10) / 10;

/** Zen is practice: it only gives XP. */
export function isPractice(mode: MatchReport['mode']): boolean {
  return mode === 'zen';
}

/** What a finished match is worth; its missions count for `day`. */
export function matchGain(report: MatchReport, day: number, config: ProgressionConfig = CONFIG.progression): ProgressGain {
  const xp = matchXp(report, config).total;
  if (isPractice(report.mode) || report.destroyed === 0) return { ...emptyGain(), xp };
  return {
    xp,
    stats: {
      games: 1,
      words: report.destroyed,
      bosses: report.bosses,
      bestScore: report.score,
      bestWpm: tenths(report.wpm),
      bestBurst: tenths(report.burst),
      bestCombo: report.maxCombo,
      bestWave: report.wave,
    },
    missions: [{ day, amounts: missionAmounts(day, report, config) }],
    logins: [],
  };
}

export function loginGain(day: number): ProgressGain {
  return { ...emptyGain(), logins: [day] };
}

function mergeStats(a: ProgressGain['stats'], b: ProgressGain['stats']): ProgressGain['stats'] {
  return {
    games: a.games + b.games,
    words: a.words + b.words,
    bosses: a.bosses + b.bosses,
    bestScore: Math.max(a.bestScore, b.bestScore),
    bestWpm: Math.max(a.bestWpm, b.bestWpm),
    bestBurst: Math.max(a.bestBurst, b.bestBurst),
    bestCombo: Math.max(a.bestCombo, b.bestCombo),
    bestWave: Math.max(a.bestWave, b.bestWave),
  };
}

/** `a` came before `b`. */
export function mergeGain(a: ProgressGain, b: ProgressGain, config: ProgressionConfig = CONFIG.progression): ProgressGain {
  const days = new Map<number, readonly number[]>();
  for (const { day, amounts } of [...a.missions, ...b.missions]) {
    const before = days.get(day);
    days.set(day, before ? mergeAmounts(day, before, amounts, config) : amounts);
  }
  return {
    xp: a.xp + b.xp,
    stats: mergeStats(a.stats, b.stats),
    missions: [...days].sort(([x], [y]) => x - y).map(([day, amounts]) => ({ day, amounts })),
    logins: [...new Set([...a.logins, ...b.logins])].sort((x, y) => x - y),
  };
}

/** Splits a gain so that the first part carries at most `maxXp` (a reward write's limit). */
export function takeGain(gain: ProgressGain, maxXp: number): { readonly first: ProgressGain; readonly rest: ProgressGain } {
  const xp = Math.min(gain.xp, maxXp);
  return { first: { ...gain, xp }, rest: { ...emptyGain(), xp: gain.xp - xp } };
}

export interface AppliedGain {
  /** With the awards already in `owed`. */
  readonly progress: Progress;
  readonly awards: readonly Award[];
}

/** Adds a gain: XP and statistics, then the awards it brings (each one marked as credited). */
export function applyGain(
  before: Progress,
  gain: ProgressGain,
  config: ProgressionConfig = CONFIG.progression,
): AppliedGain {
  const awards: Award[] = [];

  let { streak, lastLogin } = before;
  for (const day of gain.logins) {
    const login = claimLogin({ streak, lastLogin }, day, config.streakCoins);
    if (!login) continue;
    streak = login.streak;
    lastLogin = day;
    awards.push({ type: 'login', day, ...login });
  }

  let missions = before.missions;
  for (const entry of gain.missions) missions = applyMissions(missions, entry, awards, config);

  const xp = before.xp + gain.xp;
  const reached = levelOf(xp, config);
  for (let level = before.level + 1; level <= reached; level++) {
    awards.push({ type: 'chest', level, coins: chestCoins(level, config) });
  }

  const progress: Progress = {
    xp,
    level: Math.max(before.level, reached),
    streak,
    lastLogin,
    stats: { ...mergeStats(before.stats, gain.stats), bestStreak: Math.max(before.stats.bestStreak, streak) },
    missions,
    owed: before.owed + awards.reduce((sum, award) => sum + award.coins, 0),
  };
  return { progress, awards };
}

function applyMissions(
  state: MissionState | null,
  gain: MissionGain,
  awards: Award[],
  config: ProgressionConfig,
): MissionState {
  const { day } = gain;
  // Late news of a past day (another device moved on): its missions are gone.
  if (state && day < state.day) return state;
  const current = state?.day === day ? state : null;
  const amounts = mergeAmounts(day, current?.progress ?? [], gain.amounts, config);
  const progress: number[] = [];
  const paid: boolean[] = [];
  for (const { slot, target, coins } of dailyMissions(day, config)) {
    const amount = Math.min(target, amounts[slot] ?? 0);
    const before = current?.paid[slot] === true;
    const done = before || amount >= target;
    if (done && !before) awards.push({ type: 'mission', day, slot, coins });
    progress.push(amount);
    paid.push(done);
  }
  return { day, progress, paid };
}

/** Same progress, by value. */
export function sameProgress(a: Progress, b: Progress): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

// ---------- Reading (untrusted: users/{uid}, or the local cache) ----------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const number = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0);
const integer = (value: unknown): number => Math.floor(number(value));
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
const isDay = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;

function parseGainStats(raw: unknown): ProgressGain['stats'] {
  const s = isRecord(raw) ? raw : {};
  return {
    games: integer(s.games),
    words: integer(s.words),
    bosses: integer(s.bosses),
    bestScore: integer(s.bestScore),
    bestWpm: number(s.bestWpm),
    bestBurst: number(s.bestBurst),
    bestCombo: integer(s.bestCombo),
    bestWave: integer(s.bestWave),
  };
}

function parseMissions(raw: unknown, config: ProgressionConfig): MissionState | null {
  if (!isRecord(raw) || !isDay(raw.day)) return null;
  const progress = list(raw.progress);
  const paid = list(raw.paid);
  const slots = config.missions.slots.map((_, slot) => slot);
  return {
    day: raw.day,
    progress: slots.map((slot) => integer(progress[slot])),
    paid: slots.map((slot) => paid[slot] === true),
  };
}

/**
 * Anything invalid or missing counts as nothing yet. In the document `missions` and `owed` live
 * inside `stats` (the rules have no other room for them); the cache keeps a `Progress` as it is.
 */
export function parseProgress(raw: unknown, config: ProgressionConfig = CONFIG.progression): Progress {
  const d = isRecord(raw) ? raw : {};
  const s = isRecord(d.stats) ? d.stats : {};
  return {
    xp: integer(d.xp),
    level: Math.max(1, integer(d.level)),
    streak: integer(d.streak),
    lastLogin: isDay(d.lastLogin) ? d.lastLogin : null,
    stats: { ...parseGainStats(s), bestStreak: integer(s.bestStreak) },
    missions: parseMissions(d.missions ?? s.missions, config),
    owed: integer(d.owed ?? s.owed),
  };
}

/** A cached gain (anything invalid counts as nothing). */
export function parseGain(raw: unknown): ProgressGain {
  const d = isRecord(raw) ? raw : {};
  const missions = list(d.missions).flatMap((entry) =>
    isRecord(entry) && isDay(entry.day) ? [{ day: entry.day, amounts: list(entry.amounts).map(integer) }] : [],
  );
  const gain = { xp: integer(d.xp), stats: parseGainStats(d.stats), missions, logins: list(d.logins).filter(isDay) };
  return mergeGain(emptyGain(), gain); // sorted, one entry per day
}
