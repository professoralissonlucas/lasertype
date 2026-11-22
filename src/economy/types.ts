// Economy types. The inventory mirrors the `users/{uid}` fields of Firestore (coins, owned,
// equipped, lastPurchase); repository.ts decides where it lives (localStorage in offline
// builds, Firestore with a localStorage cache in online builds).
import type { CosmeticType, Rarity } from '../cosmetics/types.ts';
import type { Grade } from '../game/types.ts';
import type { ModeId } from '../modes/types.ts';

/** Missing type = the default item of that category. */
export type Equipped = Readonly<Partial<Record<CosmeticType, string>>>;

export interface Inventory {
  readonly coins: number;
  /** Bought items only: default items (price 0) are always owned and never listed. */
  readonly owned: Readonly<Record<string, true>>;
  readonly equipped: Equipped;
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

/** Why the backend did not complete a purchase (the shop checks passed before it was sent). */
export type BackendPurchaseError =
  /** Already owned (bought on another device). */
  | 'owned'
  /** Not enough confirmed coins (spent on another device). */
  | 'insufficient'
  /** Enough counting the pending coins, but the server has not received them yet. */
  | 'syncing'
  /** The server rules refused the write (e.g. the day turned and the price changed). */
  | 'refused'
  /** No connection to the server (or not signed in yet). */
  | 'offline';

export type PurchaseError =
  | 'unknown'
  | 'notForSale'
  /** The game day turned before the purchase went through: the shop was reloaded. */
  | 'dayChanged'
  /** Another purchase is still waiting for the server. */
  | 'busy'
  | BackendPurchaseError;

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

/** Every change, typed. Each local one becomes exactly one rule-checked write in the cloud. */
export type EconomyChange =
  | { readonly type: 'reward'; readonly amount: number }
  | { readonly type: 'purchase'; readonly itemId: string; readonly price: number }
  | { readonly type: 'equip'; readonly itemType: CosmeticType; readonly itemId: string }
  /** Replaced by the backend's version (cloud load, another device, account switch). */
  | { readonly type: 'sync' };

export interface EconomyConfig {
  readonly pointsPerCoin: number;
  readonly maxScoreCoins: number;
  readonly gradeBonus: Readonly<Record<Grade, number>>;
  readonly modeFactor: Readonly<Record<ModeId, number>>;
  readonly rarityPrice: Readonly<Record<Rarity, number>>;
  /** Items in the daily shop (one of them discounted). */
  readonly shopSize: number;
}

/** Cloud sync timing (the reward limits mirror firestore.rules → isReward). */
export interface SyncConfig {
  /** Most coins one reward write may add. */
  readonly maxRewardPerWrite: number;
  /** Minimum time between two reward writes. */
  readonly rewardIntervalSeconds: number;
  readonly rewardMarginMs: number;
  readonly retryBaseMs: number;
  readonly retryMaxMs: number;
}
