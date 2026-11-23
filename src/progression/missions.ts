// Daily missions (pure): one per slot (volume, skill, challenge), the same for everyone on the
// same game day. Within a slot every template comes up once before any repeats (a shuffled
// cycle); the target is drawn with the seed "missions:YYYY-MM-DD".
// Practice matches (Zen) never count.
import { CONFIG } from '../config.ts';
import type { MatchReport } from '../game/report.ts';
import { MODES } from '../modes/index.ts';
import { dayKeyOf } from '../utils/day.ts';
import { createRng, shuffled } from '../utils/rng.ts';
import type { MissionMetric, MissionState, ProgressionConfig } from './types.ts';

export interface Mission {
  readonly slot: number;
  readonly metric: MissionMetric;
  readonly target: number;
  readonly coins: number;
}

/** How the amounts of several matches combine. */
const METRIC_KIND: Readonly<Record<MissionMetric, 'sum' | 'best'>> = {
  words: 'sum',
  letters: 'sum',
  games: 'sum',
  score: 'sum',
  bosses: 'sum',
  emp: 'sum',
  combo: 'best',
  accuracy: 'best',
  matchScore: 'best',
  burst: 'best',
  wave: 'best',
  dailyScore: 'best',
  timeAttackScore: 'best',
};

/** The missions of game day `day`, one per slot. */
export function dailyMissions(day: number, config: ProgressionConfig = CONFIG.progression): readonly Mission[] {
  const rng = createRng(`missions:${dayKeyOf(day)}`);
  return config.missions.slots.map(({ coins, pool }, slot) => {
    const cycle = Math.floor(day / pool.length);
    const order = shuffled(createRng(`missions:slot${slot}:${cycle}`), pool);
    const template = order[day - cycle * pool.length];
    if (!template) throw new Error(`missions: slot ${slot} has no missions`);
    return { slot, metric: template.metric, target: rng.pick(template.targets), coins };
  });
}

/** What a mission needs from a match. */
export type MissionMatch = Pick<
  MatchReport,
  'mode' | 'letters' | 'destroyed' | 'score' | 'bosses' | 'empUses' | 'maxCombo' | 'accuracy' | 'burst' | 'wave'
>;

function metricOf(metric: MissionMetric, match: MissionMatch, config: ProgressionConfig): number {
  const { minWordsPlayed, minWordsAccuracy } = config.missions;
  switch (metric) {
    case 'words':
      return match.destroyed;
    case 'letters':
      return match.letters;
    case 'games':
      return match.destroyed >= minWordsPlayed ? 1 : 0;
    case 'score':
    case 'matchScore':
      return match.score;
    case 'bosses':
      return match.bosses;
    case 'emp':
      return match.empUses;
    case 'combo':
      return match.maxCombo;
    case 'accuracy':
      return match.destroyed >= minWordsAccuracy ? Math.floor(match.accuracy * 100) : 0;
    case 'burst':
      return Math.floor(match.burst);
    case 'wave':
      // Time Attack runs through the waves without breaks: it is not the same feat.
      return MODES[match.mode].waveBreak ? match.wave : 0;
    case 'dailyScore':
      return match.mode === 'daily' ? match.score : 0;
    case 'timeAttackScore':
      return match.mode === 'timeAttack' ? match.score : 0;
  }
}

/** What a match adds to each mission of the day. */
export function missionAmounts(
  day: number,
  match: MissionMatch,
  config: ProgressionConfig = CONFIG.progression,
): number[] {
  return dailyMissions(day, config).map(({ metric }) => metricOf(metric, match, config));
}

/** Combines the amounts of two (groups of) matches of the same day. */
export function mergeAmounts(
  day: number,
  a: readonly number[],
  b: readonly number[],
  config: ProgressionConfig = CONFIG.progression,
): number[] {
  return dailyMissions(day, config).map(({ metric, slot }) => {
    const x = a[slot] ?? 0;
    const y = b[slot] ?? 0;
    return METRIC_KIND[metric] === 'sum' ? x + y : Math.max(x, y);
  });
}

/** A mission with how far the player is today. */
export interface MissionView extends Mission {
  /** Up to `target`. */
  readonly progress: number;
  readonly done: boolean;
}

/** Today's missions as the player sees them (`state` may be from an older day). */
export function missionViews(
  state: MissionState | null,
  day: number,
  config: ProgressionConfig = CONFIG.progression,
): readonly MissionView[] {
  const today = state?.day === day ? state : null;
  return dailyMissions(day, config).map((mission) => {
    const done = today?.paid[mission.slot] === true;
    const progress = Math.min(mission.target, today?.progress[mission.slot] ?? 0);
    return { ...mission, progress: done ? mission.target : progress, done };
  });
}
