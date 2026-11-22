// The inventory in the cloud: users/{uid} in Firestore is the truth and localStorage only a
// cache, so coins and cosmetics show at once (offline too). The old offline-phase progress
// (lasertype.inventory.v1) is not migrated.
// - First session of an account: users/{uid} is created (coins 0, owned {}, lastReward =
//   serverTimestamp(), name "Piloto" + 4 digits).
// - Rewards are shown at once and queued as pending; each reward write sends at most 150
//   coins and goes 30 s after the previous one (the rules' limits), so nothing is lost.
// - Purchases run in a transaction and count only once the server accepted them.
// - Equip and nickname changes apply at once; they are written in the background (retried).
// - Every write goes through one queue (one at a time) and is exactly one kind of change.
import { CONFIG } from '../config.ts';
import { errorCode } from '../firebase/auth.ts';
import type { UserBackend, UserSnapshot } from '../firebase/profile.ts';
import { defaultNickname, isValidNickname } from '../profile/nickname.ts';
import { loadJson, saveJson, type KeyValueStore } from '../utils/storage.ts';
import { emptyInventory, parseInventory, sameEquipped, sameInventory } from './inventory.ts';
import type { InventoryRepository, RepositoryListener, RepositoryPurchase } from './repository.ts';
import type { Equipped, Inventory, SyncConfig } from './types.ts';

/** Bump the version when the shape changes incompatibly. */
export const CLOUD_CACHE_KEY = 'lasertype.cloud.v1';

/** Cache entry for progress made before any account answered (first visit offline). */
const NO_ACCOUNT = '';

/** One account in the cache (plain data: saved as JSON). */
interface CachedUser {
  /** As confirmed by the server: coins WITHOUT the pending ones; `equipped` is the local choice. */
  inventory: Inventory;
  /** Coins earned and shown, not accepted by the server yet. */
  pending: number;
  /** `inventory.equipped` not written yet. */
  equipDirty: boolean;
  name: string | null;
  /** `name` not written yet. */
  nameDirty: boolean;
  /** Local time (ms) from which the next reward write may go. */
  nextRewardAt: number;
}

function blankUser(): CachedUser {
  return { inventory: emptyInventory(), pending: 0, equipDirty: false, name: null, nameDirty: false, nextRewardAt: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseUser(raw: unknown): CachedUser {
  const d = isRecord(raw) ? raw : {};
  const name = typeof d.name === 'string' && isValidNickname(d.name) ? d.name : null;
  const pending = typeof d.pending === 'number' && Number.isFinite(d.pending) ? Math.floor(Math.max(0, d.pending)) : 0;
  return {
    inventory: parseInventory(d.inventory),
    pending,
    equipDirty: d.equipDirty === true,
    name,
    nameDirty: d.nameDirty === true && name !== null,
    nextRewardAt: typeof d.nextRewardAt === 'number' && Number.isFinite(d.nextRewardAt) ? d.nextRewardAt : 0,
  };
}

/** Tolerant read of the cache: anything invalid becomes an empty account. */
function parseCache(raw: unknown): { readonly last: string; readonly users: Map<string, CachedUser> } {
  const data = isRecord(raw) ? raw : {};
  const users = new Map<string, CachedUser>();
  if (isRecord(data.users)) {
    for (const [key, value] of Object.entries(data.users)) users.set(key, parseUser(value));
  }
  const last = typeof data.last === 'string' && users.has(data.last) ? data.last : NO_ACCOUNT;
  return { last, users };
}

type Timer = ReturnType<typeof setTimeout>;

export interface FirestoreRepositoryOptions {
  readonly store: KeyValueStore | null;
  /** Loads the Firestore backend (downloads the SDK on first use). */
  readonly backend: () => Promise<UserBackend>;
  readonly config?: SyncConfig;
  readonly now?: () => number;
}

export class FirestoreInventoryRepository implements InventoryRepository {
  private readonly store: KeyValueStore | null;
  private readonly backend: () => Promise<UserBackend>;
  private readonly config: SyncConfig;
  private readonly now: () => number;
  private readonly listeners = new Set<RepositoryListener>();
  private readonly users: Map<string, CachedUser>;
  /** Cache entry in use: the signed-in uid, the last one before the auth answers, or NO_ACCOUNT. */
  private key: string;
  private user: CachedUser;
  /** Signed-in uid (null until the auth answers). */
  private uid: string | null = null;
  /** users/{uid} was read (or created) this session: writes may go. */
  private ready = false;
  private openingUid: string | null = null;
  private equipSending = false;
  private nameSending = false;
  private queue: Promise<unknown> = Promise.resolve();
  private rewardTimer: Timer | null = null;
  private retryTimer: Timer | null = null;
  private rewardFailures = 0;
  private openFailures = 0;

  constructor(options: FirestoreRepositoryOptions) {
    this.store = options.store;
    this.backend = options.backend;
    this.config = options.config ?? CONFIG.sync;
    this.now = options.now ?? Date.now;
    const cache = parseCache(loadJson(this.store, CLOUD_CACHE_KEY));
    this.users = cache.users;
    this.key = cache.last;
    this.user = this.entry(this.key);
  }

  // ---------- InventoryRepository ----------

  load(): Inventory {
    return this.visible();
  }

  reward(amount: number): Inventory {
    const coins = Number.isFinite(amount) ? Math.floor(Math.max(0, amount)) : 0;
    if (coins > 0) {
      this.user.pending += coins;
      this.persist();
      this.scheduleReward();
    }
    return this.visible();
  }

  purchase(itemId: string, price: number): Promise<RepositoryPurchase> {
    const uid = this.uid;
    const user = this.user;
    const offline: RepositoryPurchase = { ok: false, error: 'offline' };
    if (!uid) return Promise.resolve(offline);
    return this.enqueue(async (): Promise<RepositoryPurchase> => {
      if (uid !== this.uid) return offline;
      if (!this.ready) {
        this.open(); // try to reconnect for the next attempt
        return offline;
      }
      const before = this.visible();
      try {
        const backend = await this.backend();
        const attempt = await backend.purchase(uid, itemId, price);
        this.merge(user, attempt.snapshot, false);
        this.persist();
        if (uid !== this.uid) return offline;
        if (attempt.kind === 'bought') return { ok: true, inventory: this.visible() };
        this.emitIfChanged(before);
        if (attempt.kind === 'insufficient' && user.pending > 0) return { ok: false, error: 'syncing' };
        return { ok: false, error: attempt.kind };
      } catch (error) {
        if (errorCode(error) === 'permission-denied') return { ok: false, error: 'refused' };
        if (uid === this.uid) this.connectionLost();
        return offline;
      }
    });
  }

  equip(equipped: Equipped): Inventory {
    this.user.inventory = { ...this.user.inventory, equipped };
    this.user.equipDirty = true;
    this.persist();
    this.flushEquip();
    return this.visible();
  }

  subscribe(listener: RepositoryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------- Account ----------

  /** users/{uid}.name of the current account (its "Piloto" default until read); null before any account. */
  get name(): string | null {
    if (this.key === NO_ACCOUNT) return null;
    return this.user.name ?? defaultNickname(this.key);
  }

  /** Coins earned but not accepted by the server yet. */
  get pendingCoins(): number {
    return this.user.pending;
  }

  /**
   * The signed-in account (from AuthService). null = still connecting or no network: the
   * cache stays and the writes wait. A new uid switches to that account's document.
   */
  setUser(uid: string | null): void {
    if (uid === null) return;
    if (uid === this.uid) {
      this.open();
      return;
    }
    this.uid = uid;
    this.ready = false;
    this.rewardFailures = 0;
    this.openFailures = 0;
    this.clearTimers();
    if (this.key !== uid) {
      const previous = this.user;
      const next = this.entry(uid);
      // Progress made before any account answered belongs to the first account that does.
      if (this.key === NO_ACCOUNT) {
        next.pending += previous.pending;
        if (previous.equipDirty) {
          next.inventory = { ...next.inventory, equipped: previous.inventory.equipped };
          next.equipDirty = true;
        }
        this.users.delete(NO_ACCOUNT);
      }
      this.key = uid;
      this.user = next;
    }
    this.persist();
    this.emit();
    this.open();
  }

  /** Profile write (nickname). Shown at once, written in the background. */
  rename(name: string): void {
    if (this.key === NO_ACCOUNT || !isValidNickname(name)) return;
    this.user.name = name;
    this.user.nameDirty = true;
    this.persist();
    this.emit();
    this.flushName();
  }

  // ---------- Sync ----------

  /** Reads (or creates) users/{uid}, merges it with the cache and sends what is waiting. */
  private open(): void {
    const uid = this.uid;
    if (!uid || this.ready || this.openingUid === uid) return;
    this.openingUid = uid;
    this.clearRetry();
    const user = this.user;
    void this.enqueue(async () => {
      try {
        const backend = await this.backend();
        const { snapshot, created } = await backend.open(uid, user.name ?? defaultNickname(uid));
        if (created) user.nameDirty = false; // the document was created with this name
        this.merge(user, snapshot, created);
        this.persist();
      } catch {
        if (uid === this.uid) {
          this.openFailures++;
          this.retryLater();
        }
        return;
      } finally {
        if (this.openingUid === uid) this.openingUid = null;
      }
      if (uid !== this.uid) return;
      this.ready = true;
      this.openFailures = 0;
      this.emit();
      this.flushEquip();
      this.flushName();
      this.scheduleReward();
    });
  }

  /** The server's document wins, except for local changes not written yet. */
  private merge(user: CachedUser, snapshot: UserSnapshot, created: boolean): void {
    const remote = snapshot.inventory;
    const equipped = user.equipDirty ? user.inventory.equipped : remote.equipped;
    user.inventory = parseInventory({ ...remote, equipped }); // drops equipped items not owned
    if (!user.nameDirty) user.name = snapshot.name ?? user.name;
    const lastReward = snapshot.lastReward ?? (created ? this.now() : null);
    if (lastReward !== null) user.nextRewardAt = Math.max(user.nextRewardAt, lastReward + this.rewardGapMs());
  }

  private scheduleReward(): void {
    if (this.rewardTimer !== null || !this.ready || this.user.pending <= 0) return;
    const delay = Math.max(0, this.user.nextRewardAt - this.now());
    this.rewardTimer = setTimeout(() => {
      this.rewardTimer = null;
      this.sendReward();
    }, delay);
  }

  /** One reward write with up to maxRewardPerWrite of the pending coins. */
  private sendReward(): void {
    const uid = this.uid;
    const user = this.user;
    if (!uid || !this.ready || user.pending <= 0) return;
    const amount = Math.min(user.pending, this.config.maxRewardPerWrite);
    void this.enqueue(async () => {
      const before = this.visible();
      try {
        const backend = await this.backend();
        const snapshot = await backend.reward(uid, amount);
        user.pending -= amount;
        this.merge(user, snapshot, false);
        user.nextRewardAt = this.now() + this.rewardGapMs();
        this.rewardFailures = 0;
      } catch {
        // Refused (too soon for the server's clock) or no network: the coins stay pending.
        this.rewardFailures++;
        user.nextRewardAt = this.now() + Math.max(this.rewardGapMs(), this.retryDelay(this.rewardFailures));
      }
      this.persist();
      if (uid !== this.uid) return;
      this.emitIfChanged(before);
      this.scheduleReward();
    });
  }

  private flushEquip(): void {
    const uid = this.uid;
    const user = this.user;
    if (!uid || !this.ready || !user.equipDirty || this.equipSending) return;
    this.equipSending = true;
    const sent = user.inventory.equipped;
    void this.enqueue(async () => {
      let lost = false;
      try {
        const backend = await this.backend();
        await backend.equip(uid, sent);
        if (sameEquipped(user.inventory.equipped, sent)) user.equipDirty = false;
      } catch (error) {
        // Refused: the server keeps its version (loaded next time). Otherwise retry later.
        if (errorCode(error) === 'permission-denied') user.equipDirty = false;
        else lost = true;
      } finally {
        this.equipSending = false;
      }
      this.persist();
      if (uid !== this.uid) return;
      if (lost) this.connectionLost();
      else this.flushEquip(); // changed again while it was being written
    });
  }

  private flushName(): void {
    const uid = this.uid;
    const user = this.user;
    const name = user.name;
    if (!uid || !this.ready || !user.nameDirty || name === null || this.nameSending) return;
    this.nameSending = true;
    void this.enqueue(async () => {
      let lost = false;
      try {
        const backend = await this.backend();
        await backend.rename(uid, name);
        if (user.name === name) user.nameDirty = false;
      } catch (error) {
        if (errorCode(error) === 'permission-denied') user.nameDirty = false;
        else lost = true;
      } finally {
        this.nameSending = false;
      }
      this.persist();
      if (uid !== this.uid) return;
      if (lost) this.connectionLost();
      else this.flushName();
    });
  }

  /** A write failed for lack of network: read the document again later and resend. */
  private connectionLost(): void {
    this.ready = false;
    this.openFailures++;
    this.retryLater();
  }

  private retryLater(): void {
    if (this.retryTimer !== null) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, this.retryDelay(this.openFailures));
  }

  /** base × 2^(failures − 1), capped. */
  private retryDelay(failures: number): number {
    const { retryBaseMs, retryMaxMs } = this.config;
    return Math.min(retryMaxMs, retryBaseMs * 2 ** Math.max(0, failures - 1));
  }

  private rewardGapMs(): number {
    return this.config.rewardIntervalSeconds * 1000 + this.config.rewardMarginMs;
  }

  /** Runs `task` after every queued one (one write at a time). */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  // ---------- State ----------

  /** What the player sees: the confirmed coins plus the pending ones. */
  private visible(): Inventory {
    const { inventory, pending } = this.user;
    return { ...inventory, coins: inventory.coins + pending };
  }

  private entry(key: string): CachedUser {
    let user = this.users.get(key);
    if (!user) {
      user = blankUser();
      this.users.set(key, user);
    }
    return user;
  }

  private persist(): void {
    const users: Record<string, CachedUser> = {};
    for (const [key, user] of this.users) {
      if (key !== NO_ACCOUNT || user.pending > 0 || user.equipDirty) users[key] = user;
    }
    saveJson(this.store, CLOUD_CACHE_KEY, { last: this.key, users });
  }

  private emit(): void {
    const inventory = this.visible();
    for (const listener of this.listeners) listener(inventory);
  }

  private emitIfChanged(before: Inventory): void {
    if (!sameInventory(before, this.visible())) this.emit();
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private clearTimers(): void {
    this.clearRetry();
    if (this.rewardTimer !== null) clearTimeout(this.rewardTimer);
    this.rewardTimer = null;
  }
}
