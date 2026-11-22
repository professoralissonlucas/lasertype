import { describe, expect, it } from 'vitest';
import { createRng, hashString, hashUnit, pickWeighted, shuffled } from './rng.ts';

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(123);
    const b = createRng(123);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('accepts string seeds (e.g. a date)', () => {
    const a = createRng('2026-11-21');
    const b = createRng('2026-11-21');
    const c = createRng('2026-11-22');
    const first = a.next();
    expect(b.next()).toBe(first);
    expect(c.next()).not.toBe(first);
  });

  it('returns floats in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('int() covers both inclusive bounds', () => {
    const rng = createRng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) seen.add(rng.int(1, 4));
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });

  it('range() stays inside [min, max)', () => {
    const rng = createRng(10);
    for (let i = 0; i < 1_000; i++) {
      const value = rng.range(-2, 3);
      expect(value).toBeGreaterThanOrEqual(-2);
      expect(value).toBeLessThan(3);
    }
  });

  it('pick() returns elements of the array and throws when empty', () => {
    const rng = createRng(11);
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 100; i++) expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow();
  });
});

describe('hashString', () => {
  it('returns stable unsigned 32-bit values', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('lasertype')).toBe(hashString('lasertype'));
    expect(hashString('a')).not.toBe(hashString('b'));
    expect(hashString('qualquer coisa')).toBeGreaterThanOrEqual(0);
  });
});

describe('pickWeighted', () => {
  const keys = ['easy', 'medium', 'hard'] as const;

  it('never picks zero-weight keys', () => {
    const rng = createRng(1);
    for (let i = 0; i < 500; i++) {
      expect(pickWeighted(rng, keys, { easy: 0, medium: 1, hard: 0 })).toBe('medium');
    }
  });

  it('roughly follows the weights', () => {
    const rng = createRng(2);
    const counts = { easy: 0, medium: 0, hard: 0 };
    for (let i = 0; i < 10_000; i++) counts[pickWeighted(rng, keys, { easy: 3, medium: 1, hard: 0 })]++;
    expect(counts.easy / 10_000).toBeCloseTo(0.75, 1);
    expect(counts.hard).toBe(0);
  });

  it('throws without any positive weight', () => {
    expect(() => pickWeighted(createRng(3), keys, { easy: 0, medium: 0, hard: -1 })).toThrow();
  });
});

describe('shuffled', () => {
  it('returns a permutation and leaves the input alone', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffled(createRng('s'), items);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('is deterministic for a seed and varies between seeds', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffled(createRng('a'), items)).toEqual(shuffled(createRng('a'), items));
    expect(shuffled(createRng('a'), items)).not.toEqual(shuffled(createRng('b'), items));
  });

  it('handles empty and single-item lists', () => {
    expect(shuffled(createRng(1), [])).toEqual([]);
    expect(shuffled(createRng(1), ['x'])).toEqual(['x']);
  });
});

describe('hashUnit', () => {
  it('is repeatable, in [0, 1), and changes with either input', () => {
    expect(hashUnit(7, 3)).toBe(hashUnit(7, 3));
    const values = new Set<number>();
    for (let seed = 0; seed < 50; seed++) {
      for (let salt = 0; salt < 10; salt++) {
        const value = hashUnit(seed, salt);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
        values.add(value);
      }
    }
    expect(values.size).toBe(500);
  });

  it('spreads evenly enough for visual effects', () => {
    const buckets = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) {
    const k = Math.floor(hashUnit(i, 1) * 4);
    buckets[k] = (buckets[k] ?? 0) + 1;
  }
    for (const count of buckets) expect(count).toBeGreaterThan(850);
  });
});
