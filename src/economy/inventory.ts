// Ownership, coins and equipment (pure). Every operation returns a new inventory;
// persistence lives in repository.ts / firestoreRepository.ts and the glue in Economy.ts.
import { DEFAULT_ITEM_IDS, getItem, isDefaultItem, isPurchasable } from '../cosmetics/catalog.ts';
import { COSMETIC_TYPES, type CosmeticType } from '../cosmetics/types.ts';
import type { DailyShop, Equipped, EquipError, Inventory, PurchaseError, Result, ShopOffer } from './types.ts';

export function emptyInventory(): Inventory {
  return { coins: 0, owned: {}, equipped: {}, lastPurchase: null };
}

/** Default items are owned by everyone; others only once bought. */
export function isOwned(inventory: Inventory, itemId: string): boolean {
  const item = getItem(itemId);
  if (!item) return false;
  return isDefaultItem(item) || inventory.owned[itemId] === true;
}

/** Equipped item id of a category (the default when nothing is equipped). */
export function equippedId(inventory: Inventory, type: CosmeticType): string {
  return inventory.equipped[type] ?? DEFAULT_ITEM_IDS[type];
}

export function isEquipped(inventory: Inventory, itemId: string): boolean {
  const item = getItem(itemId);
  return item !== undefined && equippedId(inventory, item.type) === itemId;
}

export function grantCoins(inventory: Inventory, amount: number): Inventory {
  const coins = Number.isFinite(amount) ? Math.floor(Math.max(0, amount)) : 0;
  if (coins === 0) return inventory;
  return { ...inventory, coins: inventory.coins + coins };
}

export type PurchaseCheck = { readonly ok: true; readonly offer: ShopOffer } | { readonly ok: false; readonly error: PurchaseError };

/** Can `itemId` be bought from today's shop? Returns today's offer (and price) when it can. */
export function checkPurchase(inventory: Inventory, shop: DailyShop, itemId: string): PurchaseCheck {
  if (!getItem(itemId)) return { ok: false, error: 'unknown' };
  const offer = shop.offers.find((entry) => entry.itemId === itemId);
  if (!offer) return { ok: false, error: 'notForSale' };
  if (isOwned(inventory, itemId)) return { ok: false, error: 'owned' };
  if (inventory.coins < offer.price) return { ok: false, error: 'insufficient' };
  return { ok: true, offer };
}

/** The inventory after paying `price` for `itemId` (what the purchase write sends). */
export function applyPurchase(inventory: Inventory, itemId: string, price: number): Inventory {
  return {
    ...inventory,
    coins: inventory.coins - price,
    owned: { ...inventory.owned, [itemId]: true },
    lastPurchase: itemId,
  };
}

/** Buys an item from today's shop at today's price. */
export function purchase(inventory: Inventory, shop: DailyShop, itemId: string): Result<PurchaseError> {
  const check = checkPurchase(inventory, shop, itemId);
  if (!check.ok) return check;
  return { ok: true, inventory: applyPurchase(inventory, itemId, check.offer.price) };
}

/** Same keys with the same (primitive) values. */
function sameMap(x: Readonly<Record<string, unknown>>, y: Readonly<Record<string, unknown>>): boolean {
  const keys = Object.keys(x);
  return keys.length === Object.keys(y).length && keys.every((key) => x[key] === y[key]);
}

/** Same item in every category. */
export function sameEquipped(a: Equipped, b: Equipped): boolean {
  return sameMap(a, b);
}

/** Same coins, items, equipment and last purchase. */
export function sameInventory(a: Inventory, b: Inventory): boolean {
  return (
    a.coins === b.coins &&
    a.lastPurchase === b.lastPurchase &&
    sameMap(a.owned, b.owned) &&
    sameEquipped(a.equipped, b.equipped)
  );
}

export function equip(inventory: Inventory, itemId: string): Result<EquipError> {
  const item = getItem(itemId);
  if (!item) return { ok: false, error: 'unknown' };
  if (!isOwned(inventory, itemId)) return { ok: false, error: 'notOwned' };
  return { ok: true, inventory: { ...inventory, equipped: { ...inventory.equipped, [item.type]: itemId } } };
}

/**
 * Turns whatever was stored (old, partial or tampered with) into a valid inventory:
 * negative/invalid coins become 0, unknown or non-purchasable ids are dropped, and an
 * equipped item must exist, match its category and be owned.
 */
export function parseInventory(raw: unknown): Inventory {
  if (typeof raw !== 'object' || raw === null) return emptyInventory();
  const data = raw as Record<string, unknown>;

  const coins =
    typeof data.coins === 'number' && Number.isFinite(data.coins) ? Math.floor(Math.max(0, data.coins)) : 0;

  const owned: Record<string, true> = {};
  if (typeof data.owned === 'object' && data.owned !== null) {
    for (const [id, value] of Object.entries(data.owned as Record<string, unknown>)) {
      const item = getItem(id);
      if (value === true && item && isPurchasable(item)) owned[id] = true;
    }
  }
  const base: Inventory = { coins, owned, equipped: {}, lastPurchase: null };

  const equipped: Partial<Record<CosmeticType, string>> = {};
  if (typeof data.equipped === 'object' && data.equipped !== null) {
    const stored = data.equipped as Record<string, unknown>;
    for (const type of COSMETIC_TYPES) {
      const id = stored[type];
      if (typeof id !== 'string') continue;
      if (getItem(id)?.type === type && isOwned(base, id)) equipped[type] = id;
    }
  }

  const last = data.lastPurchase;
  const lastPurchase = typeof last === 'string' && owned[last] ? last : null;
  return { coins, owned, equipped, lastPurchase };
}
