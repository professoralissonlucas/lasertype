// Economy types. The local inventory mirrors the `users/{uid}` fields of Firestore
// (coins, owned, equipped, lastPurchase) so Phase 5.5 can sync it as is.
import type { CosmeticType, Rarity } from '../cosmetics/types.ts';
import type { Grade } from '../game/types.ts';
import type { ModeId } from '../modes/types.ts';

export interface Inventory {
  readonly coins: number;
  /** Bought items only: default items (price 0) are always owned and never listed. */
  readonly owned: Readonly<Record<string, true>>;
  /** Missing type = the default item of that category. */
  readonly equipped: Readonly<Partial<Record<CosmeticType, string>>>;
  /** Last item bought (the Firestore purchase rule checks it). */
  readonly lastPurchase: string | null;
}

export interface ShopOffer {
  readonly itemId: string;
  /** What it costs today. */
  readonly price: number;
  /** Catalog price. */
  readonly basePrice: number;
  readonly discounted: boolean;
}

export interface DailyShop {
  /** Game day index (see utils/day.ts). */
  readonly day: number;
  /** `YYYY-MM-DD`, the seed of the 3 random offers. */
  readonly key: string;
  /** The discounted offer comes first. */
  readonly offers: readonly ShopOffer[];
}

export type PurchaseError = 'unknown' | 'notForSale' | 'owned' | 'insufficient';
export type EquipError = 'unknown' | 'notOwned';

export type Result<E> = { readonly ok: true; readonly inventory: Inventory } | { readonly ok: false; readonly error: E };

/** Coins earned by one match, with the breakdown the Mission Report shows. */
export interface MatchReward {
  /** min(floor(score / pointsPerCoin), maxScoreCoins). */
  readonly fromScore: number;
  readonly gradeBonus: number;
  /** Mode multiplier (Zen 0.25). */
  readonly factor: number;
  /** floor((fromScore + gradeBonus) × factor). */
  readonly total: number;
}

/** Every change, typed, so a future sync can turn each one into one rule-checked write. */
export type EconomyChange =
  | { readonly type: 'reward'; readonly amount: number }
  | { readonly type: 'purchase'; readonly itemId: string; readonly price: number }
  | { readonly type: 'equip'; readonly itemType: CosmeticType; readonly itemId: string };

export interface EconomyConfig {
  readonly pointsPerCoin: number;
  readonly maxScoreCoins: number;
  readonly gradeBonus: Readonly<Record<Grade, number>>;
  readonly modeFactor: Readonly<Record<ModeId, number>>;
  readonly rarityPrice: Readonly<Record<Rarity, number>>;
  /** Items in the daily shop (one of them discounted). */
  readonly shopSize: number;
  /**
   * Discounted price, integer math only (firestore.rules redoes it):
   * floor(price × discountKeepTenths / (10 × discountStep)) × discountStep — with 7 and 10,
   * floor(price × 7 / 100) × 10.
   */
  readonly discountKeepTenths: number;
  readonly discountStep: number;
}
