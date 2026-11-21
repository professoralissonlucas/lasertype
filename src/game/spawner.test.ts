import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { getWordList } from '../words/index.ts';
import type { WordList } from '../words/types.ts';
import { stripAccents } from './input.ts';
import { Spawner } from './spawner.ts';
import type { SpawnedWord, SpawnParams } from './types.ts';

const PARAMS: SpawnParams = {
  ...CONFIG.spawn,
  firstDelay: 1,
  interval: 2,
  maxActive: 3,
};

const ALPHABET: WordList = {
  easy: 'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => `${c}${c}x`),
  medium: 'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => `${c}${c}yyyy`),
  hard: 'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => `${c}${c}zzzzzzz`),
};

function sequence(spawner: Spawner, count: number): SpawnedWord[] {
  return Array.from({ length: count }, () => spawner.next());
}

describe('Spawner determinism', () => {
  it('produces the same sequence for the same seed', () => {
    const words = getWordList('pt-BR');
    const a = sequence(new Spawner('2026-11-21', words, CONFIG.spawn), 60);
    const b = sequence(new Spawner('2026-11-21', words, CONFIG.spawn), 60);
    expect(a).toEqual(b);
  });

  it('produces different sequences for different seeds', () => {
    const words = getWordList('en');
    const a = sequence(new Spawner(1, words, CONFIG.spawn), 20).map((w) => w.text);
    const b = sequence(new Spawner(2, words, CONFIG.spawn), 20).map((w) => w.text);
    expect(a).not.toEqual(b);
  });

  it('keeps the word sequence independent of timing and how many words are on screen', () => {
    const words = getWordList('pt-BR');
    const expected = sequence(new Spawner('daily', words, CONFIG.spawn), 25);

    // A "player" with irregular frame times who sometimes keeps the screen full.
    const timed = new Spawner('daily', words, CONFIG.spawn);
    const got: SpawnedWord[] = [];
    for (let i = 0; got.length < 25 && i < 100_000; i++) {
      const dt = i % 7 === 0 ? 0.05 : 1 / 60;
      const active = i % 300 < 100 ? CONFIG.spawn.maxActive : 2;
      const spawned = timed.update(dt, active);
      if (spawned) got.push(spawned);
    }
    expect(got).toEqual(expected);
  });
});

describe('Spawner word choice', () => {
  it('only uses words from the list tier it reports', () => {
    const words = getWordList('pt-BR');
    for (const spawned of sequence(new Spawner(42, words, CONFIG.spawn), 300)) {
      expect(words[spawned.difficulty]).toContain(spawned.text);
    }
  });

  it('never picks a tier with zero weight', () => {
    const params = { ...PARAMS, tierWeights: { easy: 1, medium: 0, hard: 0 } };
    for (const spawned of sequence(new Spawner(5, ALPHABET, params), 100)) {
      expect(spawned.difficulty).toBe('easy');
    }
  });

  it('does not repeat a word within the text history window', () => {
    const words = getWordList('en');
    const texts = sequence(new Spawner(9, words, CONFIG.spawn), 400).map((w) => w.text);
    const window = CONFIG.spawn.textHistory;
    texts.forEach((text, i) => {
      expect(texts.slice(Math.max(0, i - window), i)).not.toContain(text);
    });
  });

  it('avoids first letters used by the most recent words', () => {
    // 26 initials, 5 blocked at a time: a fresh initial is always available.
    const params = { ...PARAMS, initialHistory: 5, textHistory: 10 };
    const initials = sequence(new Spawner(3, ALPHABET, params), 200).map((w) =>
      stripAccents(w.text[0] ?? ''),
    );
    initials.forEach((initial, i) => {
      expect(initials.slice(Math.max(0, i - 5), i)).not.toContain(initial);
    });
  });

  it('throws when a weighted tier has no words', () => {
    const empty: WordList = { easy: [], medium: ['abcdef'], hard: ['abcdefghi'] };
    expect(() => new Spawner(1, empty, PARAMS)).toThrow(/easy/);
  });
});

describe('Spawner placement and speed', () => {
  it('keeps x inside the configured bounds', () => {
    const params = CONFIG.spawn;
    for (const spawned of sequence(new Spawner(11, getWordList('en'), params), 500)) {
      expect(spawned.x).toBeGreaterThanOrEqual(params.xMin);
      expect(spawned.x).toBeLessThanOrEqual(params.xMax);
    }
  });

  it('spreads consecutive words horizontally', () => {
    const xs = sequence(new Spawner(12, getWordList('en'), CONFIG.spawn), 1000).map((w) => w.x);
    const gaps = xs.slice(1).map((x, i) => Math.abs(x - (xs[i] ?? x)));
    const closeCalls = gaps.filter((gap) => gap < CONFIG.spawn.minXGap).length;
    // Uniform random placement would land this close ~45% of the time.
    expect(closeCalls / gaps.length).toBeLessThan(0.15);
  });

  it('always avoids the previous position when only one is remembered', () => {
    const params = { ...CONFIG.spawn, xHistory: 1, xAttempts: 32, minXGap: 0.2 };
    const xs = sequence(new Spawner(14, getWordList('en'), params), 500).map((w) => w.x);
    xs.slice(1).forEach((x, i) => {
      expect(Math.abs(x - (xs[i] ?? x))).toBeGreaterThanOrEqual(0.2);
    });
  });

  it('keeps speed within the tier base ± jitter', () => {
    const params = CONFIG.spawn;
    for (const spawned of sequence(new Spawner(13, getWordList('pt-BR'), params), 300)) {
      const base = params.speed[spawned.difficulty];
      expect(spawned.speed).toBeGreaterThanOrEqual(base * (1 - params.speedJitter));
      expect(spawned.speed).toBeLessThanOrEqual(base * (1 + params.speedJitter));
    }
  });
});

describe('Spawner timing', () => {
  it('waits for the first delay, then spawns every interval', () => {
    const spawner = new Spawner(1, ALPHABET, PARAMS);
    expect(spawner.update(0.5, 0)).toBeNull();
    expect(spawner.update(0.5, 0)).not.toBeNull(); // t = 1.0
    expect(spawner.update(1.5, 1)).toBeNull(); // t = 2.5
    expect(spawner.update(0.5, 1)).not.toBeNull(); // t = 3.0
  });

  it('holds while the screen is full and spawns as soon as there is room', () => {
    const spawner = new Spawner(1, ALPHABET, PARAMS);
    expect(spawner.update(1, PARAMS.maxActive)).toBeNull();
    expect(spawner.update(5, PARAMS.maxActive)).toBeNull();
    expect(spawner.update(0.01, PARAMS.maxActive - 1)).not.toBeNull();
    // The held time is not "banked": the next one still waits a full interval.
    expect(spawner.update(1.9, 0)).toBeNull();
    expect(spawner.update(0.2, 0)).not.toBeNull();
  });

  it('spawns at most one word per update', () => {
    const spawner = new Spawner(1, ALPHABET, PARAMS);
    expect(spawner.update(100, 0)).not.toBeNull();
    expect(spawner.update(0, 0)).toBeNull();
  });
});
