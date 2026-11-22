// The player's economy: holds the inventory, applies the pure operations, persists through
// a repository and tells listeners what changed. The UI only talks to this class.
import { getItem } from '../cosmetics/catalog.ts';
import { dayIndex, msUntilNextDay } from '../utils/day.ts';
import { equip, grantCoins, isEquipped, isOwned, purchase } from './inventory.ts';
import type { InventoryRepository } from './repository.ts';
import { matchReward, type RewardInput } from './rewards.ts';
import { dailyShop } from './shop.ts';
import type { DailyShop, EconomyChange, EquipError, Inventory, MatchReward, PurchaseError, Result } from './types.ts';

export type EconomyListener = (inventory: Inventory, change: EconomyChange) => void;

export class Economy {
  private readonly repository: InventoryRepository;
  private readonly now: () => number;
  private readonly listeners = new Set<EconomyListener>();
  private state: Inventory;
  private shopCache: DailyShop | null = null;

  constructor(repository: InventoryRepository, now: () => number = Date.now) {
    this.repository = repository;
    this.now = now;
    this.state = repository.load();
  }

  get inventory(): Inventory {
    return this.state;
  }

  get coins(): number {
    return this.state.coins;
  }

  owns(itemId: string): boolean {
    return isOwned(this.state, itemId);
  }

  isEquipped(itemId: string): boolean {
    return isEquipped(this.state, itemId);
  }

  /** Today's shop (recomputed only when the game day turns). */
  today(): DailyShop {
    const day = dayIndex(this.now());
    if (this.shopCache?.day !== day) this.shopCache = dailyShop(day);
    return this.shopCache;
  }

  msUntilRotation(): number {
    return msUntilNextDay(this.now());
  }

  /** Credits the coins of a finished match. */
  rewardMatch(input: RewardInput): MatchReward {
    const reward = matchReward(input);
    if (reward.total > 0) this.commit(grantCoins(this.state, reward.total), { type: 'reward', amount: reward.total });
    return reward;
  }

  /** Buys from today's shop at today's price. */
  buy(itemId: string): Result<PurchaseError> {
    const shop = this.today();
    const result = purchase(this.state, shop, itemId);
    if (result.ok) {
      const price = shop.offers.find((offer) => offer.itemId === itemId)?.price ?? 0;
      this.commit(result.inventory, { type: 'purchase', itemId, price });
    }
    return result;
  }

  equip(itemId: string): Result<EquipError> {
    const result = equip(this.state, itemId);
    const item = getItem(itemId);
    if (result.ok && item) this.commit(result.inventory, { type: 'equip', itemType: item.type, itemId });
    return result;
  }

  /** Calls `listener` after every change; returns the unsubscribe function. */
  subscribe(listener: EconomyListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(next: Inventory, change: EconomyChange): void {
    this.state = next;
    this.repository.save(next);
    for (const listener of this.listeners) listener(next, change);
  }
}
