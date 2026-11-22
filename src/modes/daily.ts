// Daily Challenge (pure): the same word sequence for everyone on the same game day (the
// shop's calendar, utils/day.ts: it turns at 03:00 UTC). The sequence depends on the day and
// on the language (each language is its own challenge), never on the player or the screen.
import { dayIndex, dayKeyOf } from '../utils/day.ts';
import type { ModeId } from './types.ts';

/** Seed of the Daily Challenge of game day `day`. */
export function dailySeed(day: number): string {
  return `daily:${dayKeyOf(day)}`;
}

/** What fixes the words of one match. */
export interface MatchContent {
  readonly seed: number | string;
  /** Game day of the challenge (its scores go to that day's board), 0 outside the daily mode. */
  readonly day: number;
}

/**
 * Seed and day of a match starting now. The Daily Challenge always follows the day, so
 * `fixedSeed` (`?seed=`, for testing) only reaches the other modes.
 */
export function matchContent(mode: ModeId, fixedSeed: string | null, epochMs: number): MatchContent {
  if (mode === 'daily') {
    const day = dayIndex(epochMs);
    return { seed: dailySeed(day), day };
  }
  return { seed: fixedSeed ?? epochMs, day: 0 };
}
