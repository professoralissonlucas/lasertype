import type { Difficulty } from '../words/types.ts';

/** How typed characters are compared against word letters. */
export interface TypingOptions {
  /** When false (default), `ação` accepts `acao`. */
  readonly requireAccents: boolean;
}

/** Spawner tuning. See `CONFIG.spawn` for the coordinate system. */
export interface SpawnParams {
  /** Seconds before the first word. */
  readonly firstDelay: number;
  /** Seconds between spawns. */
  readonly interval: number;
  /** Spawning pauses while this many words are on screen. */
  readonly maxActive: number;
  /** Normalized y where new words appear. */
  readonly spawnY: number;
  readonly tierWeights: Readonly<Record<Difficulty, number>>;
  /** Base fall speed per tier, in field heights per second. */
  readonly speed: Readonly<Record<Difficulty, number>>;
  /** Speed varies by ±this fraction. */
  readonly speedJitter: number;
  readonly xMin: number;
  readonly xMax: number;
  /** Preferred minimum horizontal distance from the last `xHistory` spawns. */
  readonly minXGap: number;
  readonly xAttempts: number;
  readonly xHistory: number;
  /** New words avoid the first letter of the last N spawned words, when possible. */
  readonly initialHistory: number;
  /** New words never repeat any of the last N spawned words, when possible. */
  readonly textHistory: number;
  readonly maxRerolls: number;
}

export interface SpawnedWord {
  readonly text: string;
  readonly difficulty: Difficulty;
  readonly x: number;
  readonly speed: number;
}

/** Anything that hands out new words over time (the Spawner, or a stub in tests). */
export interface WordSource {
  update(dt: number, activeCount: number): SpawnedWord | null;
}

/**
 * Things that happened during an update. Logic emits them; the presentation layer
 * (lasers now, particles and sounds in Phase 2) reacts to them.
 */
export type GameEvent =
  | { readonly type: 'spawn'; readonly wordId: number }
  | { readonly type: 'lock'; readonly wordId: number }
  | { readonly type: 'unlock'; readonly wordId: number }
  | {
      readonly type: 'hit';
      readonly wordId: number;
      /** Index of the letter that was just hit. */
      readonly index: number;
      readonly length: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly type: 'miss'; readonly wordId: number | null }
  | {
      readonly type: 'destroy';
      readonly wordId: number;
      readonly text: string;
      readonly x: number;
      readonly y: number;
    }
  | { readonly type: 'breach'; readonly wordId: number; readonly x: number; readonly shield: number }
  | { readonly type: 'gameover' };
