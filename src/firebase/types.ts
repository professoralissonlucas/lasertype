// Online types: account state and the global ranking. firestore.rules is the contract;
// these shapes follow it field by field.
import type { GameDifficulty } from '../game/types.ts';
import type { Language } from '../words/types.ts';

/** The ranking; the limits of a score document are mirrored from firestore.rules (validScore). */
export interface RankingConfig {
  /** Rows shown per board. */
  readonly topSize: number;
  /** A board is read again only after this long… */
  readonly cacheSeconds: number;
  /** …or when the player presses "Atualizar", at most this often. */
  readonly refreshSeconds: number;
  readonly maxWpm: number;
  /** Seconds. */
  readonly maxDuration: number;
  readonly timeAttackMaxDuration: number;
  /** Nickname length (validName). */
  readonly nameMin: number;
  readonly nameMax: number;
}

/** Modes with a ranking (Zen never enters it). */
export const RANKED_MODES = ['survival', 'timeAttack', 'daily'] as const;
export type RankedMode = (typeof RANKED_MODES)[number];

/** One leaderboard: a mode, difficulty, word language and day (0 outside the daily mode). */
export interface Board {
  readonly mode: RankedMode;
  readonly diff: GameDifficulty;
  readonly lang: Language;
  readonly day: number;
}

/** scores/{uid_mode_diff_lang_day} without `createdAt` (the backend adds serverTimestamp()). */
export interface ScoreFields extends Board {
  readonly uid: string;
  /** Nickname (never the real Google name). */
  readonly name: string;
  readonly score: number;
  readonly wpm: number;
  /** Percent, 0–100. */
  readonly accuracy: number;
  /** Seconds played (pauses excluded). */
  readonly duration: number;
}

/** A leaderboard row as read back from Firestore. */
export interface RankRow {
  readonly uid: string;
  readonly name: string;
  readonly score: number;
  readonly wpm: number;
  readonly accuracy: number;
}

/**
 * - unavailable: no Firebase config (offline build)
 * - connecting: loading the SDK / signing in
 * - anonymous: automatic anonymous account (cannot enter the ranking)
 * - google: linked to Google (enters the ranking)
 * - error: could not sign in (no network…); the game keeps working
 */
export type AccountStatus = 'unavailable' | 'connecting' | 'anonymous' | 'google' | 'error';

export interface AccountState {
  readonly status: AccountStatus;
  readonly uid: string | null;
}
