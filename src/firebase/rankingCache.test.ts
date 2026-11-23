import { describe, expect, it } from 'vitest';
import { memoryStore } from '../utils/storage.ts';
import { RANKING_CACHE_KEY, RankingCache, type CachedBoard } from './rankingCache.ts';
import type { RankRow } from './types.ts';

const CONFIG = { cacheSeconds: 120, refreshSeconds: 30 };
const START = 1_000_000_000;
const ROW: RankRow = { uid: 'a', name: 'Abc', score: 10, wpm: 30, accuracy: 90 };

function setup(stored?: unknown) {
  const store = memoryStore(stored === undefined ? {} : { [RANKING_CACHE_KEY]: JSON.stringify(stored) });
  let time = START;
  const cache = new RankingCache(store, () => time, CONFIG);
  const saved = () => JSON.parse(store.getItem(RANKING_CACHE_KEY) ?? 'null') as { boards: Record<string, unknown> };
  return { cache, saved, advance: (ms: number) => (time += ms) };
}

function board(patch: Partial<CachedBoard> = {}): CachedBoard {
  return { at: START, rows: [ROW], own: null, ...patch };
}

describe('RankingCache', () => {
  it('keeps each board until it expires', () => {
    const { cache, advance } = setup();
    expect(cache.get('x')).toBeNull();
    const own = { uid: 'b', row: { ...ROW, uid: 'b', score: 3 }, place: 51 };
    cache.put('x', board({ own }));
    advance(60_000);
    cache.put('y', board({ at: START + 60_000, own: { uid: 'b', row: null, place: null } }));
    advance(59_999);
    expect(cache.get('x')).toEqual(board({ own }));
    advance(1);
    expect(cache.get('x')).toBeNull();
    expect(cache.get('y')).toEqual(board({ at: START + 60_000, own: { uid: 'b', row: null, place: null } }));
  });

  it('forgets expired boards when it saves', () => {
    const { cache, saved, advance } = setup();
    cache.put('old', board());
    advance(120_000);
    cache.put('new', board({ at: START + 120_000 }));
    expect(Object.keys(saved().boards)).toEqual(['new']);
  });

  it('update changes a board still good and ignores the others', () => {
    const { cache, advance } = setup();
    cache.update('x', () => board());
    expect(cache.get('x')).toBeNull();
    cache.put('x', board());
    cache.update('x', (entry) => ({ ...entry, rows: [] }));
    expect(cache.get('x')?.rows).toEqual([]);
    advance(120_000);
    cache.update('x', () => board({ at: START + 120_000 }));
    expect(cache.get('x')).toBeNull();
  });

  it('refreshWait: 30 s from the last "Atualizar" and from the last read of the board', () => {
    const { cache, advance } = setup();
    expect(cache.refreshWait('x')).toBe(0);
    cache.put('x', board());
    expect(cache.refreshWait('x')).toBe(30_000);
    expect(cache.refreshWait('y')).toBe(0);
    advance(20_000);
    cache.markRefresh();
    expect(cache.refreshWait('y')).toBe(30_000);
    advance(10_000);
    expect(cache.refreshWait('x')).toBe(20_000);
    advance(20_000);
    expect(cache.refreshWait('x')).toBe(0);
  });

  it('a clock that went back does not hold old rows or the button', () => {
    const { cache, advance } = setup();
    cache.put('x', board());
    cache.markRefresh();
    advance(-3_600_000);
    expect(cache.get('x')).toBeNull();
    expect(cache.refreshWait('x')).toBe(0);
  });

  it('reads anything invalid as if it were not there', () => {
    for (const stored of [null, 3, 'text', [], { boards: 7 }, { boards: { x: null } }, { refreshedAt: 'now', boards: {} }]) {
      const { cache } = setup(stored);
      expect(cache.get('x'), JSON.stringify(stored)).toBeNull();
      expect(cache.refreshWait('x'), JSON.stringify(stored)).toBe(0);
    }
    const { cache } = setup({
      boards: {
        noTime: { rows: [ROW] },
        noRows: { at: START },
        x: { at: START, rows: [ROW, { uid: 'bad' }, null, 'row'], own: { uid: 5 } },
        y: { at: START, rows: [], own: { uid: 'b', row: { uid: 'b' }, place: '3' } },
      },
    });
    expect(cache.get('noTime')).toBeNull();
    expect(cache.get('noRows')).toBeNull();
    expect(cache.get('x')).toEqual(board());
    expect(cache.get('y')).toEqual(board({ rows: [], own: { uid: 'b', row: null, place: null } }));
  });
});
