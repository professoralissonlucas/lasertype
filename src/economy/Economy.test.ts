import { describe, expect, it } from 'vitest';
import { memoryStore } from '../utils/storage.ts';
import { dayIndex } from '../utils/day.ts';
import { Economy } from './Economy.ts';
import { INVENTORY_KEY, localInventoryRepository, type InventoryRepository, type RepositoryPurchase } from './repository.ts';
import { dailyShop } from './shop.ts';
import type { EconomyChange, Inventory } from './types.ts';
import { emptyInventory } from './inventory.ts';

const NOON = Date.parse('2026-11-22T12:00:00Z');
const DAY_MS = 86_400_000;

function setup(initial: Record<string, string> = {}, now = NOON) {
  const store = memoryStore(initial);
  let time = now;
  const economy = new Economy(localInventoryRepository(store), () => time);
  const changes: EconomyChange[] = [];
  economy.subscribe((_, change) => changes.push(change));
  const saved = () => JSON.parse(store.data.get(INVENTORY_KEY) ?? 'null') as unknown;
  return { store, economy, changes, saved, setTime: (t: number) => (time = t) };
}

/** A repository whose purchase answer each test scripts (like a server would). */
function scripted(answer: () => Promise<RepositoryPurchase>, coins = 10_000) {
  let state: Inventory = { ...emptyInventory(), coins };
  const listeners = new Set<(inventory: Inventory) => void>();
  const repository: InventoryRepository = {
    load: () => state,
    reward: (amount) => (state = { ...state, coins: state.coins + amount }),
    purchase: () => answer(),
    equip: (equipped) => (state = { ...state, equipped }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const push = (next: Inventory) => {
    state = next;
    for (const listener of listeners) listener(next);
  };
  return { repository, push };
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

  it('buys from today’s shop at today’s price', async () => {
    const { economy, changes, saved } = setup({ [INVENTORY_KEY]: JSON.stringify({ coins: 10_000 }) });
    const shop = economy.today();
    expect(shop).toEqual(dailyShop(dayIndex(NOON)));
    const deal = shop.offers[0];
    if (!deal) throw new Error('no deal');

    const result = await economy.buy(deal.itemId, shop.day);
    expect(result.ok).toBe(true);
    expect(economy.coins).toBe(10_000 - deal.price);
    expect(economy.owns(deal.itemId)).toBe(true);
    expect(saved()).toMatchObject({ lastPurchase: deal.itemId, owned: { [deal.itemId]: true } });
    expect(changes).toEqual([{ type: 'purchase', itemId: deal.itemId, price: deal.price }]);
  });

  it('does not save or notify a refused purchase', async () => {
    const { economy, changes, store } = setup();
    const deal = economy.today().offers[0];
    expect(await economy.buy(deal?.itemId ?? '')).toEqual({ ok: false, error: 'insufficient' });
    expect(changes).toEqual([]);
    expect(store.data.has(INVENTORY_KEY)).toBe(false);
  });

  it('equips owned items and reports the category', () => {
    const { economy, changes, saved } = setup({ [INVENTORY_KEY]: JSON.stringify({ owned: { theme_void: true } }) });
    expect(economy.isEquipped('theme_void')).toBe(false);
    expect(economy.equip('theme_void').ok).toBe(true);
    expect(economy.isEquipped('theme_void')).toBe(true);
    expect(saved()).toMatchObject({ equipped: { theme: 'theme_void' } });
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

  it('refuses yesterday’s offer once the day has turned', async () => {
    const { economy, setTime } = setup({ [INVENTORY_KEY]: JSON.stringify({ coins: 100_000 }) });
    const yesterday = economy.today();
    setTime(NOON + DAY_MS);
    const today = economy.today();
    const gone = yesterday.offers.find((offer) => !today.offers.some((o) => o.itemId === offer.itemId));
    if (!gone) throw new Error('expected an offer to rotate out');
    expect(await economy.buy(gone.itemId)).toEqual({ ok: false, error: 'notForSale' });
  });

  it('sends nothing when the shop the player saw is from another day', async () => {
    const { economy, setTime, changes } = setup({ [INVENTORY_KEY]: JSON.stringify({ coins: 100_000 }) });
    const shown = economy.today();
    setTime(NOON + DAY_MS);
    const deal = economy.today().offers[0];
    expect(await economy.buy(deal?.itemId ?? '', shown.day)).toEqual({ ok: false, error: 'dayChanged' });
    expect(economy.coins).toBe(100_000);
    expect(changes).toEqual([]);
  });

  it('a server refusal at the day turn reloads the shop and reports dayChanged', async () => {
    let time = NOON;
    const { repository } = scripted(async () => {
      time += DAY_MS; // the day turned while the transaction was on its way
      return { ok: false, error: 'refused' };
    });
    const economy = new Economy(repository, () => time);
    const shown = economy.today();
    const result = await economy.buy(shown.offers[0]?.itemId ?? '', shown.day);
    expect(result).toEqual({ ok: false, error: 'dayChanged' });
    expect(economy.today().day).toBe(shown.day + 1);
  });

  it('a server refusal on the same day reports refused (nothing charged)', async () => {
    const { repository } = scripted(async () => ({ ok: false, error: 'refused' }));
    const economy = new Economy(repository, () => NOON);
    const shop = economy.today();
    expect(await economy.buy(shop.offers[0]?.itemId ?? '', shop.day)).toEqual({ ok: false, error: 'refused' });
    expect(economy.coins).toBe(10_000);
  });

  it('passes on backend errors (offline, syncing) without charging', async () => {
    for (const error of ['offline', 'syncing'] as const) {
      const { repository } = scripted(async () => ({ ok: false, error }));
      const economy = new Economy(repository, () => NOON);
      expect(await economy.buy(economy.today().offers[0]?.itemId ?? '')).toEqual({ ok: false, error });
      expect(economy.coins).toBe(10_000);
    }
  });

  it('one purchase at a time while the server answers', async () => {
    let answer: (value: RepositoryPurchase) => void = () => undefined;
    const { repository } = scripted(() => new Promise((resolve) => (answer = resolve)));
    const economy = new Economy(repository, () => NOON);
    const [a, b] = economy.today().offers;
    const first = economy.buy(a?.itemId ?? '');
    expect(economy.purchasing).toBe(true);
    expect(await economy.buy(b?.itemId ?? '')).toEqual({ ok: false, error: 'busy' });
    answer({ ok: false, error: 'offline' });
    await first;
    expect(economy.purchasing).toBe(false);
  });

  it('takes the backend’s version as a sync change (only when it differs)', () => {
    const { repository, push } = scripted(async () => ({ ok: false, error: 'offline' }), 50);
    const economy = new Economy(repository, () => NOON);
    const changes: EconomyChange[] = [];
    economy.subscribe((_, change) => changes.push(change));
    push({ ...emptyInventory(), coins: 50 });
    expect(changes).toEqual([]);
    push({ ...emptyInventory(), coins: 700, owned: { theme_void: true } });
    expect(changes).toEqual([{ type: 'sync' }]);
    expect(economy.coins).toBe(700);
    expect(economy.owns('theme_void')).toBe(true);
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
