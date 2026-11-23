// users/{uid}: the player's account document. firestore.rules is the contract: the document
// is created once (coins 0, xp 0, owned {}, lastReward = request.time) and every later write
// is exactly ONE of the rules' update kinds, carrying only that kind's fields:
//   reward    coins, xp, level, streak, lastLogin, stats.*, lastReward (in a transaction), or
//             coins, lastReward, stats.dailyDay for a Daily Challenge bonus (never paid twice)
//   purchase  coins, owned.<id>, lastPurchase (in a transaction: the price must be exact)
//   unlock    owned.<id>, lastPurchase        (achievement items: free)
//   equip     equipped                        (one item per category, and the title)
//   profile   name                            (photo is never sent: no Google photo)
// The field builders are pure; rules.test.ts checks them against firestore.rules.
import { CONFIG } from '../config.ts';
import { applyUnlock, emptyInventory, parseInventory } from '../economy/inventory.ts';
import type { Equipped, Inventory } from '../economy/types.ts';
import { isValidNickname } from '../profile/nickname.ts';
import { applyGain, emptyProgress, parseProgress, STAT_KEYS } from '../progression/progress.ts';
import type { Progress, ProgressGain } from '../progression/types.ts';
import type { FirebaseSdk } from './app.ts';

export const USERS = 'users';

/** users/{uid} as the client reads it (parsed tolerantly: it is untrusted input). */
export interface UserSnapshot {
  readonly inventory: Inventory;
  readonly progress: Progress;
  /** stats.batch: id of the last reward batch written; null = none yet. */
  readonly batch: string | null;
  /** null = missing or not a valid nickname (callers fall back to the default). */
  readonly name: string | null;
  /** Server time of the last reward write (or of the creation) in ms; null when unknown. */
  readonly lastReward: number | null;
  /** stats.dailyDay: last game day whose Daily Challenge bonus was paid; null = none yet. */
  readonly dailyDay: number | null;
}

/** Fields of a new users/{uid}. `now` is serverTimestamp() (rules: lastReward == request.time). */
export interface NewUserFields<T> {
  readonly name: string;
  readonly coins: 0;
  readonly xp: 0;
  readonly level: number;
  readonly streak: number;
  readonly lastLogin: null;
  readonly owned: Readonly<Record<string, never>>;
  readonly equipped: Readonly<Record<string, never>>;
  readonly lastReward: T;
  readonly lastPurchase: null;
  readonly stats: { readonly games: number; readonly bestScore: number; readonly bestWpm: number };
}

export function newUserFields<T>(name: string, now: T): NewUserFields<T> {
  return {
    name,
    coins: 0,
    xp: 0,
    level: 1,
    streak: 0,
    lastLogin: null,
    owned: {},
    equipped: {},
    lastReward: now,
    lastPurchase: null,
    stats: { games: 0, bestScore: 0, bestWpm: 0 },
  };
}

/** Earned and not sent yet: frozen with an id, so a retry after a lost answer is not paid twice. */
export interface RewardBatch {
  readonly id: string;
  /** Match coins. */
  readonly coins: number;
  readonly gain: ProgressGain;
}

/** Progress as it is stored: `missions` and `owed` go inside `stats` (field paths: the rest of it stays). */
export function progressFields(progress: Progress): Readonly<Record<string, unknown>> {
  const { xp, level, streak, lastLogin, stats, missions, owed } = progress;
  return {
    xp,
    level,
    streak,
    lastLogin,
    ...Object.fromEntries(STAT_KEYS.map((key) => [`stats.${key}`, stats[key]])),
    'stats.missions': missions && { day: missions.day, progress: [...missions.progress], paid: [...missions.paid] },
    'stats.owed': owed,
  };
}

/**
 * Reward write: applies the batch on top of the server's progress. Everything it earns (match
 * coins, chests, missions, streak) is credited to `owed` with its marks, and up to `maxCoins`
 * of it is paid now; the rest stays owed in the document, for the next writes.
 */
export function rewardWrite<T>(
  before: { readonly coins: number; readonly progress: Progress },
  batch: RewardBatch,
  now: T,
  maxCoins: number = CONFIG.sync.maxRewardPerWrite,
) {
  const applied = applyGain(before.progress, batch.gain).progress;
  const owed = applied.owed + batch.coins;
  const paid = Math.min(owed, maxCoins);
  const coins = before.coins + paid;
  const progress: Progress = { ...applied, owed: owed - paid };
  const fields: Readonly<Record<string, unknown>> = {
    coins,
    ...progressFields(progress),
    'stats.batch': batch.id,
    lastReward: now,
  };
  return { fields, coins, paid, progress };
}

/** Reward write with coins only: the new balance and lastReward = serverTimestamp(). */
export function rewardFields<T>(coins: number, amount: number, now: T): { readonly coins: number; readonly lastReward: T } {
  return { coins: coins + amount, lastReward: now };
}

/**
 * Daily Challenge bonus: a reward write that also records the day paid (a field path, so the
 * rest of `stats` is untouched). Both land in the same write, so a day is never paid twice.
 */
export function dailyBonusFields<T>(
  coins: number,
  amount: number,
  day: number,
  now: T,
): { readonly coins: number; readonly lastReward: T; readonly 'stats.dailyDay': number } {
  return { ...rewardFields(coins, amount, now), 'stats.dailyDay': day };
}

const SAFE_ID = /^[A-Za-z0-9_]+$/;

/**
 * Purchase write: the balance minus the exact price, one new `owned` key (a field path, so
 * the rest of the map is untouched) and lastPurchase.
 */
export function purchaseFields(coins: number, itemId: string, price: number): Readonly<Record<string, number | string | boolean>> {
  if (!SAFE_ID.test(itemId)) throw new Error(`profile: unsafe item id ${itemId}`);
  return { coins: coins - price, [`owned.${itemId}`]: true, lastPurchase: itemId };
}

/** Unlock write: one new `owned` key (= lastPurchase). Free: coins must not change. */
export function unlockFields(itemId: string): Readonly<Record<string, string | boolean>> {
  if (!SAFE_ID.test(itemId)) throw new Error(`profile: unsafe item id ${itemId}`);
  return { [`owned.${itemId}`]: true, lastPurchase: itemId };
}

/** Equip write: the whole `equipped` map (missing category = its default). */
export function equipFields(equipped: Equipped): { readonly equipped: Equipped } {
  return { equipped: { ...equipped } };
}

/** Profile write: the nickname only. */
export function profileFields(name: string): { readonly name: string } {
  return { name };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A Firestore Timestamp (anything with toMillis()) in ms, else null. */
function timestampMillis(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const toMillis = value.toMillis;
  if (typeof toMillis !== 'function') return null;
  const ms: unknown = toMillis.call(value);
  return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
}

/** Document data → what the client uses (bad coins → 0, unknown items dropped, bad name → null). */
export function parseUserDoc(data: unknown): UserSnapshot {
  const d = isRecord(data) ? data : {};
  const inventory = parseInventory({ coins: d.coins, owned: d.owned, equipped: d.equipped, lastPurchase: d.lastPurchase });
  const name = typeof d.name === 'string' && isValidNickname(d.name) ? d.name : null;
  const { dailyDay, batch } = isRecord(d.stats) ? d.stats : {};
  return {
    inventory,
    progress: parseProgress(d),
    batch: typeof batch === 'string' ? batch : null,
    name,
    lastReward: timestampMillis(d.lastReward),
    dailyDay: typeof dailyDay === 'number' && Number.isInteger(dailyDay) ? dailyDay : null,
  };
}

export interface OpenedUser {
  readonly snapshot: UserSnapshot;
  /** The document did not exist and was created now (first session of this account). */
  readonly created: boolean;
}

export interface PurchaseAttempt {
  readonly kind: 'bought' | 'owned' | 'insufficient';
  /** The document after the purchase ('bought') or as read ('owned' / 'insufficient'). */
  readonly snapshot: UserSnapshot;
}

export interface UnlockAttempt {
  readonly kind: 'unlocked' | 'owned';
  readonly snapshot: UserSnapshot;
}

export interface RewardAttempt {
  /** 'alreadyWritten': this batch had reached the server before (its answer was lost). */
  readonly kind: 'written' | 'alreadyWritten';
  readonly snapshot: UserSnapshot;
}

export interface DailyBonusAttempt {
  /** 'alreadyPaid': this day (or a later one) was paid before, e.g. on another device. */
  readonly kind: 'paid' | 'alreadyPaid';
  readonly snapshot: UserSnapshot;
}

/** What the cloud repository needs from Firestore (lets tests use a fake). */
export interface UserBackend {
  /** Reads users/{uid}, creating it first when missing (one transaction). */
  open(uid: string, name: string): Promise<OpenedUser>;
  /** Reward write (transaction) of a batch, unless it was already written. */
  reward(uid: string, batch: RewardBatch): Promise<RewardAttempt>;
  /** Reward write (transaction) with the Daily Challenge bonus of `day`, unless already paid. */
  dailyBonus(uid: string, day: number, amount: number): Promise<DailyBonusAttempt>;
  /** Purchase write (transaction), checked against the server's coins and items. */
  purchase(uid: string, itemId: string, price: number): Promise<PurchaseAttempt>;
  /** Unlock write (transaction) of an achievement item, unless already owned. */
  unlock(uid: string, itemId: string): Promise<UnlockAttempt>;
  /** Equip write. */
  equip(uid: string, equipped: Equipped): Promise<void>;
  /** Profile write. */
  rename(uid: string, name: string): Promise<void>;
}

export function firestoreUserBackend(sdk: FirebaseSdk): UserBackend {
  const { db, dbApi } = sdk;
  const ref = (uid: string) => dbApi.doc(db, USERS, uid);
  const missing = () => Object.assign(new Error('users/{uid} does not exist'), { code: 'app/no-user-doc' });
  return {
    open: (uid, name) =>
      dbApi.runTransaction(db, async (tx): Promise<OpenedUser> => {
        const snap = await tx.get(ref(uid));
        if (snap.exists()) return { snapshot: parseUserDoc(snap.data()), created: false };
        tx.set(ref(uid), newUserFields(name, dbApi.serverTimestamp()));
        const progress = emptyProgress();
        const snapshot = { inventory: emptyInventory(), progress, batch: null, name, lastReward: null, dailyDay: null };
        return { snapshot, created: true };
      }),
    reward: (uid, batch) =>
      dbApi.runTransaction(db, async (tx): Promise<RewardAttempt> => {
        const snap = await tx.get(ref(uid));
        if (!snap.exists()) throw missing();
        const before = parseUserDoc(snap.data());
        if (before.batch === batch.id) return { kind: 'alreadyWritten', snapshot: before };
        const server = { coins: before.inventory.coins, progress: before.progress };
        const { fields, coins, progress } = rewardWrite(server, batch, dbApi.serverTimestamp());
        tx.update(ref(uid), { ...fields });
        const inventory: Inventory = { ...before.inventory, coins };
        return { kind: 'written', snapshot: { ...before, inventory, progress, batch: batch.id, lastReward: null } };
      }),
    dailyBonus: (uid, day, amount) =>
      dbApi.runTransaction(db, async (tx): Promise<DailyBonusAttempt> => {
        const snap = await tx.get(ref(uid));
        if (!snap.exists()) throw missing();
        const before = parseUserDoc(snap.data());
        if (before.dailyDay !== null && before.dailyDay >= day) return { kind: 'alreadyPaid', snapshot: before };
        const fields = dailyBonusFields(before.inventory.coins, amount, day, dbApi.serverTimestamp());
        tx.update(ref(uid), fields);
        const inventory: Inventory = { ...before.inventory, coins: fields.coins };
        return { kind: 'paid', snapshot: { ...before, inventory, lastReward: null, dailyDay: day } };
      }),
    purchase: (uid, itemId, price) =>
      dbApi.runTransaction(db, async (tx): Promise<PurchaseAttempt> => {
        const snap = await tx.get(ref(uid));
        if (!snap.exists()) throw missing();
        const before = parseUserDoc(snap.data());
        const { coins, owned } = before.inventory;
        if (owned[itemId]) return { kind: 'owned', snapshot: before };
        if (coins < price) return { kind: 'insufficient', snapshot: before };
        tx.update(ref(uid), purchaseFields(coins, itemId, price));
        const inventory: Inventory = {
          ...before.inventory,
          coins: coins - price,
          owned: { ...owned, [itemId]: true },
          lastPurchase: itemId,
        };
        return { kind: 'bought', snapshot: { ...before, inventory } };
      }),
    unlock: (uid, itemId) =>
      dbApi.runTransaction(db, async (tx): Promise<UnlockAttempt> => {
        const snap = await tx.get(ref(uid));
        if (!snap.exists()) throw missing();
        const before = parseUserDoc(snap.data());
        if (before.inventory.owned[itemId]) return { kind: 'owned', snapshot: before };
        tx.update(ref(uid), unlockFields(itemId));
        return { kind: 'unlocked', snapshot: { ...before, inventory: applyUnlock(before.inventory, itemId) } };
      }),
    equip: async (uid, equipped) => {
      await dbApi.updateDoc(ref(uid), equipFields(equipped));
    },
    rename: async (uid, name) => {
      await dbApi.updateDoc(ref(uid), profileFields(name));
    },
  };
}
