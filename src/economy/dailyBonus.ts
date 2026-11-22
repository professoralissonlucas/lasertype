// Daily Challenge bonus (pure): coins for the final place on a closed day's board.
// A closed board never changes again (the rules only accept scores of the current day), so
// the place is final. Paid once per day: DailyBonusCollector finds it, users/{uid}.stats.dailyDay
// remembers the last day paid (in the same write as the coins).
import { CONFIG } from '../config.ts';
import { dayIndex } from '../utils/day.ts';
import type { Language } from '../words/types.ts';
import type { DailyBonusConfig } from './types.ts';

export interface DailyBonus {
  /** Game day of the challenge. */
  readonly day: number;
  /** Final place (1 = first; ties share a place). */
  readonly position: number;
  readonly coins: number;
}

/** Coins for finishing a Daily Challenge in `position` with `score` (0 = no bonus). */
export function dailyBonusCoins(
  position: number,
  score: number,
  lang: Language,
  config: DailyBonusConfig = CONFIG.dailyBonus,
): number {
  if (lang !== config.lang || score < config.minScore || !(position >= 1)) return 0;
  return config.tiers.find((tier) => position <= tier.maxPosition)?.coins ?? 0;
}

export interface DailyPrize {
  readonly from: number;
  readonly to: number;
  readonly coins: number;
}

/** The bonus table as ranges of places, best first. */
export function dailyPrizes(config: DailyBonusConfig = CONFIG.dailyBonus): DailyPrize[] {
  return config.tiers.map((tier, i) => ({
    from: (config.tiers[i - 1]?.maxPosition ?? 0) + 1,
    to: tier.maxPosition,
    coins: tier.coins,
  }));
}

/** The most recent day whose board is final. */
export function lastClosedDay(epochMs: number, config: DailyBonusConfig = CONFIG.dailyBonus): number {
  return dayIndex(epochMs - config.settleMinutes * 60_000) - 1;
}

/**
 * Closed days still to settle, oldest first, going back at most `lookbackDays`. `settled` is
 * the last day already settled (null = none). A `settled` in the future comes from a wrong
 * device clock and is ignored (the server still never pays a day twice).
 */
export function daysToSettle(
  epochMs: number,
  settled: number | null,
  config: DailyBonusConfig = CONFIG.dailyBonus,
): number[] {
  const last = lastClosedDay(epochMs, config);
  const oldest = last - config.lookbackDays + 1;
  const first = settled === null || settled > last ? oldest : Math.max(oldest, settled + 1);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
}

function isPositiveInt(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

/** Cached data → a bonus, or null when it is not one a reward write can carry. */
export function parseDailyBonus(raw: unknown, maxCoins: number = CONFIG.sync.maxRewardPerWrite): DailyBonus | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { day, position, coins } = raw as Record<string, unknown>;
  if (!isPositiveInt(day) || !isPositiveInt(position) || !isPositiveInt(coins) || coins > maxCoins) return null;
  return { day, position, coins };
}
