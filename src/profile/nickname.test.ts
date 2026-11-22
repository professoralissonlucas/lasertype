import { describe, expect, it } from 'vitest';
import { memoryStore } from '../utils/storage.ts';
import {
  defaultNickname,
  isValidNickname,
  loadNickname,
  nicknameLength,
  NICKNAMES_KEY,
  normalizeNickname,
  saveNickname,
} from './nickname.ts';

describe('nickname rules (3–12: letters, digits, _ and space)', () => {
  it('accepts letters (accented too), digits, underscore and inner spaces', () => {
    for (const name of ['Ana', 'Piloto1234', 'joão_2', 'Ás do Laser', 'ABCDEFGHIJKL']) {
      expect(isValidNickname(name), name).toBe(true);
    }
  });

  it('rejects wrong lengths and other characters', () => {
    for (const name of ['ab', 'ABCDEFGHIJKLM', 'a-b-c', 'eu@x', 'emoji🙂', 'a.b.c', ' ana', 'ana ', 'a  b']) {
      expect(isValidNickname(name), name).toBe(false);
    }
  });

  it('normalizes before validating (trim, single spaces, NFC)', () => {
    expect(normalizeNickname('  Ás   do  Laser ')).toBe('Ás do Laser');
    expect(normalizeNickname('João')).toBe('João');
    expect(isValidNickname(normalizeNickname('João'))).toBe(true);
  });

  it('counts characters, not UTF-16 units', () => {
    expect(nicknameLength('João')).toBe(4);
  });
});

describe('defaultNickname', () => {
  it('is "Piloto" + the first 4 characters of the uid, always valid', () => {
    expect(defaultNickname('aB3xYz789')).toBe('PilotoaB3x');
    for (const uid of ['Zx', 'q1w2e3r4t5y6u7i8o9p0', '--__']) expect(isValidNickname(defaultNickname(uid)), uid).toBe(true);
  });
});

describe('nickname storage (per uid)', () => {
  it('saves and loads per account', () => {
    const store = memoryStore();
    expect(loadNickname(store, 'u1')).toBeNull();
    expect(saveNickname(store, 'u1', 'Ana')).toBe(true);
    expect(saveNickname(store, 'u2', 'Bia_2')).toBe(true);
    expect(loadNickname(store, 'u1')).toBe('Ana');
    expect(loadNickname(store, 'u2')).toBe('Bia_2');
  });

  it('refuses invalid names and ignores tampered entries', () => {
    const store = memoryStore({ [NICKNAMES_KEY]: JSON.stringify({ u1: 'x', u2: 42, u3: 'Válido' }) });
    expect(saveNickname(store, 'u4', 'no')).toBe(false);
    expect(loadNickname(store, 'u1')).toBeNull();
    expect(loadNickname(store, 'u2')).toBeNull();
    expect(loadNickname(store, 'u3')).toBe('Válido');
  });

  it('works without storage (private mode)', () => {
    expect(loadNickname(null, 'u1')).toBeNull();
    expect(saveNickname(null, 'u1', 'Ana')).toBe(false);
  });
});
