import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { applyDifficulty } from '../game/difficulty.ts';
import { Spawner } from '../game/spawner.ts';
import type { SpawnedWord } from '../game/types.ts';
import { dayIndex } from '../utils/day.ts';
import { getWordList } from '../words/index.ts';
import type { Language } from '../words/types.ts';
import { dailySeed, matchContent } from './daily.ts';
import { MODES } from './index.ts';

const at = (iso: string): number => Date.parse(iso);

/** The spawner of a Daily Challenge, as Game builds it. */
function dailySpawner(epochMs: number, lang: Language): Spawner {
  const { seed } = matchContent('daily', null, epochMs);
  const difficulty = MODES.daily.fixedDifficulty ?? 'normal';
  return new Spawner(seed, getWordList(lang), {
    spawn: applyDifficulty(CONFIG.spawn, CONFIG.difficulty[difficulty]),
    waves: CONFIG.waves,
    specials: CONFIG.specials,
    waveBreak: MODES.daily.waveBreak,
  });
}

/** The first `count` words released to a player who keeps `active()` words on screen. */
function released(spawner: Spawner, count: number, dt: number, active: () => number): SpawnedWord[] {
  const words: SpawnedWord[] = [];
  for (let step = 0; words.length < count && step < 1_000_000; step++) {
    const word = spawner.update(dt, active());
    if (word) words.push(word);
  }
  expect(words).toHaveLength(count);
  return words;
}

describe('dailySeed', () => {
  it('is built from the game day, like the shop seed', () => {
    expect(dailySeed(dayIndex(at('2026-11-22T12:00:00Z')))).toBe('daily:2026-11-22');
  });
});

describe('matchContent', () => {
  it('daily: the day and its seed, turning at 03:00 UTC', () => {
    const before = matchContent('daily', null, at('2026-11-22T02:59:59.999Z'));
    const after = matchContent('daily', null, at('2026-11-22T03:00:00Z'));
    expect(before.seed).toBe('daily:2026-11-21');
    expect(after).toEqual({ seed: 'daily:2026-11-22', day: before.day + 1 });
    expect(after.day).toBe(dayIndex(at('2026-11-22T03:00:00Z')));
  });

  it('daily: ?seed= cannot change the challenge', () => {
    const now = at('2026-11-22T12:00:00Z');
    expect(matchContent('daily', 'abc', now)).toEqual(matchContent('daily', null, now));
  });

  it('other modes: ?seed= or a new seed every match, and day 0', () => {
    expect(matchContent('survival', 'abc', 123)).toEqual({ seed: 'abc', day: 0 });
    expect(matchContent('timeAttack', null, 123)).toEqual({ seed: 123, day: 0 });
    expect(matchContent('zen', null, 456)).toEqual({ seed: 456, day: 0 });
  });
});

describe('Daily Challenge sequence', () => {
  const MORNING = at('2026-11-22T03:00:00Z');
  const NIGHT = at('2026-11-23T02:59:59Z');

  it('is identical all day long', () => {
    const first = dailySpawner(MORNING, 'pt-BR');
    const last = dailySpawner(NIGHT, 'pt-BR');
    for (let i = 0; i < 300; i++) expect(last.next()).toEqual(first.next());
  });

  it('is identical however fast or well each player plays', () => {
    const count = 120; // several waves
    // Clears the screen at once vs. always has a nearly full one, at different frame lengths.
    const fast = released(dailySpawner(MORNING, 'pt-BR'), count, 1 / 60, () => 0);
    let calls = 0;
    const slow = released(dailySpawner(NIGHT, 'pt-BR'), count, 1 / 20, () => (calls++ % 50 === 0 ? 0 : CONFIG.spawn.maxActive - 1));
    expect(slow).toEqual(fast);
  });

  it('changes with the day and with the language', () => {
    const texts = (spawner: Spawner) => Array.from({ length: 30 }, () => spawner.next().text);
    expect(texts(dailySpawner(NIGHT + 2000, 'pt-BR'))).not.toEqual(texts(dailySpawner(NIGHT, 'pt-BR')));
    expect(texts(dailySpawner(MORNING, 'en'))).not.toEqual(texts(dailySpawner(MORNING, 'pt-BR')));
  });
});
