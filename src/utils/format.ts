/** Formats seconds as `m:ss` (e.g. 75.4 → "1:15"). */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

/** Formats a 0..1 ratio as a whole percentage (e.g. 0.934 → "93%"). */
export function formatPercent(ratio: number): string {
  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
}
