// Mirrors src/styles/tokens.css (kept in sync by palette.test.ts).
export const PALETTE = {
  bg: '#05070F',
  primary: '#22D3EE',
  danger: '#FF2E88',
  combo: '#FBBF24',
  text: '#E2E8F0',
  muted: '#64748B',
} as const;

/** `#RRGGBB` + alpha → `rgba(...)`. Call once at module load, not per frame. */
export function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
