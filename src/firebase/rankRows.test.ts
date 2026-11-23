import { describe, expect, it } from 'vitest';
import { parseRow, placesOf, withRecord } from './rankRows.ts';
import type { RankRow } from './types.ts';

const row = (uid: string, score: number): RankRow => ({ uid, name: uid, score, wpm: 40, accuracy: 90 });

describe('parseRow', () => {
  it('reads valid rows and drops malformed ones', () => {
    expect(parseRow({ uid: 'a', name: 'Abc', score: 10, wpm: 30, accuracy: 90, extra: 1 })).toEqual({
      uid: 'a',
      name: 'Abc',
      score: 10,
      wpm: 30,
      accuracy: 90,
    });
    expect(parseRow({ uid: 'a', name: 'Abc', score: '10' })).toBeNull();
    expect(parseRow(undefined)).toBeNull();
    expect(parseRow({ uid: 'a', name: 'Abc', score: 5 })).toMatchObject({ wpm: 0, accuracy: 0 });
  });
});

describe('placesOf', () => {
  it('ties share a place and the next one skips', () => {
    expect(placesOf([{ score: 90 }, { score: 70 }, { score: 70 }, { score: 10 }])).toEqual([1, 2, 2, 4]);
    expect(placesOf([])).toEqual([]);
  });
});

describe('withRecord', () => {
  const rows = [row('a', 90), row('b', 70), row('c', 70), row('d', 10)];
  const uids = (list: readonly RankRow[]) => list.map(({ uid }) => uid).join('');

  it('puts a new player in their place', () => {
    expect(uids(withRecord(rows, row('x', 100), 50))).toBe('xabcd');
    expect(uids(withRecord(rows, row('x', 80), 50))).toBe('axbcd');
    expect(uids(withRecord(rows, row('x', 5), 50))).toBe('abcdx');
    expect(uids(withRecord([], row('x', 5), 50))).toBe('x');
  });

  it('a tie goes below those who were there first', () => {
    expect(uids(withRecord(rows, row('x', 70), 50))).toBe('abcxd');
  });

  it('replaces the row the player had', () => {
    expect(withRecord(rows, row('d', 95), 50)).toEqual([row('d', 95), row('a', 90), row('b', 70), row('c', 70)]);
    expect(uids(withRecord(rows, row('a', 99), 50))).toBe('abcd');
  });

  it('keeps the size of the top', () => {
    expect(uids(withRecord(rows, row('x', 80), 4))).toBe('axbc');
    expect(uids(withRecord(rows, row('x', 5), 4))).toBe('abcd');
    expect(uids(withRecord(rows, row('d', 80), 4))).toBe('adbc');
  });

  it('never replaces a better score', () => {
    expect(withRecord(rows, row('a', 90), 50)).toBe(rows);
    expect(withRecord(rows, row('a', 20), 50)).toBe(rows);
  });
});
