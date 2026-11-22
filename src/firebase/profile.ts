// users/{uid}: the player's account document. firestore.rules is the contract: the document
// is created once (coins 0, xp 0, owned {}, lastReward = request.time) and every later write
// is exactly ONE of the rules' update kinds, carrying only that kind's fields:
//   reward    coins, lastReward               (the rules also allow xp, level, stats, streak, lastLogin)
//   purchase  coins, owned.<id>, lastPurchase (in a transaction: the price must be exact)
//   equip     equipped
//   profile   name                            (photo is never sent: no Google photo)
// The field builders are pure; rules.test.ts checks them against firestore.rules.
// Missions, streak and XP: for now only their fields exist (created, never updated).
import { emptyInventory, parseInventory } from '../economy/inventory.ts';
import type { Equipped, Inventory } from '../economy/types.ts';
import { isValidNickname } from '../profile/nickname.ts';
import type { FirebaseSdk } from './app.ts';

export const USERS = 'users';

/** users/{uid} as the client reads it (parsed tolerantly: it is untrusted input). */
export interface UserSnapshot {
  readonly inventory: Inventory;
  /** null = missing or not a valid nickname (callers fall back to the default). */
  readonly name: string | null;
  /** Server time of the last reward write (or of the creation) in ms; null when unknown. */
  readonly lastReward: number | null;
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

/** Reward write: the new balance and lastReward = serverTimestamp(). */
export function rewardFields<T>(coins: number, amount: number, now: T): { readonly coins: number; readonly lastReward: T } {
  return { coins: coins + amount, lastReward: now };
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
  return { inventory, name, lastReward: timestampMillis(d.lastReward) };
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

/** What the cloud repository needs from Firestore (lets tests use a fake). */
export interface UserBackend {
  /** Reads users/{uid}, creating it first when missing (one transaction). */
  open(uid: string, name: string): Promise<OpenedUser>;
  /** Reward write (transaction): adds `amount` coins. Resolves with the document after it. */
  reward(uid: string, amount: number): Promise<UserSnapshot>;
  /** Purchase write (transaction), checked against the server's coins and items. */
  purchase(uid: string, itemId: string, price: number): Promise<PurchaseAttempt>;
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
        return { snapshot: { inventory: emptyInventory(), name, lastReward: null }, created: true };
      }),
    reward: (uid, amount) =>
      dbApi.runTransaction(db, async (tx): Promise<UserSnapshot> => {
        const snap = await tx.get(ref(uid));
        if (!snap.exists()) throw missing();
        const before = parseUserDoc(snap.data());
        const fields = rewardFields(before.inventory.coins, amount, dbApi.serverTimestamp());
        tx.update(ref(uid), fields);
        return { ...before, inventory: { ...before.inventory, coins: fields.coins }, lastReward: null };
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
    equip: async (uid, equipped) => {
      await dbApi.updateDoc(ref(uid), equipFields(equipped));
    },
    rename: async (uid, name) => {
      await dbApi.updateDoc(ref(uid), profileFields(name));
    },
  };
}
