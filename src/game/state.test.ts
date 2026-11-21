import { describe, expect, it } from 'vitest';
import type { Word } from './entities/Word.ts';
import {
  createMatchState,
  lockedWord,
  matchAccuracy,
  spawnWord,
  stepMatch,
  typeChar,
  unlockTarget,
  type MatchState,
} from './state.ts';
import type { GameEvent, SpawnedWord, WordSource } from './types.ts';

const LOOSE = { requireAccents: false };
const NO_SPAWNS: WordSource = { update: () => null };

function setup(words: { text: string; y?: number; speed?: number }[]): {
  state: MatchState;
  events: GameEvent[];
  added: Word[];
} {
  const state = createMatchState(3);
  const events: GameEvent[] = [];
  const added = words.map(({ text, y = 0.5, speed = 0.1 }) =>
    spawnWord(state, { text, difficulty: 'easy', x: 0.5, speed }, events, y),
  );
  events.length = 0;
  return { state, events, added };
}

function typeAll(state: MatchState, text: string, events: GameEvent[]): void {
  for (const char of text) typeChar(state, char, LOOSE, events);
}

describe('createMatchState', () => {
  it('starts playing with a full shield', () => {
    const state = createMatchState(3);
    expect(state).toMatchObject({ status: 'playing', shield: 3, maxShield: 3, lockedId: null });
    expect(state.words).toEqual([]);
  });
});

describe('typing', () => {
  it('locks on the first letter and lights up typed letters', () => {
    const { state, events } = setup([{ text: 'sol' }]);
    typeChar(state, 's', LOOSE, events);
    expect(lockedWord(state)?.typed).toBe(1);
    expect(events.map((e) => e.type)).toEqual(['lock', 'hit']);
  });

  it('destroys a completed word and releases the lock', () => {
    const { state, events } = setup([{ text: 'sol' }]);
    typeAll(state, 'sol', events);
    expect(state.words).toEqual([]);
    expect(state.lockedId).toBeNull();
    expect(state.stats).toMatchObject({ destroyed: 1, hits: 3, misses: 0 });
    expect(events.at(-1)).toMatchObject({ type: 'destroy', text: 'sol' });
  });

  it('accepts accented words typed without accents', () => {
    const { state, events } = setup([{ text: 'maçã' }]);
    typeAll(state, 'maca', events);
    expect(state.stats.destroyed).toBe(1);
  });

  it('reports hit coordinates so the laser can aim at the letter', () => {
    const { state, events, added } = setup([{ text: 'lua', y: 0.4 }]);
    typeAll(state, 'lu', events);
    expect(events.at(-1)).toEqual({
      type: 'hit',
      wordId: added[0]?.id,
      index: 1,
      length: 3,
      x: 0.5,
      y: 0.4,
    });
  });

  it('counts a wrong letter as a miss and keeps the lock', () => {
    const { state, events, added } = setup([{ text: 'sol' }]);
    typeAll(state, 'sx', events);
    expect(state.lockedId).toBe(added[0]?.id);
    expect(lockedWord(state)?.typed).toBe(1);
    expect(state.stats.misses).toBe(1);
    expect(events.at(-1)).toEqual({ type: 'miss', wordId: added[0]?.id });
  });

  it('counts a key that matches no word as a miss', () => {
    const { state, events } = setup([{ text: 'sol' }]);
    typeChar(state, 'z', LOOSE, events);
    expect(state.stats.misses).toBe(1);
    expect(events).toEqual([{ type: 'miss', wordId: null }]);
  });

  it('targets the word closest to the perimeter', () => {
    const { state, events, added } = setup([
      { text: 'sol', y: 0.2 },
      { text: 'sal', y: 0.8 },
    ]);
    typeChar(state, 's', LOOSE, events);
    expect(state.lockedId).toBe(added[1]?.id);
  });
});

describe('unlockTarget', () => {
  it('releases the lock and resets progress', () => {
    const { state, events, added } = setup([{ text: 'sol' }]);
    typeAll(state, 'so', events);
    unlockTarget(state, events);
    expect(state.lockedId).toBeNull();
    expect(added[0]?.typed).toBe(0);
    expect(events.at(-1)).toMatchObject({ type: 'unlock' });
  });

  it('does nothing without a lock', () => {
    const { state, events } = setup([{ text: 'sol' }]);
    unlockTarget(state, events);
    expect(events).toEqual([]);
  });
});

describe('stepMatch', () => {
  it('moves words down and keeps the previous position for interpolation', () => {
    const { state, events, added } = setup([{ text: 'sol', y: 0.5, speed: 0.1 }]);
    stepMatch(state, 0.5, NO_SPAWNS, events);
    expect(added[0]?.prevY).toBeCloseTo(0.5);
    expect(added[0]?.y).toBeCloseTo(0.55);
    expect(state.elapsed).toBeCloseTo(0.5);
  });

  it('takes 1 HP when a word crosses the perimeter', () => {
    const { state, events } = setup([{ text: 'sol', y: 0.99, speed: 0.1 }]);
    stepMatch(state, 0.2, NO_SPAWNS, events);
    expect(state.words).toEqual([]);
    expect(state.shield).toBe(2);
    expect(events).toMatchObject([{ type: 'breach', shield: 2 }]);
  });

  it('releases the lock when the locked word breaches', () => {
    const { state, events } = setup([{ text: 'sol', y: 0.99, speed: 0.1 }]);
    typeChar(state, 's', LOOSE, events);
    stepMatch(state, 0.2, NO_SPAWNS, events);
    expect(state.lockedId).toBeNull();
  });

  it('ends the match when the shield reaches zero', () => {
    const { state, events } = setup([
      { text: 'sol', y: 0.99 },
      { text: 'lua', y: 0.99 },
      { text: 'mar', y: 0.99 },
    ]);
    stepMatch(state, 0.2, NO_SPAWNS, events);
    expect(state.shield).toBe(0);
    expect(state.status).toBe('gameover');
    expect(events.filter((e) => e.type === 'gameover')).toHaveLength(1);
  });

  it('freezes after game over: no movement, no typing', () => {
    const { state, events } = setup([
      { text: 'sol', y: 0.99 },
      { text: 'lua', y: 0.99 },
      { text: 'mar', y: 0.99 },
      { text: 'gato', y: 0.1 },
    ]);
    stepMatch(state, 0.2, NO_SPAWNS, events);
    const remaining = state.words.map((w) => w.y);
    stepMatch(state, 1, NO_SPAWNS, events);
    typeChar(state, 'g', LOOSE, events);
    expect(state.words.map((w) => w.y)).toEqual(remaining);
    expect(state.lockedId).toBeNull();
  });

  it('adds words handed out by the source', () => {
    const spawned: SpawnedWord = { text: 'nave', difficulty: 'easy', x: 0.3, speed: 0.07 };
    const source: WordSource = { update: (_dt, active) => (active === 0 ? spawned : null) };
    const { state, events } = setup([]);
    stepMatch(state, 1 / 60, source, events);
    stepMatch(state, 1 / 60, source, events);
    expect(state.words.map((w) => w.text)).toEqual(['nave']);
    expect(events).toMatchObject([{ type: 'spawn' }]);
  });
});

describe('matchAccuracy', () => {
  it('is hits over all keys typed', () => {
    expect(matchAccuracy({ destroyed: 0, hits: 9, misses: 1, breaches: 0 })).toBeCloseTo(0.9);
  });

  it('is 0 when nothing was typed', () => {
    expect(matchAccuracy({ destroyed: 0, hits: 0, misses: 0, breaches: 0 })).toBe(0);
  });
});
