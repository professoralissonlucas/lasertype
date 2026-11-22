import { dayStart } from './day.ts';

/** Formats seconds as `m:ss` (e.g. 75.4 → "1:15"). */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

/** Formats a countdown in milliseconds as `h:mm:ss` (e.g. 5h 3min 9s → "5:03:09"). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/** Day and month of a game day in the locale's order ("22/11" in pt-BR, "11/22" in en). */
export function formatGameDay(day: number, locale: string): string {
  const date = new Date(dayStart(day));
  // The UTC date on which the day starts is the date in Brasília too (it starts at 00:00 there).
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(date);
}

/** Integer formatter with the locale's thousands separator ("12.340" in pt-BR, "12,340" in en). */
export function createIntegerFormatter(locale: string): (value: number) => string {
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  return (value) => format.format(Math.round(value));
}

/** Formats a 0..1 ratio as a whole percentage (e.g. 0.934 → "93%"). */
export function formatPercent(ratio: number): string {
  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
}
