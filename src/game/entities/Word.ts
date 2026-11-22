import type { Difficulty } from '../../words/types.ts';
import type { WordKind } from '../types.ts';

/** A falling word. Positions are normalized (see `CONFIG.spawn`). */
export interface Word {
  readonly id: number;
  readonly text: string;
  readonly difficulty: Difficulty;
  readonly kind: WordKind;
  readonly x: number;
  /** Fall speed in field heights per second (before slow effects). */
  readonly speed: number;
  y: number;
  /** y at the start of the current update, for render interpolation. */
  prevY: number;
  /** Letters already typed in the current pass (only the locked word has progress). */
  typed: number;
  /** Passes in total (2 for armored words) and passes still to break before the final one. */
  readonly layers: number;
  armor: number;
  /** A wrong key was pressed while this word was locked: no combo for it. */
  flawed: boolean;
}

/** Letters typed to destroy the word, over all passes (used for scoring). */
export function lettersOf(word: Pick<Word, 'text' | 'layers'>): number {
  return word.text.length * word.layers;
}
