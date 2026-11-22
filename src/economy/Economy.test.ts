import { describe, expect, it } from 'vitest';
import { memoryStore } from '../utils/storage.ts';
import { dayIndex } from '../utils/day.ts';
import { Economy } from './Economy.ts';
import { INVENTORY_KEY, localInventoryRepository } from './repository.ts';
import { dailyShop } from './shop.ts';
import type { EconomyChange } from './types.ts';

const NOON = Date.parse('2026-11-22T12:00:00Z');

function setup(initial: Record<string, string> = {}, now = NOON) {
  const store = memoryStore(initial);
  let time = now;
  const economy = new Economy(localInventoryRepository(store), () => time);
  const changes: EconomyChange[] = [];
  economy.subscribe((_, change) => changes.push(change));
  const saved = () => JSON.parse(store.data.get(INVENTORY_KEY) ?? 'null') as unknown;
  return { store, economy, changes, saved, setTime: (t: number) => (time = t) };
}

describe('Economy', () => {
  it('starts empty without saved data', () => {
    const { economy } = setup();
    expect(economy.coins).toBe(0);
    expect(economy.inventory.owned).toEqual({});
  });

  it('loads (and repairs) the saved inventory', () => {
    const { economy } = setup({ [INVENTORY_KEY]: JSON.stringify({ coins: 500.5, owned: { nope: true } }) });
    expect(economy.coins).toBe(500);
    expect(economy.inventory.owned).toEqual({});
  });

  it('credits match coins, saves them and reports the change', () => {
    const { economy, changes, saved } = setup();
    const reward = economy.rewardMatch({ score: 4200, grade: 'S', mode: 'survival' });
    expect(reward.total).toBe(62);
    expect(economy.coins).toBe(62);
    expect(saved()).toMatchObject({ coins: 62 });
    expect(changes).toEqual([{ type: 'reward', amount: 62 }]);
  });

  it('a match worth 0 coins changes nothing', () => {
    const { economy, changes, store } = setup();
    economy.rewardMatch({ score: 0, grade: 'D', mode: 'zen' });
    expect(changes).toEqual([]);
    expect(store.data.has(INVENTORY_KEY)).toBe(false);
  });

  it('buys from today’s shop at today’s price', () => {
    const { economy, changes, saved } = setup({ [INVENTORY_KEY]: JSON.stringify({ coins: 10_000 }) });
    const shop = economy.today();
    expect(shop).toEqual(dailyShop(dayIndex(NOON)));
    const deal = shop.offers[0];
    if (!deal) throw new Error('no deal');

    const result = economy.buy(deal.itemId);
    expect(result.ok).toBe(true);
    expect(economy.coins).toBe(10_000 - deal.price);
    expect(economy.owns(deal.itemId)).toBe(true);
    expect(saved()).toMatchObject({ lastPurchase: deal.itemId, owned: { [deal.itemId]: true } });
    expect(changes).toEqual([{ type: 'purchase', itemId: deal.itemId, price: deal.price }]);
  });

  it('does not save or notify a refused purchase', () => {
    const { economy, changes, store } = setup();
    const deal = economy.today().offers[0];
    expect(economy.buy(deal?.itemId ?? '')).toEqual({ ok: false, error: 'insufficient' });
    expect(changes).toEqual([]);
    expect(store.data.has(INVENTORY_KEY)).toBe(false);
  });

  it('equips owned items and reports the category', () => {
    const { economy, changes } = setup({ [INVENTORY_KEY]: JSON.stringify({ owned: { theme_void: true } }) });
    expect(economy.isEquipped('theme_void')).toBe(false);
    expect(economy.equip('theme_void').ok).toBe(true);
    expect(economy.isEquipped('theme_void')).toBe(true);
    expect(changes).toEqual([{ type: 'equip', itemType: 'theme', itemId: 'theme_void' }]);
    expect(economy.equip('cannon_halo')).toEqual({ ok: false, error: 'notOwned' });
  });

  it('switches to the next shop at 03:00 UTC', () => {
    const { economy, setTime } = setup({}, Date.parse('2026-11-22T02:59:00Z'));
    expect(economy.today().key).toBe('2026-11-21');
    expect(economy.msUntilRotation()).toBe(60_000);
    setTime(Date.parse('2026-11-22T03:00:00Z'));
    expect(economy.today().key).toBe('2026-11-22');
  });

  it('refuses yesterday’s offer once the day has turned', () => {
    const { economy, setTime } = setup({ [INVENTORY_KEY]: JSON.stringify({ coins: 100_000 }) });
    const yesterday = economy.today();
    setTime(NOON + 86_400_000);
    const today = economy.today();
    const gone = yesterday.offers.find((offer) => !today.offers.some((o) => o.itemId === offer.itemId));
    if (!gone) throw new Error('expected an offer to rotate out');
    expect(economy.buy(gone.itemId)).toEqual({ ok: false, error: 'notForSale' });
  });

  it('unsubscribe stops notifications', () => {
    const { economy } = setup();
    const seen: EconomyChange[] = [];
    const stop = economy.subscribe((_, change) => seen.push(change));
    stop();
    economy.rewardMatch({ score: 1000, grade: 'A', mode: 'survival' });
    expect(seen).toEqual([]);
  });

  it('works without storage (private mode): keeps the session in memory', () => {
    const economy = new Economy(localInventoryRepository(null), () => NOON);
    economy.rewardMatch({ score: 1000, grade: 'A', mode: 'survival' });
    expect(economy.coins).toBe(20);
  });
});
