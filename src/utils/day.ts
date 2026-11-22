// The game day: one shared calendar for the rotating shop and the Daily Challenge.
// A day starts at 03:00 UTC (midnight in Brasília, UTC−3) for everyone, wherever they
// are. Firestore rules must redo exactly this arithmetic:
//   dayIndex = floor((epochMillis − 3 h) / 86 400 000)

export const DAY_MS = 86_400_000;
/** The day turns at 03:00 UTC. */
export const DAY_START_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Days since the epoch, counted from 03:00 UTC to 03:00 UTC. */
export function dayIndex(epochMs: number): number {
  return Math.floor((epochMs - DAY_START_OFFSET_MS) / DAY_MS);
}

/** `YYYY-MM-DD` of a game day (the UTC date on which it starts). */
export function dayKeyOf(index: number): string {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` of the game day at `epochMs` (the seed of daily content). */
export function dayKey(epochMs: number): string {
  return dayKeyOf(dayIndex(epochMs));
}

/** Epoch milliseconds when game day `index` starts. */
export function dayStart(index: number): number {
  return index * DAY_MS + DAY_START_OFFSET_MS;
}

/** Milliseconds until the next game day starts (always > 0). */
export function msUntilNextDay(epochMs: number): number {
  return dayStart(dayIndex(epochMs) + 1) - epochMs;
}
