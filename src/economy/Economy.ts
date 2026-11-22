// The player's economy: holds the inventory, checks the pure rules, hands each change to a
// repository (local or Firestore) and tells listeners what changed. The UI only talks to
// this class.
import { getItem } from '../cosmetics/catalog.ts';
import { dayIndex, msUntilNextDay } from '../utils/day.ts';
import { checkPurchase, equip, isEquipped, isOwned, sameInventory } from './inventory.ts';
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
  private buying = false;

  constructor(repository: InventoryRepository, now: () => number = Date.now) {
    this.repository = repository;
    this.now = now;
    this.state = repository.load();
    // The backend's version replaced ours (cloud load, another device, account switch).
    repository.subscribe((inventory) => {
      if (!sameInventory(inventory, this.state)) this.commit(inventory, { type: 'sync' });
    });
  }

  get inventory(): Inventory {
    return this.state;
  }

  get coins(): number {
    return this.state.coins;
  }

  /** A purchase is waiting for the server. */
  get purchasing(): boolean {
    return this.buying;
  }

  owns(itemId: string): boolean {
    return isOwned(this.state, itemId);
  }

  isEquipped(itemId: string): boolean {
    return isEquipped(this.state, itemId);
  }

  /** Today's shop (recomputed only when the game day turns, or after reloadShop). */
  today(): DailyShop {
    const day = dayIndex(this.now());
    if (this.shopCache?.day !== day) this.shopCache = dailyShop(day);
    return this.shopCache;
  }

  /** Forgets the cached shop and builds today's again. */
  reloadShop(): DailyShop {
    this.shopCache = null;
    return this.today();
  }

  msUntilRotation(): number {
    return msUntilNextDay(this.now());
  }

  /** Credits the coins of a finished match. */
  rewardMatch(input: RewardInput): MatchReward {
    const reward = matchReward(input);
    if (reward.total > 0) this.commit(this.repository.reward(reward.total), { type: 'reward', amount: reward.total });
    return reward;
  }

  /**
   * Buys from today's shop at today's price; resolves once the repository confirmed it.
   * `shownDay` = the game day of the shop the player was looking at: if the day turned since,
   * nothing is sent ('dayChanged'). A refusal by the server reloads the shop and, when the day
   * turned meanwhile, also reports 'dayChanged'.
   */
  async buy(itemId: string, shownDay?: number): Promise<Result<PurchaseError>> {
    if (this.buying) return { ok: false, error: 'busy' };
    const shop = this.today();
    if (shownDay !== undefined && shownDay !== shop.day) return { ok: false, error: 'dayChanged' };
    const check = checkPurchase(this.state, shop, itemId);
    if (!check.ok) return check;

    const price = check.offer.price;
    this.buying = true;
    try {
      const outcome = await this.repository.purchase(itemId, price);
      if (outcome.ok) {
        this.commit(outcome.inventory, { type: 'purchase', itemId, price });
        return { ok: true, inventory: outcome.inventory };
      }
      if (outcome.error === 'refused' && this.reloadShop().day !== shop.day) return { ok: false, error: 'dayChanged' };
      return { ok: false, error: outcome.error };
    } finally {
      this.buying = false;
    }
  }

  equip(itemId: string): Result<EquipError> {
    const result = equip(this.state, itemId);
    const item = getItem(itemId);
    if (!result.ok || !item) return result;
    const next = this.repository.equip(result.inventory.equipped);
    this.commit(next, { type: 'equip', itemType: item.type, itemId });
    return { ok: true, inventory: next };
  }

  /** Calls `listener` after every change; returns the unsubscribe function. */
  subscribe(listener: EconomyListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(next: Inventory, change: EconomyChange): void {
    this.state = next;
    for (const listener of this.listeners) listener(next, change);
  }
}
