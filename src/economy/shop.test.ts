import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { CATALOG, DISCOUNT_ORDER, getItem, isPurchasable } from '../cosmetics/catalog.ts';
import type { CosmeticItem } from '../cosmetics/types.ts';
import { dayIndex } from '../utils/day.ts';
import { dailyShop, discountedItemId, discountedPrice, shopSeed } from './shop.ts';

const DAY = dayIndex(Date.parse('2026-11-22T12:00:00Z'));
const days = (count: number): number[] => Array.from({ length: count }, (_, i) => DAY + i);

describe('discountedPrice', () => {
  it('is Math.floor(price * 7 / 100) * 10 for every rarity price (firestore.rules)', () => {
    expect(discountedPrice(300)).toBe(210);
    expect(discountedPrice(900)).toBe(630);
    expect(discountedPrice(2500)).toBe(1750);
    expect(discountedPrice(6000)).toBe(4200);
  });

  it('rounds down to a multiple of 10, in integer math', () => {
    expect(discountedPrice(1234)).toBe(860); // 8638 / 100 → 86 → 860
    expect(discountedPrice(15)).toBe(10);
    for (let price = 0; price <= 10_000; price += 10) {
      expect(discountedPrice(price)).toBe(Math.floor((price * 7) / 100) * 10);
    }
  });
});

describe('discountedItemId', () => {
  it('is DISCOUNT_ORDER[dayIndex % length] (no rng)', () => {
    for (const day of days(40)) expect(discountedItemId(day)).toBe(DISCOUNT_ORDER[day % DISCOUNT_ORDER.length]);
  });

  it('cycles through every purchasable item, once per cycle', () => {
    const start = DAY - (DAY % DISCOUNT_ORDER.length);
    const cycle = days(DISCOUNT_ORDER.length).map((_, i) => discountedItemId(start + i));
    expect(cycle).toEqual(DISCOUNT_ORDER);
  });

  it('wraps negative days too', () => {
    expect(discountedItemId(-1)).toBe(DISCOUNT_ORDER[DISCOUNT_ORDER.length - 1]);
  });
});

describe('dailyShop', () => {
  it('is the same for everyone on the same day', () => {
    expect(dailyShop(DAY)).toEqual(dailyShop(DAY));
  });

  it('follows the game day (turns at 03:00 UTC)', () => {
    const before = dailyShop(dayIndex(Date.parse('2026-11-22T02:59:00Z')));
    const after = dailyShop(dayIndex(Date.parse('2026-11-22T03:00:00Z')));
    expect(before.key).toBe('2026-11-21');
    expect(after.key).toBe('2026-11-22');
    expect(after.day - before.day).toBe(1);
  });

  it('seeds the random part with the date', () => {
    expect(shopSeed(dayIndex(Date.parse('2026-11-22T12:00:00Z')))).toBe('shop:2026-11-22');
  });

  it.each(days(30))('day %i: 4 distinct purchasable items, exactly 1 discounted', (day) => {
    const shop = dailyShop(day);
    expect(shop.offers).toHaveLength(CONFIG.economy.shopSize);
    const ids = shop.offers.map((offer) => offer.itemId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      const item = getItem(id);
      expect(item && isPurchasable(item), id).toBe(true);
    }
    expect(shop.offers.filter((offer) => offer.discounted)).toHaveLength(1);
  });

  it.each(days(30))('day %i: the discounted item comes first, from DISCOUNT_ORDER, at 70% (floor to 10)', (day) => {
    const [deal, ...others] = dailyShop(day).offers;
    expect(deal?.itemId).toBe(DISCOUNT_ORDER[day % DISCOUNT_ORDER.length]);
    expect(deal?.discounted).toBe(true);
    const base = getItem(deal?.itemId ?? '')?.price ?? 0;
    expect(deal?.basePrice).toBe(base);
    expect(deal?.price).toBe(Math.floor((base * 7) / 100) * 10);
    for (const offer of others) {
      expect(offer.discounted).toBe(false);
      expect(offer.price).toBe(getItem(offer.itemId)?.price);
      expect(offer.itemId).not.toBe(deal?.itemId);
    }
  });

  it.each(days(30))('day %i: one item per category', (day) => {
    const types = dailyShop(day).offers.map((offer) => getItem(offer.itemId)?.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('rotates the random items from day to day', () => {
    const sets = new Set(days(20).map((day) => dailyShop(day).offers.slice(1).map((o) => o.itemId).sort().join()));
    expect(sets.size).toBeGreaterThan(5);
  });

  it('the random part depends only on the date seed, not on the discount', () => {
    // A different discount list that happens to give the same deal today → same shop.
    const deal = discountedItemId(DAY);
    const other = [...DISCOUNT_ORDER].reverse();
    const slot = DAY % other.length;
    const from = other.indexOf(deal);
    [other[slot], other[from]] = [deal, other[slot] ?? ''];
    expect(other).not.toEqual(DISCOUNT_ORDER);
    const b = dailyShop(DAY, { catalog: CATALOG, discountOrder: other, config: CONFIG.economy });
    expect(b.offers).toEqual(dailyShop(DAY).offers);
  });

  it('fills the shop from repeated categories when there are not enough categories', () => {
    const item = (id: string, type: CosmeticItem['type']): CosmeticItem => {
      const base = CATALOG.find((entry) => entry.type === type);
      if (!base) throw new Error('no base');
      return { ...base, id, price: 300 } as CosmeticItem;
    };
    const catalog = [item('a1', 'cannon'), item('a2', 'cannon'), item('b1', 'theme'), item('b2', 'theme'), item('b3', 'theme')];
    const shop = dailyShop(0, { catalog, discountOrder: ['a1', 'a2', 'b1', 'b2', 'b3'], config: CONFIG.economy });
    expect(shop.offers).toHaveLength(4);
    expect(new Set(shop.offers.map((o) => o.itemId)).size).toBe(4);
    expect(shop.offers[0]?.itemId).toBe('a1');
  });

  it('never sells default or achievement-only items', () => {
    for (const day of days(60)) {
      for (const offer of dailyShop(day).offers) expect(offer.basePrice).toBeGreaterThan(0);
    }
  });
});
