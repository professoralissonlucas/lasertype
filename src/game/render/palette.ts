// Mirrors src/styles/tokens.css (kept in sync by palette.test.ts).
import type { ResolvedCosmetics } from '../../cosmetics/types.ts';
import type { FxColor } from '../effects/particles.ts';

export const PALETTE = {
  bg: '#05070F',
  primary: '#22D3EE',
  danger: '#FF2E88',
  combo: '#FBBF24',
  text: '#E2E8F0',
  muted: '#64748B',
} as const;

/** `#RRGGBB` → [r, g, b]. */
export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Color of every particle slot: the UI palette plus the equipped laser and explosion colors. */
export function fxPalette(cosmetics: ResolvedCosmetics): Readonly<Record<FxColor, string>> {
  return {
    primary: PALETTE.primary,
    text: PALETTE.text,
    combo: PALETTE.combo,
    danger: PALETTE.danger,
    laser: cosmetics.laserColor.glow,
    blast: cosmetics.explosion.main,
    blastAlt: cosmetics.explosion.accent,
  };
}

/** `#RRGGBB` + alpha → `rgba(...)`. Call once at module load, not per frame. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
