import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { getBossPhrases, getWordList } from '../words/index.ts';
import type { WordList } from '../words/types.ts';
import { bossPhrase, bossSpeed } from './boss.ts';
import { stripAccents } from './input.ts';
import { Spawner, type SpawnerConfig } from './spawner.ts';
import type { SpawnedBoss, SpawnedWord, WaveConfig } from './types.ts';

const BASE: SpawnerConfig = {
  spawn: CONFIG.spawn,
  waves: CONFIG.waves,
  specials: CONFIG.specials,
  waveBreak: true,
};

/** Timing tests: 3 words max on screen, first word at 1 s, then every 2 s. */
const TIMING: SpawnerConfig = {
  ...BASE,
  spawn: { ...CONFIG.spawn, firstDelay: 1, interval: 2, maxActive: 3 },
};

/** Waves that never change, for isolating other behavior. */
const FLAT_WAVES: WaveConfig = {
  ...CONFIG.waves,
  easyStep: 0,
  hardStep: 0,
  speedStep: 0,
  intervalDecay: 1,
  specialChanceBase: 0,
  specialChanceStep: 0,
  maxActiveStep: 0,
};

const ALPHABET: WordList = {
  easy: 'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => `${c}${c}x`),
  medium: 'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => `${c}${c}yyyy`),
  hard: 'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => `${c}${c}zzzzzzz`),
};

function sequence(spawner: Spawner, count: number): SpawnedWord[] {
  return Array.from({ length: count }, () => spawner.next());
}

/** Runs `update` until `count` words came out; `active(i)` simulates what is on screen. */
function play(spawner: Spawner, count: number, active: (i: number) => number, dt = 1 / 60): SpawnedWord[] {
  const got: SpawnedWord[] = [];
  for (let i = 0; got.length < count && i < 200_000; i++) {
    const word = spawner.update(dt, active(i));
    if (word && word.kind !== 'boss') got.push(word);
  }
  return got;
}

describe('Spawner determinism', () => {
  it('produces the same sequence for the same seed', () => {
    const words = getWordList('pt-BR');
    expect(sequence(new Spawner('2026-11-21', words, BASE), 60)).toEqual(
      sequence(new Spawner('2026-11-21', words, BASE), 60),
    );
  });

  it('produces different sequences for different seeds', () => {
    const words = getWordList('en');
    const a = sequence(new Spawner(1, words, BASE), 20).map((w) => w.text);
    const b = sequence(new Spawner(2, words, BASE), 20).map((w) => w.text);
    expect(a).not.toEqual(b);
  });

  it('keeps the sequence independent of timing, screen load and wave breaks', () => {
    const words = getWordList('pt-BR');
    const expected = sequence(new Spawner('daily', words, BASE), 40);

    // A "player" with irregular frames who sometimes fills the screen and sometimes clears it.
    const timed = new Spawner('daily', words, BASE);
    const got: SpawnedWord[] = [];
    for (let i = 0; got.length < 40 && i < 200_000; i++) {
      const dt = i % 7 === 0 ? 0.05 : 1 / 60;
      const active = i % 300 < 100 ? CONFIG.spawn.maxActive : i % 5 === 0 ? 0 : 2;
      const word = timed.update(dt, active);
      if (word && word.kind !== 'boss') got.push(word);
    }
    expect(got).toEqual(expected);

    // Time Attack (no wave breaks) gets the very same words.
    const noBreaks = new Spawner('daily', words, { ...BASE, waveBreak: false });
    expect(play(noBreaks, 40, () => 0)).toEqual(expected);
  });
});

describe('Spawner word choice', () => {
  it('only uses words from the list tier it reports', () => {
    const words = getWordList('pt-BR');
    for (const spawned of sequence(new Spawner(42, words, BASE), 300)) {
      expect(words[spawned.difficulty]).toContain(spawned.text);
    }
  });

  it('never picks a tier with zero weight', () => {
    const config: SpawnerConfig = {
      ...BASE,
      spawn: { ...CONFIG.spawn, tierWeights: { easy: 1, medium: 0, hard: 0 } },
      waves: FLAT_WAVES,
    };
    for (const spawned of sequence(new Spawner(5, ALPHABET, config), 100)) {
      expect(spawned.difficulty).toBe('easy');
    }
  });

  it('does not repeat a word within the text history window', () => {
    const texts = sequence(new Spawner(9, getWordList('en'), BASE), 400).map((w) => w.text);
    const window = CONFIG.spawn.textHistory;
    texts.forEach((text, i) => {
      expect(texts.slice(Math.max(0, i - window), i)).not.toContain(text);
    });
  });

  it('avoids first letters used by the most recent words', () => {
    // 26 initials, 5 blocked at a time: a fresh initial is always available.
    const config = { ...BASE, spawn: { ...CONFIG.spawn, initialHistory: 5, textHistory: 10 } };
    const initials = sequence(new Spawner(3, ALPHABET, config), 200).map((w) => stripAccents(w.text[0] ?? ''));
    initials.forEach((initial, i) => {
      expect(initials.slice(Math.max(0, i - 5), i)).not.toContain(initial);
    });
  });

  it('throws when a tier has no words', () => {
    const empty: WordList = { easy: [], medium: ['abcdef'], hard: ['abcdefghi'] };
    expect(() => new Spawner(1, empty, BASE)).toThrow(/easy/);
  });
});

describe('Spawner special words', () => {
  it('mixes in every special kind at roughly the configured rate', () => {
    const words = sequence(new Spawner(21, getWordList('en'), BASE), 2000);
    const kinds = new Set(words.map((w) => w.kind));
    expect([...kinds].sort()).toEqual(['armored', 'bomb', 'ice', 'normal', 'shield']);
    const specials = words.filter((w) => w.kind !== 'normal').length / words.length;
    expect(specials).toBeGreaterThan(CONFIG.waves.specialChanceBase / 2);
    expect(specials).toBeLessThan(CONFIG.waves.maxSpecialChance * 1.2);
  });

  it('spawns no specials when the chance is zero', () => {
    const config = { ...BASE, waves: FLAT_WAVES };
    expect(sequence(new Spawner(22, ALPHABET, config), 200).every((w) => w.kind === 'normal')).toBe(true);
  });
});

describe('Spawner placement and speed', () => {
  it('keeps x inside the configured bounds', () => {
    const p = CONFIG.spawn;
    for (const spawned of sequence(new Spawner(11, getWordList('en'), BASE), 500)) {
      expect(spawned.x).toBeGreaterThanOrEqual(p.xMin);
      expect(spawned.x).toBeLessThanOrEqual(p.xMax);
    }
  });

  it('spreads consecutive words horizontally', () => {
    const xs = sequence(new Spawner(12, getWordList('en'), BASE), 1000).map((w) => w.x);
    const gaps = xs.slice(1).map((x, i) => Math.abs(x - (xs[i] ?? x)));
    const closeCalls = gaps.filter((gap) => gap < CONFIG.spawn.minXGap).length;
    // Uniform random placement would land this close ~45% of the time.
    expect(closeCalls / gaps.length).toBeLessThan(0.15);
  });

  it('keeps speed within base ± jitter, times the wave multiplier', () => {
    const p = CONFIG.spawn;
    for (const spawned of sequence(new Spawner(13, getWordList('pt-BR'), BASE), 300)) {
      const base = p.speed[spawned.difficulty];
      expect(spawned.speed).toBeGreaterThanOrEqual(base * (1 - p.speedJitter));
      expect(spawned.speed).toBeLessThanOrEqual(base * (1 + p.speedJitter) * CONFIG.waves.maxSpeedMultiplier);
    }
  });

  it('later waves fall faster on average', () => {
    const words = sequence(new Spawner(14, getWordList('pt-BR'), BASE), 200);
    const avg = (xs: SpawnedWord[]) => xs.reduce((s, w) => s + w.speed, 0) / xs.length;
    expect(avg(words.slice(150))).toBeGreaterThan(avg(words.slice(0, CONFIG.waves.firstWordCount)));
  });
});

describe('Spawner timing', () => {
  it('waits for the first delay, then spawns every interval', () => {
    const spawner = new Spawner(1, ALPHABET, TIMING);
    expect(spawner.update(0.5, 0)).toBeNull();
    expect(spawner.update(0.5, 0)).not.toBeNull(); // t = 1.0
    expect(spawner.update(1.5, 1)).toBeNull(); // t = 2.5
    expect(spawner.update(0.5, 1)).not.toBeNull(); // t = 3.0
  });

  it('holds while the screen is full and spawns as soon as there is room', () => {
    const spawner = new Spawner(1, ALPHABET, TIMING);
    expect(spawner.update(1, 3)).toBeNull();
    expect(spawner.update(5, 3)).toBeNull();
    expect(spawner.update(0.01, 2)).not.toBeNull();
    // The held time is not "banked": the next one still waits a full interval.
    expect(spawner.update(1.9, 0)).toBeNull();
    expect(spawner.update(0.2, 0)).not.toBeNull();
  });

  it('spawns at most one word per update', () => {
    const spawner = new Spawner(1, ALPHABET, TIMING);
    expect(spawner.update(100, 0)).not.toBeNull();
    expect(spawner.update(0, 0)).toBeNull();
  });
});

describe('Spawner bosses', () => {
  const WITH_BOSS: SpawnerConfig = {
    ...BASE,
    boss: { config: CONFIG.boss, phrases: getBossPhrases('pt-BR'), difficultySpeed: 0.8 },
  };

  /** Everything released up to the start of `wave`, by a player who clears the screen at once. */
  function upTo(spawner: Spawner, wave: number): { words: SpawnedWord[]; bosses: { boss: SpawnedBoss; wave: number; after: number }[] } {
    const words: SpawnedWord[] = [];
    const bosses: { boss: SpawnedBoss; wave: number; after: number }[] = [];
    for (let i = 0; spawner.wave < wave && i < 200_000; i++) {
      const spawned = spawner.update(0.1, 0);
      if (spawned?.kind === 'boss') bosses.push({ boss: spawned, wave: spawner.wave, after: words.length });
      else if (spawned) words.push(spawned);
    }
    return { words, bosses };
  }

  const wordsBefore = (wave: number) =>
    Array.from({ length: wave }, (_, i) => Math.min(CONFIG.waves.maxWordCount, CONFIG.waves.firstWordCount + i * CONFIG.waves.wordCountStep)).reduce((a, b) => a + b, 0);

  it('one boss closes waves 5, 10 and 15, after their last word', () => {
    const { bosses } = upTo(new Spawner('s', getWordList('pt-BR'), WITH_BOSS), 17);
    expect(bosses.map(({ wave, after }) => [wave, after])).toEqual([5, 10, 15].map((wave) => [wave, wordsBefore(wave)]));
    expect(bosses.map(({ boss }) => boss)).toEqual(
      [1, 2, 3].map((number) => ({
        kind: 'boss',
        number,
        phrase: bossPhrase('s', number, getBossPhrases('pt-BR')),
        speed: bossSpeed(number * 5, 0.8),
      })),
    );
  });

  it('never changes the words of a seed', () => {
    const words = getWordList('pt-BR');
    const plain = upTo(new Spawner('daily:2026-11-22', words, BASE), 17);
    const withBoss = upTo(new Spawner('daily:2026-11-22', words, WITH_BOSS), 17);
    expect(plain.bosses).toEqual([]);
    expect(withBoss.words).toEqual(plain.words);
  });

  it('waits for a clear screen, then for the boss to be gone', () => {
    const spawner = new Spawner('s', getWordList('pt-BR'), WITH_BOSS);
    upTo(spawner, 5);
    play(spawner, wordsBefore(5) - wordsBefore(4), () => 0, 0.5);
    for (let i = 0; i < 50; i++) expect(spawner.update(0.5, 2)).toBeNull(); // words left on screen
    expect(spawner.update(0.5, 0)?.kind).toBe('boss');
    for (let i = 0; i < 50; i++) expect(spawner.update(0.5, 1)).toBeNull(); // the boss is there
    expect(spawner.wave).toBe(5);
    expect(spawner.update(0.5, 0)).toBeNull(); // gone: wave 6 is announced
    expect(spawner.wave).toBe(6);
    expect(spawner.update(CONFIG.waves.breakSeconds + 0.1, 0)?.kind).not.toBe('boss');
  });

  it('modes without wave breaks (Time Attack) have none', () => {
    const { bosses } = upTo(new Spawner('s', getWordList('pt-BR'), { ...WITH_BOSS, waveBreak: false }), 12);
    expect(bosses).toEqual([]);
  });
});

describe('Spawner waves', () => {
  const quota = CONFIG.waves.firstWordCount;

  it('starts at wave 1', () => {
    expect(new Spawner(1, ALPHABET, BASE).wave).toBe(1);
  });

  it('with breaks: waits for a clear screen, announces the wave, pauses, then continues', () => {
    const spawner = new Spawner(1, ALPHABET, BASE);
    expect(play(spawner, quota, () => 0, 0.5)).toHaveLength(quota);
    expect(spawner.wave).toBe(1);

    // Words still on screen: nothing happens, however long we wait.
    for (let i = 0; i < 100; i++) expect(spawner.update(0.5, 1)).toBeNull();
    expect(spawner.wave).toBe(1);

    // Screen clear: wave 2 is announced, then the break runs.
    expect(spawner.update(0.01, 0)).toBeNull();
    expect(spawner.wave).toBe(2);
    expect(spawner.update(CONFIG.waves.breakSeconds - 0.1, 0)).toBeNull();
    expect(spawner.update(0.2, 0)).not.toBeNull();
  });

  it('without breaks (Time Attack): the next wave starts right after the last word', () => {
    const spawner = new Spawner(1, ALPHABET, { ...BASE, waveBreak: false });
    play(spawner, quota, () => 5, 0.5);
    expect(spawner.wave).toBe(2);
    expect(play(spawner, 1, () => 5, 0.5)).toHaveLength(1);
  });

  it('wave N+1 has more words than wave N', () => {
    const spawner = new Spawner(1, ALPHABET, { ...BASE, waveBreak: false });
    const waveOf: number[] = [];
    for (let i = 0; i < 60; i++) {
      play(spawner, 1, () => 0, 0.5);
      waveOf.push(spawner.wave);
    }
    const count = (w: number) => waveOf.filter((x) => x === w).length;
    expect(count(2)).toBeGreaterThan(count(1) - 1);
    expect(count(3)).toBeGreaterThan(count(2));
  });
});
