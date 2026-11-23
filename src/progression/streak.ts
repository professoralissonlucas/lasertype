// Login streak (pure): coins for every game day in a row. The table has one entry per day and
// starts over after the last one; missing a day goes back to the first.
import { CONFIG } from '../config.ts';
import type { Progress } from './types.ts';

type StreakState = Pick<Progress, 'streak' | 'lastLogin'>;

export interface LoginReward {
  /** Days in a row, this one included. */
  readonly streak: number;
  readonly coins: number;
}

/** Where a streak of `streak` days is in the table (0-based). */
export function streakSlot(streak: number, table: readonly number[] = CONFIG.progression.streakCoins): number {
  return Math.max(0, streak - 1) % table.length;
}

export function streakCoins(streak: number, table: readonly number[] = CONFIG.progression.streakCoins): number {
  return table[streakSlot(streak, table)] ?? 0;
}

/**
 * The login of game day `day`, or null when that day (or a later one) was already counted.
 * A later one comes from another device, or from a wrong clock: the streak waits for that day.
 */
export function claimLogin(
  state: StreakState,
  day: number,
  table: readonly number[] = CONFIG.progression.streakCoins,
): LoginReward | null {
  if (state.lastLogin !== null && state.lastLogin >= day) return null;
  const streak = state.lastLogin === day - 1 ? state.streak + 1 : 1;
  return { streak, coins: streakCoins(streak, table) };
}

/** The streak still alive on `today` (yesterday's login keeps it), 0 once a day was missed. */
export function currentStreak(state: StreakState, today: number): number {
  return state.lastLogin !== null && state.lastLogin >= today - 1 ? state.streak : 0;
}
