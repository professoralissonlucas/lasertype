import type { Difficulty } from '../../words/types.ts';

/** A falling word. Positions are normalized (see `CONFIG.spawn`). */
export interface Word {
  readonly id: number;
  readonly text: string;
  readonly difficulty: Difficulty;
  readonly x: number;
  /** Fall speed in field heights per second. */
  readonly speed: number;
  y: number;
  /** y at the start of the current update, for render interpolation. */
  prevY: number;
  /** Letters already typed (only the locked word has progress). */
  typed: number;
}
