// Where the inventory lives. Two implementations of the same interface:
// - localInventoryRepository: localStorage only (offline builds, without VITE_FIREBASE_*);
// - FirestoreInventoryRepository (firestoreRepository.ts): users/{uid} in Firestore, with
//   localStorage as a cache.
// The interface is one method per kind of change (not "save the whole inventory") because
// firestore.rules accepts exactly one kind of change per write: reward, purchase or equip.
import { loadJson, saveJson, type KeyValueStore } from '../utils/storage.ts';
import { applyPurchase, grantCoins, isOwned, parseInventory } from './inventory.ts';
import type { BackendPurchaseError, Equipped, Inventory } from './types.ts';

export type RepositoryPurchase =
  | { readonly ok: true; readonly inventory: Inventory }
  | { readonly ok: false; readonly error: BackendPurchaseError };

export type RepositoryListener = (inventory: Inventory) => void;

export interface InventoryRepository {
  /** What to show right now (synchronous: the local data or the cache). */
  load(): Inventory;
  /** Credits earned coins. Shown at once; a backend receives them as soon as its rules allow. */
  reward(amount: number): Inventory;
  /** Pays `price` for `itemId` (the shop checks already passed); resolves once confirmed. */
  purchase(itemId: string, price: number): Promise<RepositoryPurchase>;
  /** Saves what is equipped (at once locally; a backend in the background). */
  equip(equipped: Equipped): Inventory;
  /** Changes that did not come from the calls above (cloud load, another device, account switch). */
  subscribe(listener: RepositoryListener): () => void;
}

/** Offline builds only. Bump the version when the shape changes incompatibly. */
export const INVENTORY_KEY = 'lasertype.inventory.v1';

/** localStorage-backed repository; without storage (private mode…) it keeps the session in memory. */
export function localInventoryRepository(store: KeyValueStore | null): InventoryRepository {
  let state = parseInventory(loadJson(store, INVENTORY_KEY));
  const commit = (next: Inventory): Inventory => {
    state = next;
    saveJson(store, INVENTORY_KEY, next);
    return next;
  };
  return {
    load: () => state,
    reward: (amount) => commit(grantCoins(state, amount)),
    purchase: (itemId, price) => {
      if (isOwned(state, itemId)) return Promise.resolve({ ok: false, error: 'owned' });
      if (state.coins < price) return Promise.resolve({ ok: false, error: 'insufficient' });
      return Promise.resolve({ ok: true, inventory: commit(applyPurchase(state, itemId, price)) });
    },
    equip: (equipped) => commit({ ...state, equipped }),
    subscribe: () => () => undefined,
  };
}
