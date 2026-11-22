// Daily Challenge text shared by the ranking and the Mission Report.
import { dailyBonusCoins } from '../economy/dailyBonus.ts';
import type { Language } from '../words/types.ts';
import type { Translate } from './i18n.ts';

/** "You are #3 today. +100 coins if it ends like this." (without the second part when no bonus). */
export function dailyPlaceText(
  t: Translate,
  formatNumber: (value: number) => string,
  place: number,
  score: number,
  lang: Language,
): string {
  const position = t('dailyPosition', { n: formatNumber(place) });
  const coins = dailyBonusCoins(place, score, lang);
  return coins > 0 ? `${position} ${t('dailyForecast', { n: formatNumber(coins) })}` : position;
}
