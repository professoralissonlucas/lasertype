import { describe, expect, it } from 'vitest';
import tokens from '../../styles/tokens.css?raw';
import { getItem } from '../../cosmetics/catalog.ts';
import { DEFAULT_COSMETICS } from '../../cosmetics/equip.ts';
import { fxPalette, PALETTE, withAlpha } from './palette.ts';

describe('PALETTE', () => {
  it('mirrors the CSS tokens', () => {
    for (const [name, hex] of Object.entries(PALETTE)) {
      const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens);
      expect(match?.[1]?.toUpperCase(), name).toBe(hex.toUpperCase());
    }
  });
});

describe('withAlpha', () => {
  it('converts hex to rgba', () => {
    expect(withAlpha('#22D3EE', 0.5)).toBe('rgba(34, 211, 238, 0.5)');
  });
});

describe('fxPalette', () => {
  it('maps the cosmetic slots to the equipped colors and keeps the UI colors', () => {
    const fx = fxPalette(DEFAULT_COSMETICS);
    expect(fx).toMatchObject({ primary: PALETTE.primary, danger: PALETTE.danger, laser: PALETTE.primary, blast: PALETTE.primary, blastAlt: PALETTE.combo });
    const item = getItem('laser_emerald');
    if (item?.type !== 'laserColor') throw new Error('missing laser');
    const green = fxPalette({ ...DEFAULT_COSMETICS, laserColor: item.params });
    expect(green.laser).toBe(item.params.glow);
    expect(green.primary).toBe(PALETTE.primary);
  });
});
