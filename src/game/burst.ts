// Burst WPM (pure): how fast the player types while typing. The match WPM also counts the wait
// for the next word to fall, so it can never get near the player's real speed (a perfect typist
// tops out around 90). The burst only counts the time between the first and the last letter of
// each word, over the last few words typed in a row, and keeps the best.
import { CONFIG } from '../config.ts';
import type { BurstConfig } from './types.ts';

interface BurstWord {
  /** Gaps between its letters (letters − 1). */
  readonly gaps: number;
  readonly seconds: number;
}

export interface BurstState {
  /** Match time (s) of the first letter of the word being typed. */
  startedAt: number;
  /** Letters typed right since then (wrong keys only cost time). */
  letters: number;
  /** The last words typed, oldest first. */
  readonly recent: BurstWord[];
  /** Best burst of the match, in WPM (0 until there are enough words). */
  best: number;
}

export function createBurst(): BurstState {
  return { startedAt: 0, letters: 0, recent: [], best: 0 };
}

/** A right letter. `first` = it starts a word (a new lock, or the word starting over). */
export function burstLetter(burst: BurstState, elapsed: number, first: boolean): void {
  if (first) {
    burst.startedAt = elapsed;
    burst.letters = 0;
  }
  burst.letters++;
}

/** The word was destroyed by typing (bombs and the EMP neither count nor break the row). */
export function burstWord(burst: BurstState, elapsed: number, config: BurstConfig = CONFIG.burst): void {
  const { letters, startedAt, recent } = burst;
  burst.letters = 0;
  // Too short to measure (the little words of a boss phrase).
  if (letters < config.minLetters) return;
  recent.push({ gaps: letters - 1, seconds: elapsed - startedAt });
  if (recent.length > config.words) recent.shift();
  if (recent.length === config.words) burst.best = Math.max(burst.best, burstWpm(recent, config));
}

/** Standard WPM (5 letters = 1 word) over the typing time of `words`, capped. */
export function burstWpm(words: readonly BurstWord[], config: BurstConfig = CONFIG.burst): number {
  let gaps = 0;
  let seconds = 0;
  for (const word of words) {
    gaps += word.gaps;
    seconds += word.seconds;
  }
  if (gaps === 0) return 0;
  return seconds > 0 ? Math.min(config.maxWpm, gaps / 5 / (seconds / 60)) : config.maxWpm;
}
