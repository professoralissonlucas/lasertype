import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config.ts';
import {
  dailyBonusFields,
  equipFields,
  profileFields,
  purchaseFields,
  rewardWrite,
  unlockFields,
  type DailyBonusAttempt,
  type OpenedUser,
  type PurchaseAttempt,
  type RewardAttempt,
  type RewardBatch,
  type UnlockAttempt,
  type UserBackend,
  type UserSnapshot,
} from '../firebase/profile.ts';
import { achievementFor } from '../progression/achievements.ts';
import { emptyGain, emptyProgress, matchGain } from '../progression/progress.ts';
import { dayWith, matchReport } from '../progression/testing.ts';
import type { Progress } from '../progression/types.ts';
import { chestCoins } from '../progression/xp.ts';
import { defaultNickname } from '../profile/nickname.ts';
import { dayIndex } from '../utils/day.ts';
import { memoryStore } from '../utils/storage.ts';
import type { DailyBonus } from './dailyBonus.ts';
import { CLOUD_CACHE_KEY, FirestoreInventoryRepository } from './firestoreRepository.ts';
import { INVENTORY_KEY } from './repository.ts';
import type { Equipped, Inventory } from './types.ts';

const NOON = Date.parse('2026-11-22T12:00:00Z');
const MAX = CONFIG.sync.maxRewardPerWrite;
/** isReward → changed().hasOnly([...]) (rules.test.ts checks the real list). */
const REWARD_FIELDS = ['coins', 'lastLogin', 'lastReward', 'level', 'stats', 'streak', 'xp'];
const INTERVAL_MS = CONFIG.sync.rewardIntervalSeconds * 1000;

const firestoreError = (code: string) => Object.assign(new Error(code), { code });

interface ServerDoc {
  coins: number;
  owned: Record<string, true>;
  equipped: Equipped;
  lastPurchase: string | null;
  name: string;
  lastReward: number;
  /** stats.dailyDay */
  dailyDay: number | null;
  progress: Progress;
  /** stats.batch */
  batch: string | null;
}

interface Write {
  readonly kind: 'create' | 'reward' | 'bonus' | 'purchase' | 'unlock' | 'equip' | 'profile';
  readonly uid: string;
  /** Top-level fields the write touched. */
  readonly fields: readonly string[];
  readonly amount?: number;
  readonly at: number;
}

const topLevel = (fields: object): string[] => [...new Set(Object.keys(fields).map((key) => key.split('.')[0] ?? key))].sort();

/** Firestore stand-in that enforces the same limits as firestore.rules (on its own clock). */
class FakeServer implements UserBackend {
  readonly docs = new Map<string, ServerDoc>();
  readonly writes: Write[] = [];
  offline = false;
  refuseRewards = 0;
  refuseBonuses = false;
  /** Commits the next bonus but loses the answer on the way back. */
  loseBonusAnswer = false;
  /** The same for the next reward. */
  loseRewardAnswer = false;
  refusePurchases = false;
  /** The rules without isUnlock(). */
  refuseUnlocks = false;
  private active = 0;
  maxActive = 0;

  seed(uid: string, doc: Partial<ServerDoc> = {}): void {
    this.docs.set(uid, {
      coins: 0,
      owned: {},
      equipped: {},
      lastPurchase: null,
      name: 'Servidor',
      lastReward: Date.now() - 3_600_000,
      dailyDay: null,
      progress: emptyProgress(),
      batch: null,
      ...doc,
    });
  }

  doc(uid: string): ServerDoc {
    const doc = this.docs.get(uid);
    if (!doc) throw new Error(`no doc ${uid}`);
    return doc;
  }

  private snapshot(doc: ServerDoc): UserSnapshot {
    const inventory: Inventory = {
      coins: doc.coins,
      owned: { ...doc.owned },
      equipped: { ...doc.equipped },
      lastPurchase: doc.lastPurchase,
    };
    const { name, lastReward, dailyDay, progress, batch } = doc;
    return { inventory, name, lastReward, dailyDay, progress, batch };
  }

  /** Every call takes a network round trip; counts overlapping calls. */
  private async call<T>(body: () => T): Promise<T> {
    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      await Promise.resolve();
      if (this.offline) throw firestoreError('unavailable');
      return body();
    } finally {
      this.active--;
    }
  }

  open(uid: string, name: string): Promise<OpenedUser> {
    return this.call(() => {
      const existing = this.docs.get(uid);
      if (existing) return { snapshot: this.snapshot(existing), created: false };
      this.seed(uid, { name, lastReward: Date.now() });
      this.writes.push({ kind: 'create', uid, fields: [], at: Date.now() });
      return { snapshot: { ...this.snapshot(this.doc(uid)), lastReward: null }, created: true };
    });
  }

  /** isReward: 0 ≤ gain ≤ 150 and request.time > lastReward + 30 s. */
  private checkReward(doc: ServerDoc, amount: number, now: number): void {
    if (this.refuseRewards > 0 || amount > MAX || amount < 0 || !(now > doc.lastReward + INTERVAL_MS)) {
      this.refuseRewards = Math.max(0, this.refuseRewards - 1);
      throw firestoreError('permission-denied');
    }
  }

  dailyBonus(uid: string, day: number, amount: number): Promise<DailyBonusAttempt> {
    return this.call((): DailyBonusAttempt => {
      const doc = this.doc(uid);
      const now = Date.now();
      if (doc.dailyDay !== null && doc.dailyDay >= day) return { kind: 'alreadyPaid', snapshot: this.snapshot(doc) };
      if (this.refuseBonuses) throw firestoreError('permission-denied');
      this.checkReward(doc, amount, now);
      const fields = dailyBonusFields(doc.coins, amount, day, now);
      doc.coins = fields.coins;
      doc.lastReward = now;
      doc.dailyDay = day;
      this.writes.push({ kind: 'bonus', uid, fields: topLevel(fields), amount, at: now });
      if (this.loseBonusAnswer) {
        this.loseBonusAnswer = false;
        throw firestoreError('unavailable');
      }
      return { kind: 'paid', snapshot: { ...this.snapshot(doc), lastReward: null } };
    });
  }

  reward(uid: string, batch: RewardBatch): Promise<RewardAttempt> {
    return this.call((): RewardAttempt => {
      const doc = this.doc(uid);
      const now = Date.now();
      if (doc.batch === batch.id) return { kind: 'alreadyWritten', snapshot: this.snapshot(doc) };
      const { fields, coins, progress, paid } = rewardWrite(doc, batch, now);
      this.checkReward(doc, paid, now);
      const xpGain = progress.xp - doc.progress.xp;
      if (!Number.isInteger(xpGain) || xpGain < 0 || xpGain > 2000) throw firestoreError('permission-denied');
      doc.coins = coins;
      doc.progress = progress;
      doc.batch = batch.id;
      doc.lastReward = now;
      this.writes.push({ kind: 'reward', uid, fields: topLevel(fields), amount: paid, at: now });
      if (this.loseRewardAnswer) {
        this.loseRewardAnswer = false;
        throw firestoreError('unavailable');
      }
      return { kind: 'written', snapshot: { ...this.snapshot(doc), lastReward: null } };
    });
  }

  /** isUnlock: an achievement item, not owned yet; nothing else changes. */
  unlock(uid: string, itemId: string): Promise<UnlockAttempt> {
    return this.call((): UnlockAttempt => {
      const doc = this.doc(uid);
      if (doc.owned[itemId]) return { kind: 'owned', snapshot: this.snapshot(doc) };
      if (this.refuseUnlocks || !achievementFor(itemId)) throw firestoreError('permission-denied');
      doc.owned = { ...doc.owned, [itemId]: true };
      doc.lastPurchase = itemId;
      this.writes.push({ kind: 'unlock', uid, fields: topLevel(unlockFields(itemId)), at: Date.now() });
      return { kind: 'unlocked', snapshot: this.snapshot(doc) };
    });
  }

  purchase(uid: string, itemId: string, price: number): Promise<PurchaseAttempt> {
    return this.call((): PurchaseAttempt => {
      const doc = this.doc(uid);
      if (doc.owned[itemId]) return { kind: 'owned', snapshot: this.snapshot(doc) };
      if (doc.coins < price) return { kind: 'insufficient', snapshot: this.snapshot(doc) };
      if (this.refusePurchases) throw firestoreError('permission-denied');
      const fields = purchaseFields(doc.coins, itemId, price);
      doc.coins -= price;
      doc.owned = { ...doc.owned, [itemId]: true };
      doc.lastPurchase = itemId;
      this.writes.push({ kind: 'purchase', uid, fields: topLevel(fields), at: Date.now() });
      return { kind: 'bought', snapshot: this.snapshot(doc) };
    });
  }

  equip(uid: string, equipped: Equipped): Promise<void> {
    return this.call(() => {
      const fields = equipFields(equipped);
      this.doc(uid).equipped = { ...fields.equipped };
      this.writes.push({ kind: 'equip', uid, fields: topLevel(fields), at: Date.now() });
    });
  }

  rename(uid: string, name: string): Promise<void> {
    return this.call(() => {
      const fields = profileFields(name);
      this.doc(uid).name = name;
      this.writes.push({ kind: 'profile', uid, fields: topLevel(fields), at: Date.now() });
    });
  }

  kinds(): string[] {
    return this.writes.map((write) => write.kind);
  }
}

function setup(initial: Record<string, string> = {}) {
  const store = memoryStore(initial);
  const server = new FakeServer();
  const make = () => new FirestoreInventoryRepository({ store, backend: async () => server });
  return { store, server, make, repo: make() };
}

/** Lets queued writes and due timers run. */
const settle = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers({ now: NOON });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FirestoreInventoryRepository — first session', () => {
  it('creates users/{uid} with "Piloto" + 4 digits, 0 coins and nothing owned', async () => {
    const { repo, server } = setup();
    repo.setUser('u1');
    await settle();
    expect(server.kinds()).toEqual(['create']);
    expect(server.doc('u1')).toMatchObject({ coins: 0, owned: {}, name: defaultNickname('u1'), lastReward: NOON });
    expect(repo.name).toBe(defaultNickname('u1'));
    expect(repo.name).toMatch(/^Piloto[0-9]{4}$/);
  });

  it('reads an existing document instead of creating it', async () => {
    const { repo, server } = setup();
    server.seed('u1', { coins: 700, owned: { theme_void: true }, equipped: { theme: 'theme_void' }, name: 'Ana' });
    const seen: Inventory[] = [];
    repo.subscribe((inventory) => seen.push(inventory));
    repo.setUser('u1');
    await settle();
    expect(server.writes).toEqual([]);
    expect(repo.load()).toMatchObject({ coins: 700, owned: { theme_void: true }, equipped: { theme: 'theme_void' } });
    expect(repo.name).toBe('Ana');
    expect(seen.at(-1)?.coins).toBe(700);
  });

  it('ignores the old offline-phase progress (lasertype.inventory.v1)', () => {
    const { repo } = setup({ [INVENTORY_KEY]: JSON.stringify({ coins: 5000, owned: { cannon_halo: true } }) });
    expect(repo.load()).toMatchObject({ coins: 0, owned: {} });
  });

  it('shows the cache of the last account at once (before the auth answers)', async () => {
    const first = setup();
    first.server.seed('u1', { coins: 420 });
    first.repo.setUser('u1');
    await settle();
    expect(first.make().load().coins).toBe(420);
  });
});

describe('FirestoreInventoryRepository — rewards', () => {
  it('shows coins at once and sends them 30 s after the previous reward write', async () => {
    const { repo, server } = setup();
    repo.setUser('u1'); // created now: lastReward = NOON
    await settle();
    expect(repo.reward(100).coins).toBe(100);
    expect(repo.pendingCoins).toBe(100);
    await settle(INTERVAL_MS - 1000);
    expect(server.doc('u1').coins).toBe(0);
    await settle(5000);
    expect(server.doc('u1').coins).toBe(100);
    expect(repo.pendingCoins).toBe(0);
    expect(repo.load().coins).toBe(100);
    expect(server.writes.at(-1)).toMatchObject({ kind: 'reward', fields: REWARD_FIELDS, amount: 100 });
  });

  it('splits big rewards into writes of at most 150, 30 s apart, losing nothing', async () => {
    const { repo, server } = setup();
    repo.setUser('u1');
    await settle();
    repo.reward(100);
    repo.reward(100);
    repo.reward(100);
    repo.reward(100);
    expect(repo.load().coins).toBe(400);
    await settle(5 * 60_000);
    const rewards = server.writes.filter((write) => write.kind === 'reward');
    expect(rewards.map((write) => write.amount)).toEqual([150, 150, 100]);
    for (let i = 1; i < rewards.length; i++) {
      expect((rewards[i]?.at ?? 0) - (rewards[i - 1]?.at ?? 0)).toBeGreaterThan(INTERVAL_MS);
    }
    expect(server.doc('u1').coins).toBe(400);
    expect(repo.load().coins).toBe(400);
  });

  it('keeps refused rewards pending and sends them later', async () => {
    const { repo, server } = setup();
    repo.setUser('u1');
    await settle();
    server.refuseRewards = 2;
    repo.reward(90);
    await settle(10 * 60_000);
    expect(server.doc('u1').coins).toBe(90);
    expect(repo.pendingCoins).toBe(0);
  });

  it('keeps pending coins through the network going down', async () => {
    const { repo, server } = setup();
    repo.setUser('u1');
    await settle();
    server.offline = true;
    repo.reward(60);
    await settle(3 * 60_000);
    expect(repo.load().coins).toBe(60);
    expect(server.doc('u1').coins).toBe(0);
    server.offline = false;
    await settle(5 * 60_000);
    expect(server.doc('u1').coins).toBe(60);
  });

  it('keeps pending coins in the cache for the next session', async () => {
    const { repo, server, make, store } = setup();
    repo.setUser('u1');
    await settle();
    repo.reward(80); // the tab closes before the 30 s
    expect(JSON.parse(store.data.get(CLOUD_CACHE_KEY) ?? '{}')).toMatchObject({ last: 'u1', users: { u1: { pending: 80 } } });

    const next = make();
    expect(next.load().coins).toBe(80);
    next.setUser('u1');
    await settle(INTERVAL_MS + 5000);
    expect(server.doc('u1').coins).toBe(80);
  });

  it('coins earned before any account answered go to the first account that does', async () => {
    const { repo, server } = setup();
    expect(repo.name).toBeNull();
    repo.reward(50);
    expect(repo.load().coins).toBe(50);
    repo.setUser('u1');
    await settle(INTERVAL_MS + 5000);
    expect(server.doc('u1').coins).toBe(50);
  });
});

describe('FirestoreInventoryRepository — progression', () => {
  const TODAY = dayIndex(NOON);
  const xp = (amount: number) => ({ ...emptyGain(), xp: amount });

  async function ready(doc: Partial<ServerDoc> = {}) {
    const all = setup();
    all.server.seed('u1', doc);
    all.repo.setUser('u1');
    await settle();
    return all;
  }

  it('XP, chests and missions show at once and go with the coins in one reward write', async () => {
    const { repo, server } = await ready();
    const { day, mission } = dayWith('words');
    const gain = matchGain(matchReport({ destroyed: mission.target, letters: 100, score: 0, maxCombo: 0, accuracy: 0, burst: 0, wave: 1, empUses: 0 }), day);
    repo.reward(30, gain);
    const earned = 30 + mission.coins + chestCoins(2);
    expect(repo.load().coins).toBe(earned);
    expect(repo.progress()).toMatchObject({ xp: 100 + 2 * mission.target, level: 2 });
    await settle();
    expect(server.writes).toEqual([{ kind: 'reward', uid: 'u1', fields: REWARD_FIELDS, amount: earned, at: NOON }]);
    expect(server.doc('u1').coins).toBe(earned);
    expect(server.doc('u1').progress).toMatchObject({ level: 2, owed: 0, stats: { games: 1 } });
    expect(server.doc('u1').progress.missions?.paid[mission.slot]).toBe(true);
    expect(repo.load().coins).toBe(earned);
    expect(repo.pendingCoins).toBe(0);
  });

  it('what is beyond 150 stays owed in the document and is paid 30 s apart', async () => {
    const { repo, server } = await ready();
    repo.reward(100, xp(1400)); // levels 2 to 5
    const earned = 100 + [2, 3, 4, 5].reduce((sum, level) => sum + chestCoins(level), 0);
    expect(repo.load().coins).toBe(earned);
    await settle();
    expect(server.doc('u1').coins).toBe(150);
    expect(server.doc('u1').progress.owed).toBe(earned - 150);
    expect(repo.load().coins).toBe(earned);
    await settle(10 * 60_000);
    expect(server.doc('u1').coins).toBe(earned);
    expect(server.doc('u1').progress.owed).toBe(0);
    expect(repo.load().coins).toBe(earned);
    for (const write of server.writes) expect(write.amount).toBeLessThanOrEqual(MAX);
    for (let i = 1; i < server.writes.length; i++) {
      expect((server.writes[i]?.at ?? 0) - (server.writes[i - 1]?.at ?? 0)).toBeGreaterThan(INTERVAL_MS);
    }
  });

  it('coins owed are seen, and paid, by another device', async () => {
    const { repo, server } = await ready();
    repo.reward(0, xp(1400));
    await settle();
    repo.equip({}); // this device goes quiet from here
    const owed = server.doc('u1').progress.owed;
    expect(owed).toBeGreaterThan(0);
    const other = new FirestoreInventoryRepository({ store: memoryStore(), backend: async () => server });
    other.setUser('u1');
    await settle();
    expect(other.load().coins).toBe(150 + owed);
    expect(other.progress().level).toBe(5);
  });

  it('coins still owed cannot be spent yet', async () => {
    const { repo } = await ready();
    repo.reward(0, xp(1400));
    await settle();
    expect(repo.load().coins).toBeGreaterThanOrEqual(210);
    expect(await repo.purchase('laser_emerald', 210)).toEqual({ ok: false, error: 'syncing' });
  });

  it('a lost answer is not paid again, and nothing earned meanwhile is lost', async () => {
    const { repo, server } = await ready();
    server.loseRewardAnswer = true;
    repo.reward(90, xp(150));
    await settle();
    expect(server.doc('u1').coins).toBe(90);
    repo.reward(20, xp(30));
    await settle(10 * 60_000);
    expect(server.doc('u1').coins).toBe(110);
    expect(server.doc('u1').progress.xp).toBe(180);
    expect(repo.load().coins).toBe(110);
    expect(repo.progress().xp).toBe(180);
    expect(server.kinds()).toEqual(['reward', 'reward']);
  });

  it('a lost answer is noticed after a reload too', async () => {
    const { repo, server, store } = await ready();
    server.loseRewardAnswer = true;
    repo.reward(90, xp(150));
    await settle();
    const next = new FirestoreInventoryRepository({ store, backend: async () => server });
    expect(next.load().coins).toBe(90);
    next.setUser('u1');
    await settle(10 * 60_000);
    expect(next.load().coins).toBe(90);
    expect(next.progress().xp).toBe(150);
    expect(server.doc('u1').coins).toBe(90);
  });

  it('two devices crossing the same level are paid one chest', async () => {
    const { repo, server } = await ready({ progress: { ...emptyProgress(), xp: 190 } });
    const other = new FirestoreInventoryRepository({ store: memoryStore(), backend: async () => server });
    other.setUser('u1');
    await settle();
    repo.reward(0, xp(20));
    other.reward(0, xp(20));
    await settle(10 * 60_000);
    expect(server.doc('u1').progress).toMatchObject({ xp: 230, level: 2 });
    expect(server.doc('u1').coins).toBe(chestCoins(2));
    expect(other.load().coins).toBe(chestCoins(2));
  });

  it('XP above 2000 goes in several writes', async () => {
    const { repo, server } = await ready();
    repo.reward(0, xp(4500));
    expect(repo.progress().xp).toBe(4500);
    await settle(30 * 60_000);
    expect(server.doc('u1').progress.xp).toBe(4500);
    expect(repo.progress().xp).toBe(4500);
    expect(server.doc('u1').coins).toBe(repo.load().coins);
  });

  it('counts the login once the document was read, once per day, on every device', async () => {
    const { repo, server } = setup();
    server.seed('u1', { progress: { ...emptyProgress(), streak: 2, lastLogin: TODAY - 1 } });
    expect(repo.login(TODAY)).toBeNull();
    repo.setUser('u1');
    await settle();
    expect(repo.login(TODAY)).toEqual({ streak: 3, coins: 40 });
    expect(repo.login(TODAY)).toBeNull();
    expect(repo.load().coins).toBe(40);
    await settle(60_000);
    expect(server.doc('u1')).toMatchObject({ coins: 40, progress: { streak: 3, lastLogin: TODAY } });
    const other = new FirestoreInventoryRepository({ store: memoryStore(), backend: async () => server });
    other.setUser('u1');
    await settle();
    expect(other.login(TODAY)).toBeNull();
  });

  it('two devices opened at the same moment are paid one login', async () => {
    const { repo, server } = await ready();
    const other = new FirestoreInventoryRepository({ store: memoryStore(), backend: async () => server });
    other.setUser('u1');
    await settle();
    expect(repo.login(TODAY)).not.toBeNull();
    expect(other.login(TODAY)).not.toBeNull(); // neither knows about the other yet
    await settle(10 * 60_000);
    expect(server.doc('u1')).toMatchObject({ coins: 20, progress: { streak: 1 } });
    expect(repo.load().coins).toBe(20);
    expect(other.load().coins).toBe(20);
  });

  it('keeps what was not sent for the next session', async () => {
    const { repo, server, store } = await ready();
    server.offline = true;
    repo.login(TODAY);
    repo.reward(50, xp(260));
    await settle(60_000);
    const next = new FirestoreInventoryRepository({ store, backend: async () => server });
    const earned = 20 + 50 + chestCoins(2);
    expect(next.load().coins).toBe(earned);
    expect(next.progress()).toMatchObject({ xp: 260, level: 2, streak: 1 });
    server.offline = false;
    next.setUser('u1');
    await settle(5 * 60_000);
    expect(server.doc('u1')).toMatchObject({ coins: earned, progress: { xp: 260, level: 2, streak: 1 } });
  });

  it('progress made before any account answered goes to the first account that does', async () => {
    const { repo, server } = setup();
    repo.reward(0, xp(120));
    expect(repo.progress().xp).toBe(120);
    repo.setUser('u1');
    await settle(INTERVAL_MS + 5000);
    expect(server.doc('u1').progress.xp).toBe(120);
    expect(repo.progress().xp).toBe(120);
  });

  it('each account keeps its own progress', async () => {
    const { repo, server } = await ready({ progress: { ...emptyProgress(), xp: 300, level: 2 } });
    server.seed('google', { progress: { ...emptyProgress(), xp: 9000, level: 13 } });
    let emits = 0;
    repo.subscribe(() => emits++);
    repo.setUser('google');
    await settle();
    expect(repo.progress()).toMatchObject({ xp: 9000, level: 13 });
    expect(emits).toBeGreaterThan(0);
  });

  it('drops tampered progress from the cache', () => {
    const user = { progress: { xp: 'x' }, gain: { xp: -5, logins: ['x'] }, batch: { coins: 10 }, pending: Number.NaN };
    const { repo } = setup({ [CLOUD_CACHE_KEY]: JSON.stringify({ last: 'u1', users: { u1: user } }) });
    expect(repo.progress()).toEqual(emptyProgress());
    expect(repo.load().coins).toBe(0);
  });
});

describe('FirestoreInventoryRepository — achievement items', () => {
  async function ready() {
    const all = setup();
    all.server.seed('u1', { coins: 70 });
    all.repo.setUser('u1');
    await settle();
    return all;
  }

  it('are released in a write of their own: owned and lastPurchase, coins untouched', async () => {
    const { repo, server } = await ready();
    const result = await repo.unlock('cannon_golden');
    expect(result).toEqual({ ok: true, inventory: expect.objectContaining({ coins: 70, owned: { cannon_golden: true } }) });
    expect(server.writes).toEqual([{ kind: 'unlock', uid: 'u1', fields: ['lastPurchase', 'owned'], at: NOON }]);
    expect(server.doc('u1')).toMatchObject({ coins: 70, owned: { cannon_golden: true }, lastPurchase: 'cannon_golden' });
  });

  it('already released on another device → owned, nothing written', async () => {
    const { repo, server } = await ready();
    server.doc('u1').owned = { cannon_golden: true };
    expect(await repo.unlock('cannon_golden')).toMatchObject({ ok: true });
    expect(server.writes).toEqual([]);
    expect(repo.load().owned).toEqual({ cannon_golden: true });
  });

  it('refused by the rules (not published yet) → nothing changes', async () => {
    const { repo, server } = await ready();
    server.refuseUnlocks = true;
    expect(await repo.unlock('cannon_golden')).toEqual({ ok: false, error: 'refused' });
    expect(repo.load().owned).toEqual({});
  });

  it('is offline without an account or a connection', async () => {
    const { repo, server } = await ready();
    expect(await setup().repo.unlock('cannon_golden')).toEqual({ ok: false, error: 'offline' });
    server.offline = true;
    const pending = repo.unlock('cannon_golden');
    await settle();
    expect(await pending).toEqual({ ok: false, error: 'offline' });
  });

  it('waits its turn: one write at a time', async () => {
    const { repo, server } = await ready();
    repo.reward(50);
    const unlocking = repo.unlock('cannon_golden');
    const other = repo.unlock('border_golden');
    await settle(60_000);
    expect((await unlocking).ok && (await other).ok).toBe(true);
    expect(server.maxActive).toBe(1);
    expect(server.kinds().sort()).toEqual(['reward', 'unlock', 'unlock']);
    expect(server.doc('u1')).toMatchObject({ coins: 120, owned: { cannon_golden: true, border_golden: true } });
  });
});

describe('FirestoreInventoryRepository — Daily Challenge bonus', () => {
  const TODAY = dayIndex(NOON);
  const bonus = (day: number, coins = 100): DailyBonus => ({ day, position: 3, coins });

  async function ready(doc: Partial<ServerDoc> = {}) {
    const all = setup();
    all.server.seed('u1', { coins: 500, ...doc });
    all.repo.setUser('u1');
    await settle();
    const paid: DailyBonus[] = [];
    all.repo.subscribeBonus((entry) => paid.push(entry));
    return { ...all, paid };
  }

  it('is a reward write of its own that marks the day; it counts once the server accepted it', async () => {
    const { repo, server, paid } = await ready();
    repo.settleDaily(TODAY - 1, bonus(TODAY - 1));
    expect(repo.load().coins).toBe(500);
    expect(repo.dailySettled).toBe(TODAY - 1);
    await settle();
    expect(server.writes).toEqual([
      { kind: 'bonus', uid: 'u1', fields: ['coins', 'lastReward', 'stats'], amount: 100, at: NOON },
    ]);
    expect(server.doc('u1')).toMatchObject({ coins: 600, dailyDay: TODAY - 1 });
    expect(repo.load().coins).toBe(600);
    expect(paid).toEqual([bonus(TODAY - 1)]);
  });

  it('never mixes with the match coins: separate writes, at most 150, 30 s apart', async () => {
    const { repo, server, paid } = await ready();
    repo.reward(90);
    repo.settleDaily(TODAY - 2, bonus(TODAY - 2, 150));
    repo.settleDaily(TODAY - 1, bonus(TODAY - 1, 70));
    await settle(5 * 60_000);
    expect(server.writes.map((write) => [write.kind, write.amount])).toEqual([
      ['bonus', 150],
      ['bonus', 70],
      ['reward', 90],
    ]);
    for (let i = 1; i < server.writes.length; i++) {
      expect((server.writes[i]?.at ?? 0) - (server.writes[i - 1]?.at ?? 0)).toBeGreaterThan(INTERVAL_MS);
    }
    expect(server.doc('u1')).toMatchObject({ coins: 500 + 150 + 70 + 90, dailyDay: TODAY - 1 });
    expect(paid.map((entry) => entry.day)).toEqual([TODAY - 2, TODAY - 1]);
  });

  it('is paid once when two devices find the same day', async () => {
    const { repo, server, paid } = await ready();
    const other = new FirestoreInventoryRepository({ store: memoryStore(), backend: async () => server });
    const otherPaid: DailyBonus[] = [];
    other.subscribeBonus((entry) => otherPaid.push(entry));
    other.setUser('u1');
    await settle();
    repo.settleDaily(TODAY - 1, bonus(TODAY - 1));
    other.settleDaily(TODAY - 1, bonus(TODAY - 1));
    await settle(5 * 60_000);
    expect(server.kinds()).toEqual(['bonus']);
    expect(server.doc('u1').coins).toBe(600);
    expect(paid.length + otherPaid.length).toBe(1);
    expect(repo.load().coins).toBe(600);
    expect(other.load().coins).toBe(600);
  });

  it('a lost answer is not paid again', async () => {
    const { repo, server, paid } = await ready();
    server.loseBonusAnswer = true;
    repo.settleDaily(TODAY - 1, bonus(TODAY - 1));
    await settle(5 * 60_000);
    expect(server.kinds()).toEqual(['bonus']);
    expect(server.doc('u1').coins).toBe(600);
    expect(repo.load().coins).toBe(600);
    expect(paid).toEqual([]);
  });

  it('settling a day twice queues its bonus once; a day without a bonus queues nothing', async () => {
    const { repo, server } = await ready();
    repo.settleDaily(TODAY - 2, null);
    repo.settleDaily(TODAY - 1, bonus(TODAY - 1));
    repo.settleDaily(TODAY - 1, bonus(TODAY - 1));
    await settle(5 * 60_000);
    expect(server.kinds()).toEqual(['bonus']);
  });

  it('waits out the network going down', async () => {
    const { repo, server, paid } = await ready();
    server.offline = true;
    repo.settleDaily(TODAY - 1, bonus(TODAY - 1));
    await settle(60_000);
    expect(server.doc('u1').coins).toBe(500);
    expect(paid).toEqual([]);
    server.offline = false;
    await settle(5 * 60_000);
    expect(server.doc('u1').coins).toBe(600);
    expect(paid).toEqual([bonus(TODAY - 1)]);
  });

  it('is kept in the cache for the next session', async () => {
    const closed = await ready();
    closed.server.offline = true;
    closed.repo.settleDaily(TODAY - 1, bonus(TODAY - 1)); // the tab closes before it is sent

    const next = setup({ [CLOUD_CACHE_KEY]: closed.store.data.get(CLOUD_CACHE_KEY) ?? '' });
    next.server.seed('u1', { coins: 500 });
    expect(next.repo.dailySettled).toBe(TODAY - 1);
    const paid: DailyBonus[] = [];
    next.repo.subscribeBonus((entry) => paid.push(entry));
    next.repo.setUser('u1');
    await settle();
    expect(next.server.doc('u1')).toMatchObject({ coins: 600, dailyDay: TODAY - 1 });
    expect(paid).toEqual([bonus(TODAY - 1)]);
  });

  it('a bonus that keeps being refused never blocks the match coins', async () => {
    const { repo, server } = await ready();
    server.refuseBonuses = true;
    repo.settleDaily(TODAY - 1, bonus(TODAY - 1));
    repo.reward(100);
    repo.reward(100);
    await settle(20 * 60_000);
    expect(server.doc('u1').coins).toBe(700);
    expect(repo.pendingCoins).toBe(0);
  });

  it('knows the days paid on another device, but ignores a day in the future', async () => {
    expect((await ready({ dailyDay: TODAY - 1 })).repo.dailySettled).toBe(TODAY - 1);
    expect((await ready({ dailyDay: TODAY + 400 })).repo.dailySettled).toBeNull();
  });

  it('is ready only once the document was read, and for the account in use', async () => {
    const { repo, server } = setup();
    expect(repo.readyUid).toBeNull();
    server.offline = true;
    repo.setUser('u1');
    await settle();
    expect(repo.readyUid).toBeNull();
    server.offline = false;
    await settle(60_000);
    expect(repo.readyUid).toBe('u1');
  });

  it('drops tampered bonuses from the cache', () => {
    const bonuses = [bonus(TODAY - 1), bonus(TODAY - 2, 9999), { day: 'x', position: 1, coins: 10 }, null];
    const { repo, store } = setup({
      [CLOUD_CACHE_KEY]: JSON.stringify({ last: 'u1', users: { u1: { bonuses, dailySettled: 'soon' } } }),
    });
    expect(repo.dailySettled).toBeNull();
    repo.reward(1); // writes the cache back
    const cache = JSON.parse(store.data.get(CLOUD_CACHE_KEY) ?? '{}') as { users: { u1: { bonuses: unknown } } };
    expect(cache.users.u1.bonuses).toEqual([bonus(TODAY - 1)]);
  });
});

describe('FirestoreInventoryRepository — purchases', () => {
  it('buys in a transaction: coins, one owned key and lastPurchase', async () => {
    const { repo, server } = setup();
    server.seed('u1', { coins: 1000 });
    repo.setUser('u1');
    await settle();
    const result = await repo.purchase('cannon_twin', 900);
    expect(result).toEqual({ ok: true, inventory: expect.objectContaining({ coins: 100, lastPurchase: 'cannon_twin' }) });
    expect(server.doc('u1')).toMatchObject({ coins: 100, owned: { cannon_twin: true }, lastPurchase: 'cannon_twin' });
    expect(server.writes.at(-1)).toMatchObject({ kind: 'purchase', fields: ['coins', 'lastPurchase', 'owned'] });
  });

  it('a purchase refused by the rules charges nothing', async () => {
    const { repo, server } = setup();
    server.seed('u1', { coins: 1000 });
    repo.setUser('u1');
    await settle();
    server.refusePurchases = true;
    expect(await repo.purchase('cannon_twin', 900)).toEqual({ ok: false, error: 'refused' });
    expect(repo.load().coins).toBe(1000);
    expect(repo.load().owned).toEqual({});
  });

  it('is offline without an account or a connection', async () => {
    const { repo, server } = setup();
    expect(await repo.purchase('cannon_twin', 900)).toEqual({ ok: false, error: 'offline' });
    server.offline = true;
    repo.setUser('u1');
    await settle();
    expect(await repo.purchase('cannon_twin', 900)).toEqual({ ok: false, error: 'offline' });
  });

  it('enough coins only counting the pending ones → syncing', async () => {
    const { repo } = setup();
    repo.setUser('u1');
    await settle();
    repo.reward(500);
    expect(await repo.purchase('laser_emerald', 300)).toEqual({ ok: false, error: 'syncing' });
  });

  it('takes the server’s word when the item was bought on another device', async () => {
    const { repo, server } = setup();
    server.seed('u1', { coins: 1000 });
    repo.setUser('u1');
    await settle();
    server.doc('u1').owned = { cannon_twin: true };
    server.doc('u1').coins = 100;
    expect(await repo.purchase('cannon_twin', 900)).toEqual({ ok: false, error: 'owned' });
    expect(repo.load()).toMatchObject({ coins: 100, owned: { cannon_twin: true } });
  });
});

describe('FirestoreInventoryRepository — equip and nickname', () => {
  it('equip is its own write (only `equipped`), shown at once', async () => {
    const { repo, server } = setup();
    server.seed('u1', { owned: { theme_void: true } });
    repo.setUser('u1');
    await settle();
    expect(repo.equip({ theme: 'theme_void' }).equipped).toEqual({ theme: 'theme_void' });
    await settle();
    expect(server.writes.at(-1)).toMatchObject({ kind: 'equip', fields: ['equipped'] });
    expect(server.doc('u1').equipped).toEqual({ theme: 'theme_void' });
  });

  it('an equip made offline is written once the connection is back', async () => {
    const { repo, server } = setup();
    server.seed('u1', { owned: { theme_void: true } });
    repo.setUser('u1');
    await settle();
    server.offline = true;
    repo.equip({ theme: 'theme_void' });
    await settle(60_000);
    expect(server.doc('u1').equipped).toEqual({});
    server.offline = false;
    await settle(5 * 60_000);
    expect(server.doc('u1').equipped).toEqual({ theme: 'theme_void' });
    expect(repo.load().equipped).toEqual({ theme: 'theme_void' });
  });

  it('rename is a profile write with only the name', async () => {
    const { repo, server } = setup();
    repo.setUser('u1');
    await settle();
    const seen: number[] = [];
    repo.subscribe(() => seen.push(1));
    repo.rename('Ás do Laser');
    expect(repo.name).toBe('Ás do Laser');
    expect(seen.length).toBe(1);
    await settle();
    expect(server.writes.at(-1)).toMatchObject({ kind: 'profile', fields: ['name'] });
    expect(server.doc('u1').name).toBe('Ás do Laser');
  });

  it('ignores invalid nicknames', async () => {
    const { repo, server } = setup();
    repo.setUser('u1');
    await settle();
    repo.rename('no');
    await settle();
    expect(server.kinds()).toEqual(['create']);
  });
});

describe('FirestoreInventoryRepository — accounts and queue', () => {
  it('switching accounts loads the other document and keeps each cache apart', async () => {
    const { repo, server } = setup();
    server.seed('anon', { coins: 30 });
    server.seed('google', { coins: 900, owned: { cannon_twin: true }, name: 'Bia' });
    repo.setUser('anon');
    await settle();
    expect(repo.load().coins).toBe(30);
    const seen: Inventory[] = [];
    repo.subscribe((inventory) => seen.push(inventory));
    repo.setUser('google');
    await settle();
    expect(repo.load()).toMatchObject({ coins: 900, owned: { cannon_twin: true } });
    expect(repo.name).toBe('Bia');
    expect(seen.at(-1)?.coins).toBe(900);
  });

  it('sends one write at a time, each of a single kind', async () => {
    const { repo, server } = setup();
    server.seed('u1', { coins: 5000, owned: { theme_void: true } });
    repo.setUser('u1');
    repo.reward(120);
    repo.equip({ theme: 'theme_void' });
    repo.rename('Ana');
    const bought = repo.purchase('cannon_twin', 900);
    await settle(2 * 60_000);
    expect((await bought).ok).toBe(true);
    expect(server.maxActive).toBe(1);
    expect(server.kinds().sort()).toEqual(['equip', 'profile', 'purchase', 'reward']);
    expect(server.doc('u1')).toMatchObject({ coins: 5000 - 900 + 120, name: 'Ana', equipped: { theme: 'theme_void' } });
  });
});
