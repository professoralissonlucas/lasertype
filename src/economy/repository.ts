// Where the inventory lives. Offline-first: localStorage now; Phase 5.5 adds a Firestore
// sync on top (same Inventory shape as users/{uid}) without touching the pure economy.
import { loadJson, saveJson, type KeyValueStore } from '../utils/storage.ts';
import { parseInventory } from './inventory.ts';
import type { Inventory } from './types.ts';

export interface InventoryRepository {
  load(): Inventory;
  save(inventory: Inventory): void;
}

/** Bump the version when the shape changes incompatibly. */
export const INVENTORY_KEY = 'lasertype.inventory.v1';

/** localStorage-backed repository; without storage (private mode…) it keeps nothing. */
export function localInventoryRepository(store: KeyValueStore | null): InventoryRepository {
  return {
    load: () => parseInventory(loadJson(store, INVENTORY_KEY)),
    save: (inventory) => {
      saveJson(store, INVENTORY_KEY, inventory);
    },
  };
}
