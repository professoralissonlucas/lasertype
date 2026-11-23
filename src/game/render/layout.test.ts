import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config.ts';
import { DIFFICULTIES } from '../../words/types.ts';
import {
  COMPACT,
  computeLayout,
  isCompact,
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
    expect(computeLayout(1200, 500).fontSize).toBe(LAYOUT.fontMin);
    expect(computeLayout(2000, 3000).fontSize).toBe(LAYOUT.fontMax);
    expect(computeLayout(320, 200).fontSize).toBe(COMPACT.fontMin);
    expect(computeLayout(720, 1200).fontSize).toBe(COMPACT.fontMax);
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

describe('phones', () => {
  it('are narrow screens, or short ones (the keyboard counts)', () => {
    expect(isCompact(360, 740)).toBe(true);
    expect(isCompact(412, 915)).toBe(true);
    expect(isCompact(740, 360)).toBe(true);
    expect(isCompact(1024, 370)).toBe(true); // tablet on its side, keyboard up
    for (const [width, height] of [[820, 1180], [1280, 640], [1366, 768], [1920, 1080]] as const) {
      expect(isCompact(width, height), `${width}×${height}`).toBe(false);
      expect(computeLayout(width, height)).toMatchObject({ compact: false, cannonScale: 1, fieldTop: LAYOUT.fieldTop });
    }
  });

  it('keep most of the room above the keyboard for the field', () => {
    const { perimeterY, fieldTop, fieldWidth } = computeLayout(360, 440);
    expect(perimeterY - fieldTop).toBeGreaterThan(300);
    expect(fieldWidth).toBeGreaterThan(330);
  });

  it('fit the cannon between the perimeter and the bottom', () => {
    const layout = computeLayout(360, 440);
    expect(muzzlePosition(layout, 0).y).toBeGreaterThan(layout.perimeterY);
    expect(layout.cannonY + LAYOUT.baseRadius * layout.cannonScale * 0.6).toBeLessThan(layout.height);
  });

  it('fit the longest word with room to spare', () => {
    const layout = computeLayout(320, 315);
    expect(14 * layout.fontSize * 0.6 + LAYOUT.wordPadX * 2).toBeLessThan(layout.fieldWidth * 0.5);
  });
});

// The Daily Challenge and the ranking are the same for everyone: a word takes the same time to
// reach the perimeter on every screen, with or without the keyboard (and nobody gains time by
// shrinking the window).
describe('fall time', () => {
  const SCREENS = [
    [1920, 1080],
    [1366, 768],
    [820, 1180],
    [360, 740],
    [360, 440],
    [320, 315],
  ] as const;

  it.each(SCREENS)('is the same on %i×%i; the speed in pixels follows the field', (width, height) => {
    const layout = computeLayout(width, height);
    const field = layout.perimeterY - layout.fieldTop;
    for (const tier of DIFFICULTIES) {
      const speed = CONFIG.spawn.speed[tier];
      const pixelsPerSecond = toScreenY(layout, speed) - toScreenY(layout, 0);
      expect(pixelsPerSecond).toBeCloseTo(speed * field);
      expect(field / pixelsPerSecond).toBeCloseTo(1 / speed);
    }
  });

  it('opening the keyboard keeps every word at the same point of its fall', () => {
    const open = computeLayout(360, 440);
    const closed = computeLayout(360, 740);
    const progress = (layout: typeof open, y: number) =>
      (toScreenY(layout, y) - layout.fieldTop) / (layout.perimeterY - layout.fieldTop);
    for (const y of [0, 0.3, 0.5, 0.99]) expect(progress(open, y)).toBeCloseTo(progress(closed, y));
  });

  it('the rules never see the screen', () => {
    const rules = import.meta.glob<string>('../{state,spawner,waves,boss,difficulty,specials,scoring,combo,targeting,burst}.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    expect(Object.keys(rules)).toHaveLength(10);
    for (const [file, code] of Object.entries(rules)) {
      expect(code, file).not.toMatch(/from '\.\/render\/|innerHeight|visualViewport|\bwindow\b|\bdocument\b/);
    }
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

  it('follows the size of the cannon', () => {
    const phone = computeLayout(360, 740);
    expect(muzzlePosition(phone, 0).y).toBeCloseTo(phone.cannonY - LAYOUT.barrelLength * COMPACT.cannonScale);
    expect(muzzlePosition(phone, Math.PI / 2).x).toBeCloseTo(phone.cannonX + LAYOUT.barrelLength * COMPACT.cannonScale);
  });
});
