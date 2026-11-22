// Ranking nickname. Never the real Google name or photo (students may play). It lives in
// users/{uid}.name (firebase/profile.ts), created as "Piloto" + 4 digits and editable from
// the account badge; the first Google link asks for it. This file only holds the rules.
import { CONFIG } from '../config.ts';
import type { RankingConfig } from '../firebase/types.ts';
import { hashString } from '../utils/rng.ts';

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

/**
 * "Piloto" + 4 digits derived from the uid (e.g. "Piloto0427"): the same on every device,
 * so the name is right even before users/{uid} has been read.
 */
export function defaultNickname(uid: string): string {
  const digits = String(hashString(`nickname:${uid}`) % 10_000).padStart(4, '0');
  return `Piloto${digits}`;
}
