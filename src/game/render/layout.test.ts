import { describe, expect, it } from 'vitest';
import {
  computeLayout,
  LAYOUT,
  letterCenterX,
  muzzlePosition,
  toScreenX,
  toScreenY,
  wordStartX,
} from './layout.ts';

describe('computeLayout', () => {
  it('maps normalized y 0 to the field top and 1 to the perimeter', () => {
    const layout = computeLayout(1280, 800);
    expect(toScreenY(layout, 0)).toBe(LAYOUT.fieldTop);
    expect(toScreenY(layout, 1)).toBe(800 - LAYOUT.perimeterOffset);
  });

  it('centers the cannon at the bottom', () => {
    const layout = computeLayout(1280, 800);
    expect(layout.cannonX).toBe(640);
    expect(layout.cannonY).toBe(800 - LAYOUT.cannonOffset);
  });

  it('caps and centers the play field on wide screens', () => {
    const layout = computeLayout(3000, 900);
    expect(layout.fieldWidth).toBe(LAYOUT.maxFieldWidth);
    expect(toScreenX(layout, 0.5)).toBe(1500);
  });

  it('clamps the word font size', () => {
    expect(computeLayout(400, 200).fontSize).toBe(LAYOUT.fontMin);
    expect(computeLayout(2000, 3000).fontSize).toBe(LAYOUT.fontMax);
  });

  it('keeps the perimeter below the field top on tiny screens', () => {
    const layout = computeLayout(300, 100);
    expect(layout.perimeterY).toBeGreaterThan(layout.fieldTop);
  });
});

describe('HUD side columns', () => {
  it('keeps the field clear of the side panels on wide screens', () => {
    const layout = computeLayout(1280, 800);
    expect(layout.fieldLeft).toBe(LAYOUT.sideReserve);
    expect(layout.fieldLeft + layout.fieldWidth).toBe(1280 - LAYOUT.sideReserve);
  });

  it('uses the whole width on narrow screens (side panels hidden)', () => {
    const layout = computeLayout(LAYOUT.sideReserveMinWidth - 1, 800);
    expect(layout.fieldLeft).toBe(LAYOUT.sidePadding);
  });
});

describe('word positions', () => {
  const layout = computeLayout(900, 800);
  const charWidth = 10;

  it('centers words on their x', () => {
    expect(wordStartX(layout, 0.5, 4, charWidth)).toBe(450 - 20);
  });

  it('keeps words fully inside the field near the edges', () => {
    const min = LAYOUT.sidePadding + LAYOUT.wordPadX;
    expect(wordStartX(layout, 0, 10, charWidth)).toBe(min);
    expect(wordStartX(layout, 1, 10, charWidth) + 100).toBe(900 - min);

    const wide = computeLayout(1280, 800);
    expect(wordStartX(wide, 1, 10, charWidth) + 100).toBe(1280 - LAYOUT.sideReserve - LAYOUT.wordPadX);
  });

  it('finds the center of a letter', () => {
    expect(letterCenterX(layout, 0.5, 4, 0, charWidth)).toBe(435);
    expect(letterCenterX(layout, 0.5, 4, 3, charWidth)).toBe(465);
  });

  it('puts the muzzle straight above the pivot at angle 0', () => {
    const muzzle = muzzlePosition(layout, 0);
    expect(muzzle.x).toBeCloseTo(layout.cannonX);
    expect(muzzle.y).toBeCloseTo(layout.cannonY - LAYOUT.barrelLength);
  });
});
