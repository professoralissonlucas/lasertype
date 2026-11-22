// What the shop screen shows for an item (pure: no DOM).
import { getItem } from '../cosmetics/catalog.ts';
import type { CosmeticItem } from '../cosmetics/types.ts';
import { isEquipped, isOwned } from '../economy/inventory.ts';
import type { DailyShop, Inventory, ShopOffer } from '../economy/types.ts';

export type ItemAction =
  | { readonly kind: 'equipped' }
  | { readonly kind: 'equip' }
  | { readonly kind: 'buy'; readonly offer: ShopOffer }
  | { readonly kind: 'insufficient'; readonly offer: ShopOffer; readonly missing: number }
  /** Not owned and not in today's shop. */
  | { readonly kind: 'unavailable' };

/** The main button of the item's detail panel. */
export function itemAction(itemId: string, inventory: Inventory, shop: DailyShop): ItemAction {
  if (isEquipped(inventory, itemId)) return { kind: 'equipped' };
  if (isOwned(inventory, itemId)) return { kind: 'equip' };
  const offer = shop.offers.find((entry) => entry.itemId === itemId);
  if (!offer || !getItem(itemId)) return { kind: 'unavailable' };
  const missing = offer.price - inventory.coins;
  return missing > 0 ? { kind: 'insufficient', offer, missing } : { kind: 'buy', offer };
}

/** Two representative colors of an item, for the swatch on its card. */
export function itemSwatch(item: CosmeticItem): readonly [string, string] {
  switch (item.type) {
    case 'cannon':
      return [item.params.barrelColor, item.params.baseStroke];
    case 'theme':
      return item.params.nebula;
    case 'laserColor':
      return [item.params.glow, item.params.core];
    case 'explosion':
      return [item.params.main, item.params.accent];
    case 'wordBorder':
      return [item.params.color, item.params.color];
  }
}
