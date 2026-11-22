// Ranking nickname. Never the real Google name or photo (students may play): the player
// picks a nickname when first linking Google, prefilled with "Piloto" + 4 uid characters.
// Stored locally per uid (shared computers); Phase 5.5 moves it to users/{uid}.name.
import { CONFIG } from '../config.ts';
import type { RankingConfig } from '../firebase/types.ts';
import { loadJson, saveJson, type KeyValueStore } from '../utils/storage.ts';

export const NICKNAMES_KEY = 'lasertype.nicknames.v1';

const ALLOWED = /^[\p{L}\p{N}_ ]+$/u;

/** NFC, trimmed, single spaces (what gets validated and saved). */
export function normalizeNickname(raw: string): string {
  return raw.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** Characters as firestore.rules counts them (code points, not UTF-16 units). */
export function nicknameLength(name: string): number {
  return [...name].length;
}

/** 3–12 characters: letters, digits, _ and single inner spaces. Expects a normalized name. */
export function isValidNickname(name: string, config: RankingConfig = CONFIG.ranking): boolean {
  const length = nicknameLength(name);
  return (
    name === normalizeNickname(name) &&
    length >= config.nameMin &&
    length <= config.nameMax &&
    ALLOWED.test(name)
  );
}

/** "Piloto" + the first 4 letters/digits of the uid (Firebase uids are alphanumeric). */
export function defaultNickname(uid: string): string {
  return `Piloto${uid.replace(/[^A-Za-z0-9]/g, '').slice(0, 4)}`;
}

function loadAll(store: KeyValueStore | null): Record<string, string> {
  const raw = loadJson(store, NICKNAMES_KEY);
  const out: Record<string, string> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [uid, name] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof name === 'string' && isValidNickname(name)) out[uid] = name;
  }
  return out;
}

/** The saved nickname of `uid`, or null (never asked yet, or invalid). */
export function loadNickname(store: KeyValueStore | null, uid: string): string | null {
  return loadAll(store)[uid] ?? null;
}

/** Saves a valid nickname for `uid`; false when invalid or the store refused it. */
export function saveNickname(store: KeyValueStore | null, uid: string, name: string): boolean {
  if (!isValidNickname(name)) return false;
  return saveJson(store, NICKNAMES_KEY, { ...loadAll(store), [uid]: name });
}
