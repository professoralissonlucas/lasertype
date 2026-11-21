// Target lock logic (pure).
import { charsMatch } from './input.ts';
import type { TypingOptions } from './types.ts';

export interface TargetCandidate {
  readonly id: number;
  readonly text: string;
  /** Normalized height: larger = closer to the perimeter. */
  readonly y: number;
}

export interface TypedCandidate extends TargetCandidate {
  /** Letters already typed. */
  readonly typed: number;
}

/**
 * Without a lock, a key picks the word that starts with it and is closest to the
 * perimeter. Ties go to the oldest word (lowest id) so the result is deterministic.
 */
export function pickTarget<T extends TargetCandidate>(
  words: readonly T[],
  char: string,
  options: TypingOptions,
): T | null {
  let best: T | null = null;
  for (const word of words) {
    const first = word.text[0];
    if (first === undefined || !charsMatch(first, char, options)) continue;
    if (best === null || word.y > best.y || (word.y === best.y && word.id < best.id)) best = word;
  }
  return best;
}

export type KeyOutcome<T> =
  | {
      readonly kind: 'hit';
      readonly word: T;
      /** Index of the letter that was hit. */
      readonly index: number;
      /** The word was not locked before this key. */
      readonly newLock: boolean;
      /** This was the last letter. */
      readonly completed: boolean;
    }
  | {
      readonly kind: 'miss';
      /** The locked word, kept locked; null when nothing could be targeted. */
      readonly word: T | null;
    };

/**
 * Resolves one typed character. With a lock, only the locked word's next letter counts
 * (a wrong letter is a miss and the lock stays). Without one, the key picks a new target.
 * Does not mutate anything: the caller applies the outcome.
 */
export function resolveKey<T extends TypedCandidate>(
  words: readonly T[],
  lockedId: number | null,
  char: string,
  options: TypingOptions,
): KeyOutcome<T> {
  if (lockedId !== null) {
    const locked = words.find((word) => word.id === lockedId);
    if (locked) {
      const expected = locked.text[locked.typed];
      if (expected !== undefined && charsMatch(expected, char, options)) {
        return {
          kind: 'hit',
          word: locked,
          index: locked.typed,
          newLock: false,
          completed: locked.typed + 1 >= locked.text.length,
        };
      }
      return { kind: 'miss', word: locked };
    }
    // Stale lock (the word is gone): behave as if nothing was locked.
  }

  const target = pickTarget(words, char, options);
  if (!target) return { kind: 'miss', word: null };
  return { kind: 'hit', word: target, index: 0, newLock: true, completed: target.text.length <= 1 };
}
