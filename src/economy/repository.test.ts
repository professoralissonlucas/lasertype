import { describe, expect, it } from 'vitest';
import { memoryStore } from '../utils/storage.ts';
import { INVENTORY_KEY, localInventoryRepository } from './repository.ts';

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
