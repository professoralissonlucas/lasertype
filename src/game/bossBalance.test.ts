// The boss must stay beatable, above all on Easy. A simulated typist (testing/typist.ts) plays
// the real rules: the numbers here were measured, then rounded with a margin. If a balance
// change breaks them, the boss became a wall: retune CONFIG.boss instead of the numbers.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { getBossPhrases } from '../words/index.ts';
import { LANGUAGES, type Language } from '../words/types.ts';
import { bossPhrase, bossTier } from './boss.ts';
import { fightBoss, playMatch, type Skill } from './testing/typist.ts';
import type { GameDifficulty } from './types.ts';

/** A beginner: many errors, slow to read each word. */
const BEGINNER = { errorRate: 0.14, reaction: 0.8 } as const;
const AVERAGE = { errorRate: 0.08, reaction: 0.5 } as const;
const SEEDS = ['a', 'b', 'c'];

/** Phrases × seeds × languages a typist loses (empty = always wins). */
function losses(wave: number, difficulty: GameDifficulty, skill: Skill): string[] {
  const tier = bossTier(wave / CONFIG.boss.everyWaves);
  return LANGUAGES.flatMap((lang) =>
    getBossPhrases(lang)[tier].flatMap((phrase) =>
      SEEDS.filter((seed) => !fightBoss(wave, difficulty, phrase, skill, seed).defeated).map((seed) => `${phrase} (${seed})`),
    ),
  );
}

describe('boss balance — Easy', () => {
  // Measured over 320 fights each: every one is won at 20, 37, 64 and 77 WPM. Getting to those
  // waves on Easy takes about 36, 100 and 190 WPM with this many errors (nobody reaches wave 20).
  it.each([
    [5, 22],
    [10, 40],
    [15, 68],
    [20, 82],
  ])('wave %i: a beginner at %i WPM beats every phrase, in both languages', (wave, wpm) => {
    expect(losses(wave, 'easy', { wpm, ...BEGINNER })).toEqual([]);
  });

  it('an average typist beats the first one at 18 WPM', () => {
    expect(losses(5, 'easy', { wpm: 18, ...AVERAGE })).toEqual([]);
  });

  it('gives time to recover: at 30 WPM it dies before the last third of the field', () => {
    for (const lang of LANGUAGES) {
      for (const phrase of getBossPhrases(lang).small) {
        expect(fightBoss(5, 'easy', phrase, { wpm: 30, ...AVERAGE }, 'a').y, phrase).toBeLessThan(0.67);
      }
    }
  });

  it('is still a threat: very slow typing or none loses', () => {
    expect(losses(5, 'easy', { wpm: 8, ...AVERAGE }).length).toBeGreaterThan(0);
    const idle = fightBoss(5, 'easy', 'sol mar', { wpm: 0.001, ...AVERAGE }, 'a');
    expect(idle).toMatchObject({ defeated: false, y: 1 });
    expect(idle.seconds).toBeGreaterThan(28);
    expect(idle.seconds).toBeLessThan(31);
  });

  it.each(LANGUAGES)('real matches (%s): whoever reaches the first boss beats it and loses nothing to it', (lang) => {
    let met = 0;
    for (let i = 0; i < 10; i++) {
      const setup = { difficulty: 'easy', lang, seed: `easy-${i}`, skill: { wpm: 30, ...AVERAGE }, untilWave: 6 } as const;
      const withBoss = playMatch(setup);
      const without = playMatch({ ...setup, bosses: false });
      expect(withBoss.bosses.every((boss) => boss.defeated)).toBe(true);
      // The wave 6 is reached exactly as often, with exactly the same shield.
      expect(withBoss.state.wave).toBe(without.state.wave);
      expect(withBoss.state.shield).toBe(without.state.shield);
      met += withBoss.bosses.length;
    }
    expect(met).toBeGreaterThan(0);
  });
});

describe('boss balance — every difficulty', () => {
  // About the speed at which half of the matches reach the end of wave 5 / 10 (average typist).
  const ARRIVAL: readonly [GameDifficulty, number, number][] = [
    ['easy', 30, 70],
    ['normal', 42, 95],
    ['hard', 65, 120],
  ];

  it.each(ARRIVAL)('%s: whoever gets there wins even at 0.6× that speed', (difficulty, first, second) => {
    expect(losses(5, difficulty, { wpm: first * 0.6, ...AVERAGE })).toEqual([]);
    expect(losses(10, difficulty, { wpm: second * 0.6, ...AVERAGE })).toEqual([]);
  });

  it.each(ARRIVAL)('%s: real matches at that speed meet the boss and beat it', (difficulty, wpm) => {
    const lang: Language = 'pt-BR';
    let met = 0;
    for (let i = 0; i < 12; i++) {
      const seed = `real-${i}`;
      const { bosses } = playMatch({ difficulty, lang, seed, skill: { wpm, ...AVERAGE }, untilWave: 6 });
      for (const boss of bosses) {
        met++;
        expect(boss.defeated, `${seed}: ${bossPhrase(seed, boss.number, getBossPhrases(lang))}`).toBe(true);
      }
    }
    expect(met).toBeGreaterThan(0);
  });
});
