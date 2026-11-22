// The read-only `shop` collection that firestore.rules reads to check a purchase
// (priceFor / discountedId). Written only by scripts/seed-shop.ts (firebase-admin):
//   shop/{id}     = { price, rarity, type }   for every purchasable item of catalog.ts
//   shop/_config  = { discountOrder }         = DISCOUNT_ORDER, in the same order
// Run the script again whenever a price or DISCOUNT_ORDER changes.
import { CATALOG, DISCOUNT_ORDER, isPurchasable } from '../cosmetics/catalog.ts';
import type { CosmeticItem, CosmeticType, Rarity } from '../cosmetics/types.ts';

export const SHOP = 'shop';
export const SHOP_CONFIG_ID = '_config';

export interface ShopItemDoc {
  readonly price: number;
  readonly rarity: Rarity;
  readonly type: CosmeticType;
}

export interface ShopConfigDoc {
  readonly discountOrder: readonly string[];
}

export interface ShopDocuments {
  /** Keyed by item id. */
  readonly items: Readonly<Record<string, ShopItemDoc>>;
  readonly config: ShopConfigDoc;
}

/** What the seed writes. Throws when the catalog and the discount order disagree. */
export function shopDocuments(
  catalog: readonly CosmeticItem[] = CATALOG,
  discountOrder: readonly string[] = DISCOUNT_ORDER,
): ShopDocuments {
  const items: Record<string, ShopItemDoc> = {};
  for (const item of catalog) {
    if (!isPurchasable(item) || item.price === null) continue;
    if (!Number.isInteger(item.price)) throw new Error(`shop: ${item.id} has a non-integer price`);
    if (item.id === SHOP_CONFIG_ID) throw new Error(`shop: ${SHOP_CONFIG_ID} is reserved`);
    items[item.id] = { price: item.price, rarity: item.rarity, type: item.type };
  }
  const ids = Object.keys(items);
  const missing = ids.filter((id) => !discountOrder.includes(id));
  const extra = discountOrder.filter((id) => !(id in items));
  if (missing.length > 0 || extra.length > 0 || new Set(discountOrder).size !== discountOrder.length) {
    throw new Error(`shop: DISCOUNT_ORDER must list every purchasable item once (missing ${missing.join(', ')}; extra ${extra.join(', ')})`);
  }
  return { items, config: { discountOrder: [...discountOrder] } };
}
