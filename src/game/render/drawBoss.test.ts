// The boss's geometry (pure) and its drawing on a stand-in 2D context: the phrase always fits
// the play field, the plate ends exactly at the perimeter, and the context comes back clean.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_COSMETICS } from '../../cosmetics/equip.ts';
import { getBossPhrases } from '../../words/index.ts';
import { BOSS_TIERS, LANGUAGES } from '../../words/types.ts';
import {
  bossCenterX,
  bossLetterX,
  bossTop,
  bossWordX,
  bossWordY,
  BOSS_COMPACT,
  BOSS_LAYOUT,
  computeBossPlate,
  wrapBalanced,
  wrapWords,
} from './bossLayout.ts';
import { drawBoss, type BossView } from './drawBoss.ts';
import { computeLayout } from './layout.ts';
import { Skin } from './skin.ts';

const PHRASES = LANGUAGES.flatMap((lang) => BOSS_TIERS.flatMap((tier) => getBossPhrases(lang)[tier]));
const SCREENS = [
  [320, 315], // a small phone and a phone with the keyboard up
  [360, 440],
  [360, 640],
  [390, 844],
  [820, 1180],
  [1280, 720],
  [1366, 640],
  [1920, 1080],
] as const;
/** JetBrains Mono: about 0.6 em per character. */
const charOf = (fontSize: number) => fontSize * 0.6;

describe('wrapping', () => {
  it('fills lines up to the width', () => {
    expect(wrapWords([4, 4, 4], 1, 9)).toEqual([0, 0, 1]);
    expect(wrapWords([4, 4, 4], 1, 14)).toEqual([0, 0, 0]);
    expect(wrapWords([4, 12, 4], 1, 6)).toEqual([0, 1, 2]); // a long word gets its own line
  });

  it('balances the lines without adding any', () => {
    // Greedy: 3 words + 1. Balanced: 2 + 2.
    expect(wrapWords([5, 5, 5, 5], 1, 17)).toEqual([0, 0, 0, 1]);
    expect(wrapBalanced([5, 5, 5, 5], 1, 17)).toEqual([0, 0, 1, 1]);
    expect(wrapBalanced([5, 5], 1, 40)).toEqual([0, 0]);
  });
});

describe.each(SCREENS)('boss plate on %i×%i', (width, height) => {
  const layout = computeLayout(width, height);
  const charWidth = charOf(layout.fontSize);
  const { sideGap, padX } = layout.compact ? BOSS_COMPACT : BOSS_LAYOUT;

  it('every phrase fits inside the play field, in order and without overlaps', () => {
    for (const phrase of PHRASES) {
      const plate = computeBossPlate(layout, charWidth, phrase.split(' '));
      expect(plate.width, phrase).toBeLessThanOrEqual(layout.fieldWidth - 2 * sideGap + 0.5);
      expect(plate.words.map((word) => word.text).join(' ')).toBe(phrase);
      for (const [i, word] of plate.words.entries()) {
        expect(Math.abs(word.x + word.width / 2) + word.width / 2).toBeLessThanOrEqual(plate.width / 2 - padX + 0.5);
        const next = plate.words[i + 1];
        if (next?.line === word.line) expect(next.x).toBeGreaterThan(word.x + word.width);
        else if (next) expect(next.line).toBe(word.line + 1);
      }
    }
  });

  it('rests under the top of the field and its lower edge reaches the perimeter at y = 1', () => {
    for (const phrase of PHRASES) {
      const plate = computeBossPlate(layout, charWidth, phrase.split(' '));
      expect(bossTop(layout, plate, 1, 1) + plate.height).toBeCloseTo(layout.perimeterY);
      expect(bossTop(layout, plate, 0, 1)).toBeGreaterThan(layout.fieldTop);
      expect(bossTop(layout, plate, 0, 1) + plate.height).toBeLessThan(layout.perimeterY - 60);
      // Arrives from above the screen, without a jump when the alert ends.
      expect(bossTop(layout, plate, 0, 0) + plate.height).toBeLessThan(0);
      expect(bossTop(layout, plate, 0, 0.9999)).toBeCloseTo(bossTop(layout, plate, 0, 1), 1);
    }
  });
});

describe('where the laser lands', () => {
  const layout = computeLayout(1280, 720);
  const plate = computeBossPlate(layout, 12, ['sol', 'mar']);

  it('follows the letters of each word', () => {
    expect(bossLetterX(layout, plate, 0, 0)).toBeCloseTo(bossWordX(layout, plate, 0) + plate.charWidth / 2);
    expect(bossLetterX(layout, plate, 1, 2)).toBeCloseTo(bossWordX(layout, plate, 1) + 2.5 * plate.charWidth);
    // A single centered line: the words mirror each other around the center.
    const center = bossCenterX(layout);
    expect(center - bossWordX(layout, plate, 0)).toBeCloseTo(bossWordX(layout, plate, 1) + 3 * plate.charWidth - center);
    expect(bossWordY(plate, 100, 0)).toBeCloseTo(100 + plate.height / 2);
  });
});

describe('drawBoss', () => {
  const texts: { text: string; alpha: number }[] = [];
  let depth = 0;

  function fakeContext(): CanvasRenderingContext2D {
    const state: Record<string, unknown> = { globalAlpha: 1, globalCompositeOperation: 'source-over', shadowBlur: 0 };
    const stack: Record<string, unknown>[] = [];
    const methods: Record<string, unknown> = {
      save: () => {
        stack.push({ ...state });
        depth++;
      },
      restore: () => {
        Object.assign(state, stack.pop());
        depth--;
      },
      fillText: (text: string) => texts.push({ text, alpha: state.globalAlpha as number }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
    };
    return new Proxy(state, {
      get: (target, key: string) => (key in target ? target[key] : (methods[key] ?? (() => {}))),
      set: (target, key: string, value) => {
        target[key] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
  }

  beforeAll(() => {
    const context = fakeContext();
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () =>
          Object.assign(context, {
            createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          }),
      }),
    });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  const layout = computeLayout(1280, 720);
  const words = ['nossa', 'estação', 'resiste'];
  const plate = computeBossPlate(layout, 12, words);
  const view: BossView = { x: 640, top: 120, entrance: 1, heat: 0, missFlash: false, time: 1.3, reduced: false, dpr: 2, font: '20px mono' };

  function draw(index: number, typed: number, patch: Partial<BossView> = {}): CanvasRenderingContext2D {
    texts.length = 0;
    const ctx = fakeContext();
    drawBoss(ctx, new Skin(DEFAULT_COSMETICS), { words, index, typed }, plate, { ...view, ...patch });
    return ctx;
  }

  it.each([
    ['arriving', 0, 0, { entrance: 0.4 }],
    ['whole', 0, 0, {}],
    ['half typed', 1, 3, {}],
    ['after an error', 1, 3, { missFlash: true }],
    ['last word, reduced effects', 2, 1, { reduced: true }],
    ['nothing left', 3, 0, {}],
    ['about to blow up', 3, 0, { heat: 0.8 }],
  ] as const)('leaves the context as it found it: %s', (_, index, typed, patch) => {
    const ctx = draw(index, typed, patch);
    expect(depth).toBe(0);
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.shadowBlur).toBe(0);
  });

  it('writes the words that are left, the current one split at the typed letters', () => {
    draw(0, 0);
    expect(texts.map((t) => t.text)).toEqual(words);
    draw(1, 3);
    expect(texts.map((t) => t.text)).toEqual(['est', 'ação', 'resiste']);
    draw(3, 0);
    expect(texts).toEqual([]);
  });

  it('is dim while it arrives; then the word to type stands out', () => {
    draw(0, 0, { entrance: 0.5 });
    expect(new Set(texts.map((t) => t.alpha)).size).toBe(1);
    expect(texts[0]?.alpha).toBeLessThan(0.6);
    draw(0, 0);
    expect(texts[0]?.alpha).toBe(1);
    expect(texts[1]?.alpha).toBeLessThan(1);
  });
});
