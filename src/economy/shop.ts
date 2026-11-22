// Rotating daily shop (pure). Everyone sees the same 4 items on the same game day
// (03:00 UTC → 03:00 UTC, see utils/day.ts):
// - the discounted item comes from a fixed list, no rng:
//     DISCOUNT_ORDER[dayIndex % DISCOUNT_ORDER.length], price floor(price × 0.7 / 10) × 10
//   so the Firestore rules can redo the math and check the price paid;
// - the other 3 are drawn with seed "shop:YYYY-MM-DD", excluding the discounted one,
//   preferring categories not in the shop yet.
import { CONFIG } from '../config.ts';
import { CATALOG, DISCOUNT_ORDER, isPurchasable } from '../cosmetics/catalog.ts';
import type { CosmeticItem, CosmeticType } from '../cosmetics/types.ts';
import { dayKeyOf } from '../utils/day.ts';
import { createRng, shuffled } from '../utils/rng.ts';
import type { DailyShop, EconomyConfig, ShopOffer } from './types.ts';

/** floor(price × 0.7 / 10) × 10 (e.g. 900 → 630). */
export function discountedPrice(price: number, config: EconomyConfig = CONFIG.economy): number {
  return Math.floor((price * config.discountFactor) / config.discountStep) * config.discountStep;
}

/** DISCOUNT_ORDER[day % length] (wrapped so days before 1970 also work). */
export function discountedItemId(day: number, order: readonly string[] = DISCOUNT_ORDER): string {
  const n = order.length;
  const id = order[((day % n) + n) % n];
  if (id === undefined) throw new Error('shop: empty discount order');
  return id;
}

/** Seed of the random part of the shop on a given day. */
export function shopSeed(day: number): string {
  return `shop:${dayKeyOf(day)}`;
}

export interface ShopSource {
  readonly catalog: readonly CosmeticItem[];
  readonly discountOrder: readonly string[];
  readonly config: EconomyConfig;
}

const DEFAULT_SOURCE: ShopSource = { catalog: CATALOG, discountOrder: DISCOUNT_ORDER, config: CONFIG.economy };

function offerOf(item: CosmeticItem, discounted: boolean, config: EconomyConfig): ShopOffer {
  const basePrice = item.price ?? 0;
  return {
    itemId: item.id,
    basePrice,
    price: discounted ? discountedPrice(basePrice, config) : basePrice,
    discounted,
  };
}

/** The shop of game day `day` (see `dayIndex`). The discounted offer comes first. */
export function dailyShop(day: number, source: ShopSource = DEFAULT_SOURCE): DailyShop {
  const { catalog, discountOrder, config } = source;
  const discountedId = discountedItemId(day, discountOrder);
  const deal = catalog.find((item) => item.id === discountedId);
  if (!deal || !isPurchasable(deal)) throw new Error(`shop: ${discountedId} is not purchasable`);

  const rng = createRng(shopSeed(day));
  const candidates = shuffled(
    rng,
    catalog.filter((item) => isPurchasable(item) && item.id !== discountedId),
  );
  const slots = Math.max(0, config.shopSize - 1);
  const picked: CosmeticItem[] = [];
  const types = new Set<CosmeticType>([deal.type]);
  // First pass: one item per category not in the shop yet; then fill with what is left.
  for (const item of candidates) {
    if (picked.length >= slots) break;
    if (types.has(item.type)) continue;
    picked.push(item);
    types.add(item.type);
  }
  for (const item of candidates) {
    if (picked.length >= slots) break;
    if (!picked.includes(item)) picked.push(item);
  }

  return {
    day,
    key: dayKeyOf(day),
    offers: [offerOf(deal, true, config), ...picked.map((item) => offerOf(item, false, config))],
  };
}
