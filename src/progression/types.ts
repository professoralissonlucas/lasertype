// Progression types: XP and level, daily missions, login streak and lifetime statistics.
// `Progress` mirrors fields of users/{uid} (xp, level, streak, lastLogin, stats); what a match
// or a login adds is a `ProgressGain`, applied by progress.ts (locally at once, and again by
// the reward transaction on top of the server's document).
import type { ModeId } from '../modes/types.ts';

// ---------- Tuning (values live in config.ts) ----------

/** What a mission counts, from the matches of its day. */
export const MISSION_METRICS = [
  /** Added up over the day. */
  'words',
  'letters',
  'games',
  'score',
  'bosses',
  'emp',
  /** Best single match of the day. */
  'combo',
  'accuracy',
  'matchScore',
  'burst',
  'wave',
  'dailyScore',
  'timeAttackScore',
] as const;
export type MissionMetric = (typeof MISSION_METRICS)[number];

export interface MissionTemplate {
  readonly metric: MissionMetric;
  /** One of them is drawn for the day. */
  readonly targets: readonly number[];
}

export interface MissionSlotConfig {
  readonly coins: number;
  readonly pool: readonly MissionTemplate[];
}

export interface ProgressionConfig {
  readonly xp: {
    readonly perLetter: number;
    readonly perWord: number;
    readonly perBoss: number;
    /** Before the mode factor. */
    readonly maxPerMatch: number;
    readonly modeFactor: Readonly<Record<ModeId, number>>;
  };
  readonly level: {
    /** XP from level 1 to 2, and how much more each following level costs. */
    readonly firstCost: number;
    readonly costStep: number;
  };
  /** Coins of the chest for reaching a level: base + perLevel × level, up to max. */
  readonly chest: { readonly base: number; readonly perLevel: number; readonly max: number };
  /** Coins per day in a row; after the last one the table starts over. */
  readonly streakCoins: readonly number[];
  readonly missions: {
    /** One mission per slot, every day. */
    readonly slots: readonly MissionSlotConfig[];
    /** A match shorter than this (words destroyed) does not count as played. */
    readonly minWordsPlayed: number;
    /** Words destroyed for the accuracy of a match to count. */
    readonly minWordsAccuracy: number;
  };
  /** What each achievement asks for (achievements.ts says of which statistic). */
  readonly achievements: {
    readonly lightning: number;
    readonly frontline: number;
    readonly flawless: number;
    readonly bossHunter: number;
    readonly loyal: number;
  };
}

// ---------- Progress ----------

/** Lifetime statistics (users/{uid}.stats). Practice matches (Zen) never count. */
export interface Stats {
  readonly games: number;
  readonly words: number;
  readonly bosses: number;
  readonly bestScore: number;
  readonly bestWpm: number;
  readonly bestBurst: number;
  readonly bestCombo: number;
  readonly bestWave: number;
  readonly bestStreak: number;
}

/** The missions of one game day (one entry per slot). */
export interface MissionState {
  readonly day: number;
  readonly progress: readonly number[];
  /** Completed: its coins went to `owed`. */
  readonly paid: readonly boolean[];
}

export interface Progress {
  readonly xp: number;
  /** Highest level whose chest was credited. */
  readonly level: number;
  /** Days in a row, up to `lastLogin`. */
  readonly streak: number;
  /** Game day of the last login counted, null = none. */
  readonly lastLogin: number | null;
  readonly stats: Stats;
  readonly missions: MissionState | null;
  /** Coins already earned and recorded, still to be paid (a reward write pays at most 150). */
  readonly owed: number;
}

// ---------- Gains ----------

export interface MissionGain {
  readonly day: number;
  /** What one match (or a few) adds to each slot of that day's missions. */
  readonly amounts: readonly number[];
}

/** What was earned since some point; gains are merged and applied in order. */
export interface ProgressGain {
  readonly xp: number;
  /** Counters are added, bests are maximums (`bestStreak` follows the logins). */
  readonly stats: Omit<Stats, 'bestStreak'>;
  /** Oldest day first. */
  readonly missions: readonly MissionGain[];
  /** Game days of the logins, oldest first. */
  readonly logins: readonly number[];
}

/** Coins a gain is worth besides the match coins. Each one is marked as it is credited. */
export type Award =
  | { readonly type: 'login'; readonly day: number; readonly streak: number; readonly coins: number }
  | { readonly type: 'mission'; readonly day: number; readonly slot: number; readonly coins: number }
  | { readonly type: 'chest'; readonly level: number; readonly coins: number };
