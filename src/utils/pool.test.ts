import { describe, expect, it } from 'vitest';
import { FixedPool } from './pool.ts';

function makePool(capacity: number): FixedPool<{ active: boolean; life: number; id: number }> {
  let next = 0;
  return new FixedPool(capacity, () => ({ active: false, life: 0, id: next++ }));
}

describe('FixedPool', () => {
  it('preallocates every object up front', () => {
    const pool = makePool(4);
    expect(pool.items).toHaveLength(4);
    expect(pool.activeCount).toBe(0);
  });

  it('hands out free objects first and marks them active', () => {
    const pool = makePool(2);
    const a = pool.acquire();
    const b = pool.acquire();
    expect(a).not.toBe(b);
    expect(a?.active).toBe(true);
    expect(pool.activeCount).toBe(2);
  });

  it('recycles the object closest to expiring when full', () => {
    const pool = makePool(3);
    const [a, b, c] = [pool.acquire(), pool.acquire(), pool.acquire()];
    if (!a || !b || !c) throw new Error('pool too small');
    a.life = 0.5;
    b.life = 0.1;
    c.life = 0.9;
    expect(pool.acquire()).toBe(b);
  });

  it('never allocates new objects', () => {
    const pool = makePool(2);
    const before = [...pool.items];
    for (let i = 0; i < 10; i++) pool.acquire();
    expect(pool.items).toEqual(before);
  });

  it('returns null with zero capacity', () => {
    expect(makePool(0).acquire()).toBeNull();
  });

  it('clear() frees everything', () => {
    const pool = makePool(3);
    pool.acquire();
    pool.acquire();
    pool.clear();
    expect(pool.activeCount).toBe(0);
  });
});
