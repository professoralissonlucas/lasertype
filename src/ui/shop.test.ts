import { describe, expect, it } from 'vitest';
import { CATALOG, DEFAULT_ITEM_IDS } from '../cosmetics/catalog.ts';
import { emptyInventory } from '../economy/inventory.ts';
import type { DailyShop, Inventory } from '../economy/types.ts';
import { achievementFor } from '../progression/achievements.ts';
import { PreviewScript, type PreviewCue } from './previewScript.ts';
import { itemAction, itemSwatch } from './shopModel.ts';

const SHOP: DailyShop = {
  day: 0,
  key: '1970-01-01',
  offers: [{ itemId: 'laser_emerald', price: 210, basePrice: 300, discounted: true }],
};

describe('itemAction', () => {
  const inv = (patch: Partial<Inventory> = {}): Inventory => ({ ...emptyInventory(), ...patch });

  it('equipped item → nothing to do', () => {
    expect(itemAction(DEFAULT_ITEM_IDS.laserColor, inv(), SHOP)).toEqual({ kind: 'equipped' });
  });

  it('owned but not equipped → equip', () => {
    expect(itemAction('laser_emerald', inv({ owned: { laser_emerald: true } }), SHOP)).toEqual({ kind: 'equip' });
    const wearing = inv({ owned: { laser_emerald: true }, equipped: { laserColor: 'laser_emerald' } });
    expect(itemAction(DEFAULT_ITEM_IDS.laserColor, wearing, SHOP)).toEqual({ kind: 'equip' });
  });

  it('in today’s shop → buy, or how many coins are missing', () => {
    expect(itemAction('laser_emerald', inv({ coins: 210 }), SHOP)).toMatchObject({ kind: 'buy', offer: { price: 210 } });
    expect(itemAction('laser_emerald', inv({ coins: 200 }), SHOP)).toMatchObject({ kind: 'insufficient', missing: 10 });
  });

  it('not owned and not in the shop → unavailable', () => {
    expect(itemAction('cannon_halo', inv({ coins: 99_999 }), SHOP)).toEqual({ kind: 'unavailable' });
  });

  it('achievement item → how to get it, then equip', () => {
    expect(itemAction('cannon_golden', inv({ coins: 99_999 }), SHOP)).toEqual({
      kind: 'achievement',
      achievement: achievementFor('cannon_golden'),
    });
    expect(itemAction('cannon_golden', inv({ owned: { cannon_golden: true } }), SHOP)).toEqual({ kind: 'equip' });
  });
});

describe('itemSwatch', () => {
  it('gives two colors for every item', () => {
    for (const item of CATALOG) {
      const swatch = itemSwatch(item);
      expect(swatch).toHaveLength(2);
      for (const color of swatch) expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('PreviewScript', () => {
  const timing = { lead: 0.5, letter: 0.1, rest: 1 };

  function run(script: PreviewScript, seconds: number, dt = 1 / 60): PreviewCue[] {
    const cues: PreviewCue[] = [];
    for (let t = 0; t < seconds - 1e-9; t += dt) script.step(dt, cues);
    return cues;
  }

  it('shows a word right away, shoots every letter in order, then explodes it', () => {
    const script = new PreviewScript(['sol'], timing);
    const cues = run(script, 0.5 + 0.2 + 0.02);
    expect(cues).toEqual([
      { type: 'spawn', word: 'sol' },
      { type: 'hit', index: 0 },
      { type: 'hit', index: 1 },
      { type: 'hit', index: 2 },
      { type: 'destroy', word: 'sol' },
    ]);
    expect(script.word).toBe('');
  });

  it('rests, then moves on to the next word (looping)', () => {
    const script = new PreviewScript(['ab', 'cd'], timing);
    // One cycle = lead + (letters − 1) × letter + rest = 1.6 s: spawns at 0, 1.6 and 3.2 s.
    const cues = run(script, 2 * (0.5 + 0.1 + 1) + 0.05);
    expect(cues.filter((cue) => cue.type === 'spawn').map((cue) => cue.type === 'spawn' && cue.word)).toEqual([
      'ab',
      'cd',
      'ab',
    ]);
  });

  it('one big step gives the same cues as many small ones (no letter is skipped)', () => {
    const big: PreviewCue[] = [];
    new PreviewScript(['laser'], timing).step(5, big);
    const small = run(new PreviewScript(['laser'], timing), 5);
    expect(big).toEqual(small);
    // 'laser' takes 0.9 s to destroy + 1 s rest: three words in 5 s.
    expect(big.filter((cue) => cue.type === 'destroy')).toHaveLength(3);
    expect(big.filter((cue) => cue.type === 'hit')).toHaveLength(15);
  });

  it('reports typed letters and the word age', () => {
    const script = new PreviewScript(['luz'], timing);
    run(script, 0.62);
    expect(script.word).toBe('luz');
    expect(script.typed).toBe(2);
    expect(script.age).toBeCloseTo(0.62, 1);
  });
});
