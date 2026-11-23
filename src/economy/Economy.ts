// The player's economy and progression: holds the inventory and the progress, checks the pure
// rules, hands each change to a repository (local or Firestore) and tells listeners what
// changed. The UI only talks to this class.
import { CONFIG } from '../config.ts';
import { getItem } from '../cosmetics/catalog.ts';
import type { MatchReport } from '../game/report.ts';
import { ACHIEVEMENTS, isAchieved } from '../progression/achievements.ts';
import { missionViews, type MissionView } from '../progression/missions.ts';
import { applyGain, isEmptyGain, matchGain, sameProgress } from '../progression/progress.ts';
import { currentStreak, type LoginReward } from '../progression/streak.ts';
import type { Award, Progress } from '../progression/types.ts';
import { levelProgress, matchXp, type LevelProgress } from '../progression/xp.ts';
import { dayIndex, msUntilNextDay } from '../utils/day.ts';
import { checkPurchase, equip, equipTitle, isEquipped, isOwned, sameInventory } from './inventory.ts';
import type { InventoryRepository } from './repository.ts';
import { matchReward } from './rewards.ts';
import { dailyShop } from './shop.ts';
import type { DailyShop, EconomyChange, EquipError, Inventory, MatchOutcome, PurchaseError, Result } from './types.ts';

export type EconomyListener = (inventory: Inventory, change: EconomyChange) => void;

export class Economy {
  private readonly repository: InventoryRepository;
  private readonly now: () => number;
  private readonly listeners = new Set<EconomyListener>();
  private state: Inventory;
  private progressState: Progress;
  private shopCache: DailyShop | null = null;
  private buying = false;
  /** Achievement items on their way to the server. */
  private readonly unlocking = new Set<string>();
  /** After a refusal (e.g. the rules were not published yet), unlocks wait until then (ms). */
  private unlockAfter = 0;

  constructor(repository: InventoryRepository, now: () => number = Date.now) {
    this.repository = repository;
    this.now = now;
    this.state = repository.load();
    this.progressState = repository.progress();
    // The backend's version replaced ours (cloud load, another device, account switch).
    repository.subscribe((inventory) => {
      const progress = repository.progress();
      if (!sameInventory(inventory, this.state) || !sameProgress(progress, this.progressState)) {
        this.commit(inventory, { type: 'sync' });
      }
      this.unlockAchieved();
    });
  }

  get inventory(): Inventory {
    return this.state;
  }

  get coins(): number {
    return this.state.coins;
  }

  /** XP, level, streak, missions and statistics. */
  get progress(): Progress {
    return this.progressState;
  }

  get level(): LevelProgress {
    return levelProgress(this.progressState.xp);
  }

  /** Today's game day. */
  get day(): number {
    return dayIndex(this.now());
  }

  /** Today's missions with the player's progress. */
  missions(): readonly MissionView[] {
    return missionViews(this.progressState.missions, this.day);
  }

  /** Days in a row still alive today. */
  get streak(): number {
    return currentStreak(this.progressState, this.day);
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
    const day = this.day;
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

  /** Credits a finished match: coins, XP, chests, missions and statistics. */
  finishMatch(report: MatchReport): MatchOutcome {
    const day = this.day;
    const before = this.progressState;
    const coins = matchReward(report);
    const gain = matchGain(report, day);
    const { awards } = applyGain(before, gain);
    if (coins.total > 0 || !isEmptyGain(gain)) {
      this.commit(this.repository.reward(coins.total, gain), { type: 'reward', amount: coins.total });
    }
    const after = this.progressState;
    const ofType = <T extends Award['type']>(type: T) =>
      awards.filter((award): award is Extract<Award, { type: T }> => award.type === type);
    const outcome: MatchOutcome = {
      coins,
      xp: matchXp(report),
      before: levelProgress(before.xp),
      after: levelProgress(after.xp),
      chests: ofType('chest'),
      missions: missionViews(after.missions, day),
      completed: ofType('mission').map((award) => award.slot),
      achievements: ACHIEVEMENTS.filter((entry) => !isAchieved(entry, before.stats) && isAchieved(entry, after.stats)),
    };
    this.unlockAchieved();
    return outcome;
  }

  /** Counts today's login (once per game day); null when there is nothing to count. */
  claimLogin(): LoginReward | null {
    const login = this.repository.login(this.day);
    if (!login) return null;
    this.commit(this.repository.load(), { type: 'login', streak: login.streak, coins: login.coins });
    this.unlockAchieved();
    return login;
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

  /** Wears a collection's title; null takes it off. */
  equipTitle(titleId: string | null): Result<EquipError> {
    const result = equipTitle(this.state, titleId);
    if (!result.ok) return result;
    const next = this.repository.equip(result.inventory.equipped);
    this.commit(next, { type: 'title', titleId });
    return { ok: true, inventory: next };
  }

  /** Calls `listener` after every change; returns the unsubscribe function. */
  subscribe(listener: EconomyListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Asks for the items of the achievements already reached (again later when it fails). */
  private unlockAchieved(): void {
    if (this.now() < this.unlockAfter) return;
    for (const achievement of ACHIEVEMENTS) {
      const { itemId } = achievement;
      if (!isAchieved(achievement, this.progressState.stats) || this.owns(itemId) || this.unlocking.has(itemId)) continue;
      this.unlocking.add(itemId);
      void this.unlock(itemId).finally(() => this.unlocking.delete(itemId));
    }
  }

  private async unlock(itemId: string): Promise<void> {
    const outcome = await this.repository.unlock(itemId);
    if (outcome.ok) this.commit(outcome.inventory, { type: 'unlock', itemId });
    else if (outcome.error === 'refused') this.unlockAfter = this.now() + CONFIG.sync.retryMaxMs;
  }

  private commit(next: Inventory, change: EconomyChange): void {
    this.state = next;
    this.progressState = this.repository.progress();
    for (const listener of this.listeners) listener(next, change);
  }
}
