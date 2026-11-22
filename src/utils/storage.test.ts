import { describe, expect, it } from 'vitest';
import { loadJson, memoryStore, saveJson, type KeyValueStore } from './storage.ts';

const broken: KeyValueStore = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('storage', () => {
  it('saves and loads JSON', () => {
    const store = memoryStore();
    expect(saveJson(store, 'k', { a: 1, b: [true] })).toBe(true);
    expect(loadJson(store, 'k')).toEqual({ a: 1, b: [true] });
  });

  it('returns undefined for missing keys and invalid JSON', () => {
    expect(loadJson(memoryStore(), 'missing')).toBeUndefined();
    expect(loadJson(memoryStore({ k: 'not json' }), 'k')).toBeUndefined();
  });

  it('never throws when the browser refuses storage', () => {
    expect(loadJson(broken, 'k')).toBeUndefined();
    expect(saveJson(broken, 'k', 1)).toBe(false);
    expect(loadJson(null, 'k')).toBeUndefined();
    expect(saveJson(null, 'k', 1)).toBe(false);
  });
});
