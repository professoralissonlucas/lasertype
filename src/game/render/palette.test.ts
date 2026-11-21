import { describe, expect, it } from 'vitest';
import tokens from '../../styles/tokens.css?raw';
import { PALETTE, withAlpha } from './palette.ts';

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
