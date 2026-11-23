// Where the inventory and the progress live. Two implementations of the same interface:
// - localInventoryRepository: localStorage only (offline builds, without VITE_FIREBASE_*);
// - FirestoreInventoryRepository (firestoreRepository.ts): users/{uid} in Firestore, with
//   localStorage as a cache.
// The interface is one method per kind of change (not "save the whole inventory") because
// firestore.rules accepts exactly one kind of change per write: reward, purchase, unlock or equip.
import { applyGain, emptyGain, loginGain, parseProgress } from '../progression/progress.ts';
import { claimLogin, type LoginReward } from '../progression/streak.ts';
import type { Progress, ProgressGain } from '../progression/types.ts';
import { loadJson, saveJson, type KeyValueStore } from '../utils/storage.ts';
import { applyPurchase, applyUnlock, grantCoins, isOwned, parseInventory } from './inventory.ts';
import type { BackendPurchaseError, Equipped, Inventory, UnlockError } from './types.ts';

export type RepositoryPurchase =
  | { readonly ok: true; readonly inventory: Inventory }
  | { readonly ok: false; readonly error: BackendPurchaseError };

export type RepositoryUnlock =
  | { readonly ok: true; readonly inventory: Inventory }
  | { readonly ok: false; readonly error: UnlockError };

export type RepositoryListener = (inventory: Inventory) => void;

export interface InventoryRepository {
  /** What to show right now (synchronous: the local data or the cache). */
  load(): Inventory;
  /** XP, level, streak, missions and statistics right now (what was not sent yet included). */
  progress(): Progress;
  /**
   * Credits earned coins and what a match adds to the progress (chests and missions pay
   * their own coins). Shown at once; a backend receives it as soon as its rules allow.
   */
  reward(amount: number, gain?: ProgressGain): Inventory;
  /** Counts the login of game day `day`; null = already counted, or the account is not known yet. */
  login(day: number): LoginReward | null;
  /** Pays `price` for `itemId` (the shop checks already passed); resolves once confirmed. */
  purchase(itemId: string, price: number): Promise<RepositoryPurchase>;
  /** Releases an achievement item, free (the achievement was reached); resolves once confirmed. */
  unlock(itemId: string): Promise<RepositoryUnlock>;
  /** Saves what is equipped (at once locally; a backend in the background). */
  equip(equipped: Equipped): Inventory;
  /** Changes that did not come from the calls above (cloud load, another device, account switch). */
  subscribe(listener: RepositoryListener): () => void;
}

/** Offline builds only. Bump the versions when the shapes change incompatibly. */
export const INVENTORY_KEY = 'lasertype.inventory.v1';
export const PROGRESS_KEY = 'lasertype.progress.v1';

/** localStorage-backed repository; without storage (private mode…) it keeps the session in memory. */
export function localInventoryRepository(store: KeyValueStore | null): InventoryRepository {
  let state = parseInventory(loadJson(store, INVENTORY_KEY));
  let progress = parseProgress(loadJson(store, PROGRESS_KEY));
  const commit = (next: Inventory): Inventory => {
    state = next;
    saveJson(store, INVENTORY_KEY, next);
    return next;
  };
  /** There is no server to limit anything here: what is owed is paid at once. */
  const credit = (amount: number, gain: ProgressGain): Inventory => {
    const applied = applyGain(progress, gain).progress;
    progress = { ...applied, owed: 0 };
    saveJson(store, PROGRESS_KEY, progress);
    return commit(grantCoins(grantCoins(state, amount), applied.owed));
  };
  return {
    load: () => state,
    progress: () => progress,
    reward: (amount, gain = emptyGain()) => credit(amount, gain),
    login: (day) => {
      const login = claimLogin(progress, day);
      if (login) credit(0, loginGain(day));
      return login;
    },
    purchase: (itemId, price) => {
      if (isOwned(state, itemId)) return Promise.resolve({ ok: false, error: 'owned' });
      if (state.coins < price) return Promise.resolve({ ok: false, error: 'insufficient' });
      return Promise.resolve({ ok: true, inventory: commit(applyPurchase(state, itemId, price)) });
    },
    unlock: (itemId) => Promise.resolve({ ok: true, inventory: commit(applyUnlock(state, itemId)) }),
    equip: (equipped) => commit({ ...state, equipped }),
    subscribe: () => () => undefined,
  };
}
