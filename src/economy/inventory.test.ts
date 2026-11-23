import { describe, expect, it } from 'vitest';
import { DEFAULT_ITEM_IDS } from '../cosmetics/catalog.ts';
import { COLLECTIONS } from '../cosmetics/collections.ts';
import {
  applyPurchase,
  applyUnlock,
  checkPurchase,
  emptyInventory,
  equip,
  equippedId,
  equipTitle,
  grantCoins,
  isEquipped,
  isOwned,
  parseInventory,
  purchase,
  sameInventory,
} from './inventory.ts';
import type { DailyShop, Inventory } from './types.ts';

const SHOP: DailyShop = {
  day: 0,
  key: '1970-01-01',
  offers: [
    { itemId: 'laser_emerald', price: 210, basePrice: 300, discounted: true },
    { itemId: 'cannon_halo', price: 6000, basePrice: 6000, discounted: false },
  ],
};

const rich = (coins = 10_000): Inventory => ({ ...emptyInventory(), coins });

describe('ownership', () => {
  it('default items are owned by everyone, others only once bought', () => {
    const inv = emptyInventory();
    expect(isOwned(inv, DEFAULT_ITEM_IDS.cannon)).toBe(true);
    expect(isOwned(inv, 'cannon_halo')).toBe(false);
    expect(isOwned({ ...inv, owned: { cannon_halo: true } }, 'cannon_halo')).toBe(true);
    expect(isOwned(inv, 'nope')).toBe(false);
  });

  it('nothing equipped = the default of each category', () => {
    const inv = emptyInventory();
    expect(equippedId(inv, 'theme')).toBe(DEFAULT_ITEM_IDS.theme);
    expect(isEquipped(inv, DEFAULT_ITEM_IDS.theme)).toBe(true);
    expect(isEquipped(inv, 'theme_void')).toBe(false);
  });
});

describe('grantCoins', () => {
  it('adds whole, non-negative coins', () => {
    expect(grantCoins(rich(10), 5).coins).toBe(15);
    expect(grantCoins(rich(10), 2.9).coins).toBe(12);
    expect(grantCoins(rich(10), -50).coins).toBe(10);
    expect(grantCoins(rich(10), Number.NaN).coins).toBe(10);
  });
});

describe('purchase', () => {
  it('pays today’s price, adds the item and records lastPurchase', () => {
    const result = purchase(rich(1000), SHOP, 'laser_emerald');
    expect(result).toEqual({
      ok: true,
      inventory: { coins: 790, owned: { laser_emerald: true }, equipped: {}, lastPurchase: 'laser_emerald' },
    });
  });

  it('refuses with too few coins (exact balance is enough)', () => {
    expect(purchase(rich(209), SHOP, 'laser_emerald')).toEqual({ ok: false, error: 'insufficient' });
    expect(purchase(rich(210), SHOP, 'laser_emerald').ok).toBe(true);
  });

  it('refuses items not in today’s shop, unknown items and items already owned', () => {
    expect(purchase(rich(), SHOP, 'theme_void')).toEqual({ ok: false, error: 'notForSale' });
    expect(purchase(rich(), SHOP, 'nope')).toEqual({ ok: false, error: 'unknown' });
    const owner = { ...rich(), owned: { cannon_halo: true as const } };
    expect(purchase(owner, SHOP, 'cannon_halo')).toEqual({ ok: false, error: 'owned' });
  });

  it('does not change the original inventory', () => {
    const inv = rich(1000);
    purchase(inv, SHOP, 'laser_emerald');
    expect(inv).toEqual(rich(1000));
  });

  it('checkPurchase returns today’s offer; applyPurchase pays a given price', () => {
    expect(checkPurchase(rich(1000), SHOP, 'laser_emerald')).toEqual({ ok: true, offer: SHOP.offers[0] });
    expect(checkPurchase(rich(10), SHOP, 'laser_emerald')).toEqual({ ok: false, error: 'insufficient' });
    expect(applyPurchase(rich(1000), 'cannon_halo', 600)).toEqual({
      coins: 400,
      owned: { cannon_halo: true },
      equipped: {},
      lastPurchase: 'cannon_halo',
    });
  });
});

describe('achievement items', () => {
  it('are released free, and recorded as the last item owned', () => {
    expect(applyUnlock(rich(50), 'cannon_golden')).toEqual({
      coins: 50,
      owned: { cannon_golden: true },
      equipped: {},
      lastPurchase: 'cannon_golden',
    });
  });

  it('are never for sale, even if a shop listed them', () => {
    expect(purchase(rich(), SHOP, 'cannon_golden')).toEqual({ ok: false, error: 'notForSale' });
  });

  it('survive a reload', () => {
    const inv = { ...applyUnlock(rich(), 'theme_eclipse'), equipped: { theme: 'theme_eclipse' } };
    expect(parseInventory(JSON.parse(JSON.stringify(inv)))).toEqual(inv);
  });
});

describe('titles', () => {
  const aurora = COLLECTIONS[0];
  if (!aurora) throw new Error('no collections');
  const owned = Object.fromEntries(aurora.items.map((item) => [item.id, true as const]));
  const complete: Inventory = { ...rich(), owned, equipped: { theme: 'theme_aurora' } };

  it('are worn with the whole collection, next to the rest', () => {
    const result = equipTitle(complete, aurora.titleId);
    expect(result.ok && result.inventory.equipped).toEqual({ theme: 'theme_aurora', title: aurora.titleId });
  });

  it('can be taken off', () => {
    const result = equipTitle({ ...complete, equipped: { ...complete.equipped, title: aurora.titleId } }, null);
    expect(result.ok && result.inventory.equipped).toEqual({ theme: 'theme_aurora' });
  });

  it('are refused without the whole collection, or when unknown', () => {
    expect(equipTitle(rich(), aurora.titleId)).toEqual({ ok: false, error: 'notOwned' });
    expect(equipTitle(complete, 'title_nope')).toEqual({ ok: false, error: 'notOwned' });
  });

  it('survive a reload only with the whole collection', () => {
    const worn = { ...complete, equipped: { title: aurora.titleId } };
    expect(parseInventory(worn).equipped).toEqual({ title: aurora.titleId });
    expect(parseInventory({ ...worn, owned: {} }).equipped).toEqual({});
    expect(parseInventory({ ...worn, equipped: { title: 'title_nope' } }).equipped).toEqual({});
  });
});

describe('sameInventory', () => {
  it('compares coins, items, equipment and last purchase by value', () => {
    const a: Inventory = { coins: 5, owned: { cannon_halo: true }, equipped: { cannon: 'cannon_halo' }, lastPurchase: 'cannon_halo' };
    expect(sameInventory(a, JSON.parse(JSON.stringify(a)) as Inventory)).toBe(true);
    expect(sameInventory(a, { ...a, coins: 6 })).toBe(false);
    expect(sameInventory(a, { ...a, owned: {} })).toBe(false);
    expect(sameInventory(a, { ...a, equipped: {} })).toBe(false);
    expect(sameInventory(a, { ...a, lastPurchase: null })).toBe(false);
  });
});

describe('equip', () => {
  it('equips owned items in their category', () => {
    const inv = { ...rich(), owned: { cannon_halo: true as const } };
    const result = equip(inv, 'cannon_halo');
    expect(result.ok && result.inventory.equipped).toEqual({ cannon: 'cannon_halo' });
  });

  it('can go back to a default item', () => {
    const inv: Inventory = { ...rich(), owned: { cannon_halo: true }, equipped: { cannon: 'cannon_halo' } };
    const result = equip(inv, DEFAULT_ITEM_IDS.cannon);
    expect(result.ok && result.inventory.equipped.cannon).toBe(DEFAULT_ITEM_IDS.cannon);
  });

  it('refuses items not owned and unknown items', () => {
    expect(equip(rich(), 'cannon_halo')).toEqual({ ok: false, error: 'notOwned' });
    expect(equip(rich(), 'nope')).toEqual({ ok: false, error: 'unknown' });
  });
});

describe('parseInventory', () => {
  it('returns an empty inventory for missing or broken data', () => {
    for (const raw of [undefined, null, 42, 'x', []]) expect(parseInventory(raw)).toEqual(emptyInventory());
  });

  it('keeps a valid inventory as is', () => {
    const inv: Inventory = {
      coins: 1234,
      owned: { cannon_halo: true, theme_void: true },
      equipped: { cannon: 'cannon_halo', theme: DEFAULT_ITEM_IDS.theme },
      lastPurchase: 'theme_void',
    };
    expect(parseInventory(JSON.parse(JSON.stringify(inv)))).toEqual(inv);
  });

  it('fixes bad coins', () => {
    expect(parseInventory({ coins: -5 }).coins).toBe(0);
    expect(parseInventory({ coins: 12.7 }).coins).toBe(12);
    expect(parseInventory({ coins: '999' }).coins).toBe(0);
    expect(parseInventory({ coins: Number.POSITIVE_INFINITY }).coins).toBe(0);
  });

  it('drops unknown, default and non-true ownership entries', () => {
    const inv = parseInventory({
      owned: { cannon_halo: true, nope: true, [DEFAULT_ITEM_IDS.cannon]: true, theme_void: 'yes' },
    });
    expect(inv.owned).toEqual({ cannon_halo: true });
  });

  it('drops equipped items that are unknown, not owned or in the wrong category', () => {
    const inv = parseInventory({
      owned: { cannon_halo: true },
      equipped: { cannon: 'cannon_halo', theme: 'theme_void', laserColor: 'cannon_halo', explosion: 'nope', wordBorder: 7 },
    });
    expect(inv.equipped).toEqual({ cannon: 'cannon_halo' });
  });

  it('keeps lastPurchase only when it is owned', () => {
    expect(parseInventory({ owned: { cannon_halo: true }, lastPurchase: 'cannon_halo' }).lastPurchase).toBe('cannon_halo');
    expect(parseInventory({ lastPurchase: 'cannon_halo' }).lastPurchase).toBeNull();
  });
});
