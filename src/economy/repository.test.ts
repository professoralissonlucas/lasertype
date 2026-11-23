import { describe, expect, it } from 'vitest';
import { loginGain, matchGain } from '../progression/progress.ts';
import { matchReport } from '../progression/testing.ts';
import { chestCoins } from '../progression/xp.ts';
import { memoryStore } from '../utils/storage.ts';
import { INVENTORY_KEY, localInventoryRepository, PROGRESS_KEY } from './repository.ts';

describe('localInventoryRepository (offline builds)', () => {
  const saved = (store: ReturnType<typeof memoryStore>) => JSON.parse(store.data.get(INVENTORY_KEY) ?? 'null') as unknown;

  it('credits coins and saves them', () => {
    const store = memoryStore();
    const repo = localInventoryRepository(store);
    expect(repo.reward(40).coins).toBe(40);
    expect(repo.reward(2.9).coins).toBe(42);
    expect(saved(store)).toMatchObject({ coins: 42 });
  });

  it('buys at the given price, refusing owned items and missing coins', async () => {
    const store = memoryStore({ [INVENTORY_KEY]: JSON.stringify({ coins: 1000 }) });
    const repo = localInventoryRepository(store);
    expect(await repo.purchase('cannon_twin', 2000)).toEqual({ ok: false, error: 'insufficient' });
    const bought = await repo.purchase('cannon_twin', 900);
    expect(bought).toEqual({
      ok: true,
      inventory: { coins: 100, owned: { cannon_twin: true }, equipped: {}, lastPurchase: 'cannon_twin' },
    });
    expect(await repo.purchase('cannon_twin', 0)).toEqual({ ok: false, error: 'owned' });
    expect(saved(store)).toMatchObject({ coins: 100, owned: { cannon_twin: true } });
  });

  it('saves what is equipped and survives a reload', () => {
    const store = memoryStore({ [INVENTORY_KEY]: JSON.stringify({ owned: { theme_void: true } }) });
    localInventoryRepository(store).equip({ theme: 'theme_void' });
    expect(localInventoryRepository(store).load().equipped).toEqual({ theme: 'theme_void' });
  });

  it('credits XP, chests and statistics at once (no server, no limit) and survives a reload', () => {
    const store = memoryStore();
    const repo = localInventoryRepository(store);
    const gain = { ...matchGain(matchReport({ destroyed: 5, letters: 490, score: 0, maxCombo: 0 }), 20_000), missions: [] };
    expect(repo.reward(10, gain).coins).toBe(10 + chestCoins(2) + chestCoins(3));
    expect(repo.progress()).toMatchObject({ xp: 500, level: 3, owed: 0 });
    const again = localInventoryRepository(store);
    expect(again.progress()).toEqual(repo.progress());
    expect(again.load()).toEqual(repo.load());
  });

  it('counts a login once per day', () => {
    const store = memoryStore();
    const repo = localInventoryRepository(store);
    expect(repo.login(20_000)).toEqual({ streak: 1, coins: 20 });
    expect(repo.load().coins).toBe(20);
    expect(repo.login(20_000)).toBeNull();
    expect(localInventoryRepository(store).login(20_000)).toBeNull();
    expect(localInventoryRepository(store).login(20_001)).toEqual({ streak: 2, coins: 30 });
    expect(JSON.parse(store.data.get(PROGRESS_KEY) ?? '{}')).toMatchObject({ streak: 2, lastLogin: 20_001 });
    expect(loginGain(1).logins).toEqual([1]);
  });

  it('releases achievement items for free', async () => {
    const store = memoryStore({ [INVENTORY_KEY]: JSON.stringify({ coins: 70 }) });
    const repo = localInventoryRepository(store);
    expect(await repo.unlock('cannon_golden')).toMatchObject({ ok: true, inventory: { coins: 70, owned: { cannon_golden: true } } });
    expect(localInventoryRepository(store).load().owned).toEqual({ cannon_golden: true });
  });

  it('a broken saved progress starts over', () => {
    const repo = localInventoryRepository(memoryStore({ [PROGRESS_KEY]: '{"xp":"lots"' }));
    expect(repo.progress()).toMatchObject({ xp: 0, level: 1, streak: 0 });
  });

  it('never reports outside changes', () => {
    const repo = localInventoryRepository(null);
    const stop = repo.subscribe(() => {
      throw new Error('unexpected');
    });
    repo.reward(10);
    stop();
    expect(repo.load().coins).toBe(10);
  });
});
