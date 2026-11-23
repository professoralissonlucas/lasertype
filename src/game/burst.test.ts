import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { burstLetter, burstWord, burstWpm, createBurst, type BurstState } from './burst.ts';
import { buildReport } from './report.ts';
import { activateEmp, createMatchState, spawnBoss, spawnWord, typeChar, unlockTarget, type MatchState } from './state.ts';
import { playMatch } from './testing/typist.ts';
import type { GameEvent } from './types.ts';

const LOOSE = { requireAccents: false };
const config = { words: 3, minLetters: 3, maxWpm: 250 };

/** Types a word of `letters` letters, one every `gap` seconds, from `start`. */
function word(burst: BurstState, start: number, letters: number, gap: number, c = config): void {
  for (let i = 0; i < letters; i++) burstLetter(burst, start + i * gap, i === 0);
  burstWord(burst, start + (letters - 1) * gap, c);
}

describe('burst', () => {
  it('counts only the time from the first to the last letter of each word', () => {
    const burst = createBurst();
    // 0.12 s per letter = 100 WPM, however long the waits in between.
    word(burst, 0, 5, 0.12);
    word(burst, 60, 4, 0.12);
    expect(burst.best).toBe(0); // not enough words yet
    word(burst, 500, 7, 0.12);
    expect(burst.best).toBeCloseTo(100);
  });

  it('keeps the best run of words in a row', () => {
    const burst = createBurst();
    for (const gap of [0.4, 0.4, 0.4, 0.2, 0.2, 0.2, 0.4, 0.4]) word(burst, 0, 6, gap);
    expect(burst.best).toBeCloseTo(60);
    expect(burst.recent).toHaveLength(3);
  });

  it('leaves out words too short to measure', () => {
    const burst = createBurst();
    for (let i = 0; i < 5; i++) word(burst, i, 2, 0.01);
    expect(burst.best).toBe(0);
    expect(burst.recent).toEqual([]);
  });

  it('is capped, also when the letters arrive all at once', () => {
    expect(burstWpm([{ gaps: 9, seconds: 0 }], config)).toBe(250);
    expect(burstWpm([{ gaps: 9, seconds: 0.001 }], config)).toBe(250);
    expect(burstWpm([], config)).toBe(0);
  });
});

describe('burst in a match', () => {
  function typed(state: MatchState, text: string, gap: number, events: GameEvent[]): void {
    for (const char of text) {
      typeChar(state, char, LOOSE, events);
      state.elapsed += gap;
    }
  }

  it('measures words typed, armored ones over both passes', () => {
    const state = createMatchState();
    const events: GameEvent[] = [];
    spawnWord(state, { text: 'laser', difficulty: 'easy', kind: 'armored', x: 0.5, speed: 0.1 }, events);
    typed(state, 'laserlaser', 0.1, events);
    expect(state.burst.recent).toEqual([{ gaps: 9, seconds: expect.closeTo(0.9) as number }]);
  });

  it('a wrong key only costs its time; letting go of the word starts it over', () => {
    const state = createMatchState();
    const events: GameEvent[] = [];
    spawnWord(state, { text: 'nave', difficulty: 'easy', kind: 'normal', x: 0.5, speed: 0.1 }, events);
    typed(state, 'na', 5, events); // slow, then released
    unlockTarget(state, events);
    typed(state, 'nxave', 0.1, events);
    expect(state.burst.recent).toEqual([{ gaps: 3, seconds: expect.closeTo(0.4) as number }]);
  });

  it('words destroyed by the EMP do not count', () => {
    const state = createMatchState();
    const events: GameEvent[] = [];
    spawnWord(state, { text: 'nave', difficulty: 'easy', kind: 'normal', x: 0.5, speed: 0.1 }, events);
    typed(state, 'na', 0.1, events);
    state.combo = { ...state.combo, charge: 1 };
    activateEmp(state, events);
    expect(state.burst.recent).toEqual([]);
  });

  it('counts each word of a boss, without the pause between them', () => {
    const state = createMatchState();
    const events: GameEvent[] = [];
    const boss = spawnBoss(state, { kind: 'boss', number: 1, phrase: 'sol e mar', speed: 0.01 }, events);
    boss.alert = 0;
    typed(state, 'sol', 0.1, events);
    state.elapsed += 10;
    typed(state, 'emar', 0.1, events);
    expect(state.burst.recent).toEqual([
      { gaps: 2, seconds: expect.closeTo(0.2) as number },
      { gaps: 2, seconds: expect.closeTo(0.2) as number },
    ]);
  });

  it('goes to the report', () => {
    const state = createMatchState();
    for (let i = 0; i < CONFIG.burst.words; i++) word(state.burst, i, 5, 0.15, CONFIG.burst);
    expect(buildReport(state).burst).toBeCloseTo(80);
  });
});

describe('burst balance (why 100 WPM is not measured over the match)', () => {
  const fast = { errorRate: 0.03, reaction: 0.25 };
  const best = (wpm: number) =>
    playMatch({ difficulty: 'hard', lang: 'pt-BR', seed: 'burst', skill: { wpm, ...fast }, untilWave: 12 }).state;

  it('a typist well above 100 WPM reaches it, one well below does not', () => {
    const target = CONFIG.progression.achievements.lightning;
    expect(best(125).burst.best).toBeGreaterThan(target);
    expect(best(85).burst.best).toBeLessThan(target);
  });

  it('the match WPM of even a perfect typist never gets there: it waits for words', () => {
    const state = playMatch({
      difficulty: 'hard',
      lang: 'pt-BR',
      seed: 'perfect',
      skill: { wpm: 300, errorRate: 0, reaction: 0 },
      untilWave: 25,
    }).state;
    expect(buildReport(state).wpm).toBeLessThan(100);
    expect(state.burst.best).toBeGreaterThan(200);
  });
});
