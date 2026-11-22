import { describe, expect, it } from 'vitest';
import { defaultNickname, isValidNickname, nicknameLength, normalizeNickname } from './nickname.ts';

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
  it('is "Piloto" + 4 digits, always valid', () => {
    for (const uid of ['aB3xYz789', 'Zx', 'q1w2e3r4t5y6u7i8o9p0', '--__', '']) {
      const name = defaultNickname(uid);
      expect(name, uid).toMatch(/^Piloto[0-9]{4}$/);
      expect(isValidNickname(name), uid).toBe(true);
    }
  });

  it('depends only on the uid (same on every device) and varies between uids', () => {
    expect(defaultNickname('aB3xYz789')).toBe(defaultNickname('aB3xYz789'));
    const names = new Set(Array.from({ length: 50 }, (_, i) => defaultNickname(`uid-${i}`)));
    expect(names.size).toBeGreaterThan(40);
  });
});
