import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { PALETTE } from '../game/render/palette.ts';
import { LANGUAGES } from '../words/types.ts';
import { CATALOG, DEFAULT_ITEM_IDS, DISCOUNT_ORDER, getItem, isAchievementItem, isPurchasable, itemsOfType } from './catalog.ts';
import { DEFAULT_COSMETICS, resolveCosmetics, withItem } from './equip.ts';
import { COSMETIC_TYPES, type CosmeticItem } from './types.ts';

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Every string param that looks like a color, recursively. */
function colorsOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string' && value.startsWith('#')) out.push(value);
  else if (Array.isArray(value)) for (const entry of value) colorsOf(entry, out);
  else if (typeof value === 'object' && value !== null) for (const entry of Object.values(value)) colorsOf(entry, out);
  return out;
}

describe('catalog', () => {
  it('has per category the free default first, 3 items on sale and 1 achievement item last', () => {
    for (const type of COSMETIC_TYPES) {
      const items = itemsOfType(type);
      expect(items, type).toHaveLength(5);
      expect(items[0]?.price, type).toBe(0);
      expect(items[0]?.id).toBe(DEFAULT_ITEM_IDS[type]);
      expect(items.filter((item) => item.price === 0), type).toHaveLength(1);
      expect(items.slice(1, 4).every(isPurchasable), type).toBe(true);
      expect(items[4] && isAchievementItem(items[4]), type).toBe(true);
    }
    expect(CATALOG).toHaveLength(COSMETIC_TYPES.length * 5);
  });

  it('achievement items can never be on sale', () => {
    for (const item of CATALOG.filter(isAchievementItem)) {
      expect(isPurchasable(item), item.id).toBe(false);
      expect(DISCOUNT_ORDER).not.toContain(item.id);
      expect(item.unlock, item.id).toBeTruthy();
    }
  });

  it('has unique ids and finds items by id', () => {
    const ids = CATALOG.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of CATALOG) expect(getItem(item.id)).toBe(item);
    expect(getItem('nope')).toBeUndefined();
  });

  it('prices purchasable items by rarity', () => {
    for (const item of CATALOG.filter(isPurchasable)) {
      expect(item.price, item.id).toBe(CONFIG.economy.rarityPrice[item.rarity]);
    }
  });

  it('names every item in every language', () => {
    for (const item of CATALOG) {
      for (const lang of LANGUAGES) expect(item.name[lang].length, `${item.id}.${lang}`).toBeGreaterThan(0);
    }
  });

  it('uses only #RRGGBB colors', () => {
    for (const item of CATALOG) for (const color of colorsOf(item.params)) expect(color, item.id).toMatch(HEX);
  });

  it('DISCOUNT_ORDER lists every purchasable item exactly once', () => {
    const purchasable = CATALOG.filter(isPurchasable).map((item) => item.id);
    expect([...DISCOUNT_ORDER].sort()).toEqual([...purchasable].sort());
    expect(new Set(DISCOUNT_ORDER).size).toBe(DISCOUNT_ORDER.length);
  });

  it('DISCOUNT_ORDER alternates categories (two days in a row never discount the same kind)', () => {
    for (let i = 0; i < DISCOUNT_ORDER.length; i++) {
      const a = getItem(DISCOUNT_ORDER[i] ?? '')?.type;
      const b = getItem(DISCOUNT_ORDER[(i + 1) % DISCOUNT_ORDER.length] ?? '')?.type;
      expect(a).not.toBe(b);
    }
  });
});

describe('resolveCosmetics', () => {
  const everything = () => true;
  const nothing = () => false;

  it('gives the defaults when nothing is equipped', () => {
    expect(resolveCosmetics({}, everything)).toEqual(DEFAULT_COSMETICS);
  });

  it('defaults reproduce the original look (the cannon: the sober Sentinel)', () => {
    expect(DEFAULT_COSMETICS.laserColor).toEqual({ core: PALETTE.text, glow: PALETTE.primary, width: 1 });
    expect(DEFAULT_COSMETICS.theme.nebula).toEqual([PALETTE.primary, PALETTE.danger]);
    expect(DEFAULT_COSMETICS.cannon).toMatchObject({ body: 'armored', barrel: 'single', opacity: 1 });
    expect(DEFAULT_COSMETICS.wordBorder).toMatchObject({ shape: 'rounded', color: PALETTE.muted, alpha: 0.35 });
    expect(DEFAULT_COSMETICS.explosion).toMatchObject({ letters: 'scatter', debrisCount: 1, rings: 1, inward: false });
  });

  it('uses equipped items the player owns', () => {
    const resolved = resolveCosmetics({ cannon: 'cannon_halo', theme: 'theme_void' }, everything);
    expect(resolved.cannon).toBe(getItem('cannon_halo')?.params);
    expect(resolved.theme).toBe(getItem('theme_void')?.params);
    expect(resolved.laserColor).toBe(DEFAULT_COSMETICS.laserColor);
  });

  it('falls back to the default for items not owned, unknown or in the wrong category', () => {
    expect(resolveCosmetics({ cannon: 'cannon_halo' }, nothing).cannon).toBe(DEFAULT_COSMETICS.cannon);
    expect(resolveCosmetics({ cannon: 'nope' }, everything).cannon).toBe(DEFAULT_COSMETICS.cannon);
    expect(resolveCosmetics({ cannon: 'theme_void' }, everything).cannon).toBe(DEFAULT_COSMETICS.cannon);
  });
});

describe('withItem', () => {
  it('swaps only the item’s category', () => {
    for (const item of CATALOG) {
      const result = withItem(DEFAULT_COSMETICS, item as CosmeticItem);
      for (const type of COSMETIC_TYPES) {
        expect(result[type]).toBe(type === item.type ? item.params : DEFAULT_COSMETICS[type]);
      }
    }
  });
});

describe('cannons', () => {
  const cannons = itemsOfType('cannon');

  it('each has its own body (the golden one is the Sentinel in gold, with another barrel); only the twin has two barrels', () => {
    const plain = cannons.filter((item) => !isAchievementItem(item));
    expect(new Set(plain.map((item) => item.params.body)).size).toBe(plain.length);
    expect(new Set(cannons.map(({ params }) => `${params.body}+${params.barrel}`)).size).toBe(cannons.length);
    for (const item of cannons) {
      const { params } = item;
      expect(params.opacity, item.id).toBeGreaterThan(0);
      expect(params.opacity, item.id).toBeLessThanOrEqual(1);
      expect(params.barrel === 'twin', item.id).toBe(item.id === 'cannon_twin');
    }
  });

  it('the crystal is translucent, the others solid metal', () => {
    for (const item of cannons) expect(item.params.opacity < 1, item.id).toBe(item.params.body === 'crystal');
  });
});
