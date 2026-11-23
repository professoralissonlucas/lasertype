import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { COLLECTIONS } from '../cosmetics/collections.ts';
import { dailyMissions } from '../progression/missions.ts';
import { applyGain, emptyGain, emptyProgress } from '../progression/progress.ts';
import { matchReport } from '../progression/testing.ts';
import type { Progress } from '../progression/types.ts';
import { chestCoins } from '../progression/xp.ts';
import { memoryStore } from '../utils/storage.ts';
import { dayIndex } from '../utils/day.ts';
import { Economy } from './Economy.ts';
import {
  INVENTORY_KEY,
  localInventoryRepository,
  PROGRESS_KEY,
  type InventoryRepository,
  type RepositoryPurchase,
  type RepositoryUnlock,
} from './repository.ts';
import { dailyShop } from './shop.ts';
import type { EconomyChange, Inventory } from './types.ts';
import { applyUnlock, emptyInventory } from './inventory.ts';

/** A match that completes no mission and does not level up. */
const quiet = (patch: Parameters<typeof matchReport>[0] = {}) =>
  matchReport({ letters: 1, destroyed: 1, maxCombo: 0, accuracy: 0.1, burst: 0, wave: 1, empUses: 0, score: 0, ...patch });

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
  let progress: Progress = emptyProgress();
  const listeners = new Set<(inventory: Inventory) => void>();
  const unlocks: { readonly itemId: string; readonly answer: (value: RepositoryUnlock) => void }[] = [];
  const repository: InventoryRepository = {
    load: () => state,
    progress: () => progress,
    reward: (amount, gain = emptyGain()) => {
      progress = applyGain(progress, gain).progress;
      return (state = { ...state, coins: state.coins + amount });
    },
    login: () => null,
    purchase: () => answer(),
    unlock: (itemId) => new Promise((resolve) => unlocks.push({ itemId, answer: resolve })),
    equip: (equipped) => (state = { ...state, equipped }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const push = (next: Inventory, nextProgress: Progress = progress) => {
    state = next;
    progress = nextProgress;
    for (const listener of listeners) listener(next);
  };
  /** The server releases the item asked for. */
  const release = (itemId: string) => {
    state = applyUnlock(state, itemId);
    unlocks.find((entry) => entry.itemId === itemId)?.answer({ ok: true, inventory: state });
  };
  return { repository, push, unlocks, release };
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
    const { coins } = economy.finishMatch(quiet({ score: 4200, grade: 'S', mode: 'zen' }));
    expect(coins.total).toBe(15); // floor(62 × 25%)
    expect(economy.finishMatch(quiet({ score: 4700, grade: 'D', mode: 'zen' })).coins.total).toBe(11);
    expect(economy.coins).toBe(26);
    expect(saved()).toMatchObject({ coins: 26 });
    expect(changes).toEqual([
      { type: 'reward', amount: 15 },
      { type: 'reward', amount: 11 },
    ]);
  });

  it('pays the full amount outside Zen', () => {
    const { economy, changes, saved } = setup();
    const { coins, completed } = economy.finishMatch(quiet({ score: 4200, grade: 'S' }));
    expect(coins.total).toBe(62);
    const missions = completed.reduce((sum, slot) => sum + (dailyMissions(dayIndex(NOON))[slot]?.coins ?? 0), 0);
    expect(economy.coins).toBe(62 + missions);
    expect(saved()).toMatchObject({ coins: 62 + missions });
    expect(changes).toEqual([{ type: 'reward', amount: 62 }]);
  });

  it('a match worth 0 coins changes nothing', () => {
    const { economy, changes, store } = setup();
    economy.finishMatch(quiet({ score: 0, grade: 'D', mode: 'zen', letters: 0, destroyed: 0 }));
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
    economy.finishMatch(matchReport());
    expect(seen).toEqual([]);
  });

  it('works without storage (private mode): keeps the session in memory', () => {
    const economy = new Economy(localInventoryRepository(null), () => NOON);
    economy.finishMatch(quiet({ score: 8000, grade: 'A', mode: 'zen' }));
    expect(economy.coins).toBe(22);
  });
});

describe('Economy — progression', () => {
  const DAY = dayIndex(NOON);

  it('a match gives XP, levels with their chests, and fills the missions of the day', () => {
    const { economy } = setup();
    const outcome = economy.finishMatch(matchReport({ letters: 600, destroyed: 60, score: 0, grade: 'D' }));
    expect(outcome.xp.total).toBe(720);
    expect(outcome.before).toEqual({ level: 1, into: 0, cost: 200 });
    expect(outcome.after).toEqual({ level: 3, into: 220, cost: 400 });
    expect(outcome.chests).toEqual([
      { type: 'chest', level: 2, coins: chestCoins(2) },
      { type: 'chest', level: 3, coins: chestCoins(3) },
    ]);
    expect(outcome.missions).toEqual(economy.missions());
    for (const slot of outcome.completed) expect(outcome.missions[slot]?.done).toBe(true);
    const missionCoins = outcome.completed.reduce((sum, slot) => sum + (outcome.missions[slot]?.coins ?? 0), 0);
    expect(economy.coins).toBe(chestCoins(2) + chestCoins(3) + missionCoins);
    expect(economy.level.level).toBe(3);
    expect(economy.progress.stats).toMatchObject({ games: 1, words: 60 });
  });

  it('the same mission is completed once', () => {
    const { economy } = setup();
    const report = matchReport({ letters: 9000, destroyed: 900, score: 99_999, maxCombo: 25, burst: 60, wave: 9, bosses: 1, empUses: 5 });
    const first = economy.finishMatch(report);
    expect(first.completed.length).toBeGreaterThan(0);
    expect(economy.finishMatch(report).completed.filter((slot) => first.completed.includes(slot))).toEqual([]);
  });

  it('missions start over when the game day turns', () => {
    const { economy, setTime } = setup();
    economy.finishMatch(matchReport({ letters: 9000, destroyed: 900 }));
    expect(economy.missions().some((view) => view.progress > 0)).toBe(true);
    setTime(NOON + DAY_MS);
    expect(economy.missions().every((view) => view.progress === 0 && !view.done)).toBe(true);
  });

  it('counts the login once per game day, and the streak across days', () => {
    const { economy, changes, setTime } = setup();
    expect(economy.claimLogin()).toEqual({ streak: 1, coins: 20 });
    expect(economy.claimLogin()).toBeNull();
    expect(economy.coins).toBe(20);
    expect(changes).toEqual([{ type: 'login', streak: 1, coins: 20 }]);
    setTime(NOON + DAY_MS);
    expect(economy.streak).toBe(1); // still alive, not counted yet
    expect(economy.claimLogin()).toEqual({ streak: 2, coins: 30 });
    setTime(NOON + 5 * DAY_MS);
    expect(economy.streak).toBe(0);
    expect(economy.claimLogin()).toEqual({ streak: 1, coins: 20 });
  });

  it('loads (and repairs) the saved progress', () => {
    const { economy } = setup({ [PROGRESS_KEY]: JSON.stringify({ xp: 650, level: 3, streak: 2, lastLogin: DAY - 1, owed: 'x' }) });
    expect(economy.level).toEqual({ level: 3, into: 150, cost: 400 });
    expect(economy.streak).toBe(2);
  });

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('reaching an achievement releases its item, free', async () => {
    const { economy, changes } = setup();
    const outcome = economy.finishMatch(matchReport({ burst: 104 }));
    expect(outcome.achievements.map((entry) => entry.id)).toEqual(['lightning']);
    await settle();
    expect(economy.owns('cannon_golden')).toBe(true);
    expect(changes.at(-1)).toEqual({ type: 'unlock', itemId: 'cannon_golden' });
    expect(economy.finishMatch(matchReport({ burst: 130 })).achievements).toEqual([]);
  });

  it('Zen never reaches an achievement', () => {
    const { economy } = setup();
    const outcome = economy.finishMatch(matchReport({ mode: 'zen', burst: 200, wave: 50, bosses: 10, maxCombo: 300 }));
    expect(outcome.achievements).toEqual([]);
    expect(economy.progress.stats).toEqual(emptyProgress().stats);
  });

  it('a seven-day streak releases the golden border', async () => {
    const { economy, setTime } = setup();
    for (let i = 0; i < 7; i++) {
      setTime(NOON + i * DAY_MS);
      economy.claimLogin();
    }
    await settle();
    expect(economy.owns('border_golden')).toBe(true);
    expect(economy.coins).toBe(20 + 30 + 40 + 60 + 80 + 110 + 150);
  });

  it('asks for an item once while the server answers, and announces it only when it did', async () => {
    const { repository, unlocks, release } = scripted(async () => ({ ok: false, error: 'offline' }));
    const economy = new Economy(repository, () => NOON);
    const changes: EconomyChange[] = [];
    economy.subscribe((_, change) => changes.push(change));
    economy.finishMatch(matchReport({ burst: 104 }));
    economy.finishMatch(matchReport({ burst: 104 }));
    expect(unlocks.map((entry) => entry.itemId)).toEqual(['cannon_golden']);
    expect(economy.owns('cannon_golden')).toBe(false);
    release('cannon_golden');
    await settle();
    expect(economy.owns('cannon_golden')).toBe(true);
    expect(changes.filter((change) => change.type === 'unlock')).toEqual([{ type: 'unlock', itemId: 'cannon_golden' }]);
  });

  it('a refusal (rules not published yet) waits before asking again; offline asks at the next chance', async () => {
    let time = NOON;
    const { repository, unlocks, push } = scripted(async () => ({ ok: false, error: 'offline' }));
    const economy = new Economy(repository, () => time);
    economy.finishMatch(matchReport({ burst: 104 }));
    unlocks[0]?.answer({ ok: false, error: 'refused' });
    await settle();
    economy.finishMatch(matchReport());
    expect(unlocks).toHaveLength(1);
    time += CONFIG.sync.retryMaxMs;
    economy.finishMatch(matchReport());
    expect(unlocks).toHaveLength(2);
    unlocks[1]?.answer({ ok: false, error: 'offline' });
    await settle();
    push(economy.inventory); // the account answered again
    expect(unlocks).toHaveLength(3);
  });

  it('an account that had already reached an achievement gets its item when it loads', () => {
    const { repository, unlocks, push } = scripted(async () => ({ ok: false, error: 'offline' }));
    const economy = new Economy(repository, () => NOON);
    const changes: EconomyChange[] = [];
    economy.subscribe((_, change) => changes.push(change));
    const progress = emptyProgress();
    push(economy.inventory, { ...progress, stats: { ...progress.stats, bestWave: 12 } });
    expect(changes).toEqual([{ type: 'sync' }]);
    expect(unlocks.map((entry) => entry.itemId)).toEqual(['theme_eclipse']);
  });

  it('wears and takes off the title of a complete collection', () => {
    const aurora = COLLECTIONS[0];
    if (!aurora) throw new Error('no collections');
    const owned = Object.fromEntries(aurora.items.map((item) => [item.id, true]));
    const { economy, changes, saved } = setup({ [INVENTORY_KEY]: JSON.stringify({ owned }) });
    expect(economy.equipTitle(aurora.titleId).ok).toBe(true);
    expect(saved()).toMatchObject({ equipped: { title: aurora.titleId } });
    expect(economy.equipTitle(null).ok).toBe(true);
    expect(economy.inventory.equipped).toEqual({});
    expect(changes).toEqual([
      { type: 'title', titleId: aurora.titleId },
      { type: 'title', titleId: null },
    ]);
    expect(economy.equipTitle('title_horizon')).toEqual({ ok: false, error: 'notOwned' });
  });
});
