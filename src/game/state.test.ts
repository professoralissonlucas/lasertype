import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { MODES } from '../modes/index.ts';
import type { ModeRules } from '../modes/types.ts';
import type { Word } from './entities/Word.ts';
import {
  activateEmp,
  createMatchState,
  endMatch,
  lockedWord,
  matchAccuracy,
  spawnWord,
  stepMatch,
  timeLeft,
  togglePause,
  typeChar,
  unlockTarget,
  type MatchState,
} from './state.ts';
import type { GameEvent, SpawnedWord, WordKind, WordSource } from './types.ts';

const LOOSE = { requireAccents: false };
const NO_SPAWNS: WordSource = { wave: 1, update: () => null };

interface WordSpec {
  text: string;
  y?: number;
  x?: number;
  speed?: number;
  kind?: WordKind;
}

function setup(words: WordSpec[], mode: ModeRules = MODES.survival): {
  state: MatchState;
  events: GameEvent[];
  added: Word[];
} {
  const state = createMatchState({ mode, maxShield: 3 });
  state.wave = 1; // as if the first update already announced it
  const events: GameEvent[] = [];
  const added = words.map(({ text, y = 0.6, x = 0.5, speed = 0.1, kind = 'normal' }) =>
    spawnWord(state, { text, difficulty: 'easy', kind, x, speed }, events, y),
  );
  events.length = 0;
  return { state, events, added };
}

function typeAll(state: MatchState, text: string, events: GameEvent[]): void {
  for (const char of text) typeChar(state, char, LOOSE, events);
}

const types = (events: GameEvent[]) => events.map((e) => e.type);

describe('createMatchState', () => {
  it('starts playing with a full shield, no score and wave 0 (announced on the first update)', () => {
    const state = createMatchState({ maxShield: 3 });
    expect(state).toMatchObject({ status: 'playing', shield: 3, maxShield: 3, lockedId: null, score: 0, wave: 0 });
    expect(state.mode).toBe(MODES.survival);
    expect(state.combo).toEqual({ combo: 0, maxCombo: 0, charge: 0 });
  });
});

describe('typing', () => {
  it('locks on the first letter and lights up typed letters', () => {
    const { state, events } = setup([{ text: 'sol' }]);
    typeChar(state, 's', LOOSE, events);
    expect(lockedWord(state)?.typed).toBe(1);
    expect(types(events)).toEqual(['lock', 'hit']);
  });

  it('destroys a completed word and releases the lock', () => {
    const { state, events } = setup([{ text: 'sol' }]);
    typeAll(state, 'sol', events);
    expect(state.words).toEqual([]);
    expect(state.lockedId).toBeNull();
    expect(state.stats).toMatchObject({ destroyed: 1, hits: 3, misses: 0 });
    expect(events.find((e) => e.type === 'destroy')).toMatchObject({ text: 'sol', cause: 'typed' });
  });

  it('accepts accented words typed without accents', () => {
    const { state, events } = setup([{ text: 'maçã' }]);
    typeAll(state, 'maca', events);
    expect(state.stats.destroyed).toBe(1);
  });

  it('reports hit coordinates so the laser can aim at the letter', () => {
    const { state, events, added } = setup([{ text: 'lua', y: 0.4 }]);
    typeAll(state, 'lu', events);
    expect(events.at(-1)).toEqual({ type: 'hit', wordId: added[0]?.id, index: 1, length: 3, x: 0.5, y: 0.4 });
  });

  it('counts a wrong letter as a miss and keeps the lock', () => {
    const { state, events, added } = setup([{ text: 'sol' }]);
    typeAll(state, 'sx', events);
    expect(state.lockedId).toBe(added[0]?.id);
    expect(lockedWord(state)?.typed).toBe(1);
    expect(state.stats.misses).toBe(1);
    expect(events.at(-1)).toEqual({ type: 'miss', wordId: added[0]?.id, comboLost: 0 });
  });

  it('counts a key that matches no word as a miss', () => {
    const { state, events } = setup([{ text: 'sol' }]);
    typeChar(state, 'z', LOOSE, events);
    expect(state.stats.misses).toBe(1);
    expect(events).toEqual([{ type: 'miss', wordId: null, comboLost: 0 }]);
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

describe('combo and score', () => {
  it('scores letters × 10 × multiplier, with 1.5× in the upper half', () => {
    const low = setup([{ text: 'sol', y: 0.6 }]);
    typeAll(low.state, 'sol', low.events);
    expect(low.state.score).toBe(30);

    const high = setup([{ text: 'sol', y: 0.3 }]);
    typeAll(high.state, 'sol', high.events);
    expect(high.state.score).toBe(45);
  });

  it('adds 1 combo per clean word and resets it on any wrong key', () => {
    const { state, events } = setup([{ text: 'sol' }, { text: 'lua' }, { text: 'mar' }]);
    typeAll(state, 'sol', events);
    typeAll(state, 'lua', events);
    expect(state.combo.combo).toBe(2);
    events.length = 0;
    typeChar(state, 'x', LOOSE, events);
    expect(state.combo.combo).toBe(0);
    expect(state.combo.maxCombo).toBe(2);
    expect(events).toEqual([{ type: 'miss', wordId: null, comboLost: 2 }]);
  });

  it('a word with an error does not count for the combo', () => {
    const { state, events } = setup([{ text: 'sol' }]);
    typeAll(state, 'soxl', events); // wrong key mid-word
    expect(state.stats.destroyed).toBe(1);
    expect(state.combo.combo).toBe(0);
  });

  it('the 5th clean word already scores 2× and announces the new multiplier', () => {
    const texts = ['aaa', 'bbb', 'ccc', 'ddd', 'eee'];
    const { state, events } = setup(texts.map((text) => ({ text })));
    for (const text of texts.slice(0, 4)) typeAll(state, text, events);
    expect(state.score).toBe(4 * 30);
    events.length = 0;
    typeAll(state, 'eee', events);
    expect(state.score).toBe(4 * 30 + 60);
    expect(events).toContainEqual({ type: 'multiplier', multiplier: 2 });
  });

  it('breaching does not break the combo', () => {
    const { state, events } = setup([{ text: 'sol' }, { text: 'mar', y: 0.99 }]);
    typeAll(state, 'sol', events);
    stepMatch(state, 0.2, NO_SPAWNS, events);
    expect(state.shield).toBe(2);
    expect(state.combo.combo).toBe(1);
  });
});

describe('special words', () => {
  it('armored words must be typed twice and stay locked between passes', () => {
    const { state, events, added } = setup([{ text: 'sol', kind: 'armored' }]);
    typeAll(state, 'sol', events);
    expect(state.words).toHaveLength(1);
    expect(state.lockedId).toBe(added[0]?.id);
    expect(added[0]).toMatchObject({ armor: 0, typed: 0 });
    expect(events).toContainEqual(expect.objectContaining({ type: 'armorBreak', armorLeft: 0 }));
    typeAll(state, 'sol', events);
    expect(state.words).toHaveLength(0);
    // Both passes count as letters: 6 × 10.
    expect(state.score).toBe(60);
  });

  it('bombs destroy nearby words for half points, but not far ones', () => {
    const { state, events } = setup([
      { text: 'bum', x: 0.5, y: 0.6, kind: 'bomb' },
      { text: 'perto', x: 0.6, y: 0.65 },
      { text: 'longe', x: 0.95, y: 0.1 },
    ]);
    typeAll(state, 'bum', events);
    expect(state.words.map((w) => w.text)).toEqual(['longe']);
    expect(events).toContainEqual({ type: 'bomb', x: 0.5, y: 0.6 });
    expect(events).toContainEqual(expect.objectContaining({ type: 'destroy', text: 'perto', cause: 'bomb', points: 25 }));
    expect(state.score).toBe(30 + 25);
    expect(state.stats.destroyed).toBe(2);
  });

  it('ice slows the battlefield for a few seconds', () => {
    const { state, events } = setup([{ text: 'gelo', kind: 'ice' }, { text: 'mar', y: 0.5, speed: 0.1 }]);
    typeAll(state, 'gelo', events);
    expect(state.slowTimer).toBe(CONFIG.specials.slowSeconds);
    const mar = state.words[0];
    stepMatch(state, 1, NO_SPAWNS, events);
    expect(mar?.y).toBeCloseTo(0.5 + 0.1 * CONFIG.specials.slowFactor);
    stepMatch(state, CONFIG.specials.slowSeconds, NO_SPAWNS, events);
    expect(state.slowTimer).toBe(0);
  });

  it('shield words restore 1 HP, never above the maximum', () => {
    const { state, events } = setup([{ text: 'escudo', kind: 'shield' }, { text: 'muro', kind: 'shield' }]);
    state.shield = 2;
    typeAll(state, 'escudo', events);
    expect(state.shield).toBe(3);
    typeAll(state, 'muro', events);
    expect(state.shield).toBe(3);
    expect(events.filter((e) => e.type === 'shieldUp')).toEqual([
      { type: 'shieldUp', shield: 3, gained: 1 },
      { type: 'shieldUp', shield: 3, gained: 0 },
    ]);
  });
});

describe('EMP', () => {
  it('is refused without a full charge', () => {
    const { state, events } = setup([{ text: 'sol' }]);
    expect(activateEmp(state, events)).toBe(false);
    expect(events).toEqual([{ type: 'empDenied' }]);
    expect(state.words).toHaveLength(1);
  });

  it('charges with destroyed words and announces when full', () => {
    const { state, events } = setup([{ text: 'sol' }]);
    state.combo = { combo: 0, maxCombo: 0, charge: 1 - CONFIG.combo.chargePerWord };
    typeAll(state, 'sol', events);
    expect(state.combo.charge).toBeCloseTo(1);
    expect(events).toContainEqual({ type: 'empReady' });
  });

  it('destroys every word for half points, empties the charge and keeps the combo', () => {
    const { state, events } = setup([{ text: 'sol', y: 0.6 }, { text: 'lua', y: 0.3 }, { text: 'mar', kind: 'shield' }]);
    state.combo = { combo: 7, maxCombo: 7, charge: 1 };
    state.shield = 2;
    typeChar(state, 's', LOOSE, events);
    expect(activateEmp(state, events)).toBe(true);
    expect(state.words).toEqual([]);
    expect(state.lockedId).toBeNull();
    expect(state.combo).toMatchObject({ combo: 7, charge: 0 });
    // 2× multiplier, half points: sol 30, lua 45 (upper half), mar 30.
    expect(state.score).toBe(30 + 45 + 30);
    // Specials caught by the EMP do not trigger.
    expect(state.shield).toBe(2);
    expect(state.stats.empUses).toBe(1);
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

describe('pause', () => {
  it('freezes the match and ignores typing until resumed', () => {
    const { state, events, added } = setup([{ text: 'sol', y: 0.5 }]);
    togglePause(state, events);
    expect(state.status).toBe('paused');
    stepMatch(state, 1, NO_SPAWNS, events);
    typeChar(state, 's', LOOSE, events);
    expect(added[0]?.y).toBe(0.5);
    expect(state.lockedId).toBeNull();
    expect(state.elapsed).toBe(0);
    togglePause(state, events);
    expect(state.status).toBe('playing');
    expect(types(events)).toEqual(['pause', 'resume']);
  });

  it('can end the match from the pause (quit)', () => {
    const { state, events } = setup([]);
    togglePause(state, events);
    endMatch(state, 'quit', events);
    expect(state).toMatchObject({ status: 'gameover', endReason: 'quit' });
    togglePause(state, events);
    expect(state.status).toBe('gameover');
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
    expect(events).toMatchObject([{ type: 'breach', text: 'sol', shield: 2, damage: true }]);
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
    expect(state).toMatchObject({ shield: 0, status: 'gameover', endReason: 'shield' });
    expect(events.filter((e) => e.type === 'gameover')).toEqual([{ type: 'gameover', reason: 'shield' }]);
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
    const spawned: SpawnedWord = { text: 'nave', difficulty: 'easy', kind: 'normal', x: 0.3, speed: 0.07 };
    const source: WordSource = { wave: 1, update: (_dt, active) => (active === 0 ? spawned : null) };
    const { state, events } = setup([]);
    stepMatch(state, 1 / 60, source, events);
    stepMatch(state, 1 / 60, source, events);
    expect(state.words.map((w) => w.text)).toEqual(['nave']);
    expect(types(events)).toEqual(['spawn']);
  });

  it('announces wave changes from the source', () => {
    const source = { wave: 1, update: () => null };
    const state = createMatchState();
    const events: GameEvent[] = [];
    stepMatch(state, 1 / 60, source, events);
    source.wave = 2;
    stepMatch(state, 1 / 60, source, events);
    stepMatch(state, 1 / 60, source, events);
    expect(events).toEqual([
      { type: 'wave', wave: 1 },
      { type: 'wave', wave: 2 },
    ]);
    expect(state.wave).toBe(2);
  });
});

describe('modes', () => {
  it('Zen: words crossing the perimeter do no damage', () => {
    const { state, events } = setup([{ text: 'sol', y: 0.99 }, { text: 'lua', y: 0.99 }, { text: 'mar', y: 0.99 }], MODES.zen);
    stepMatch(state, 0.2, NO_SPAWNS, events);
    expect(state).toMatchObject({ shield: 3, status: 'playing' });
    expect(state.stats.breaches).toBe(3);
    expect(events.every((e) => e.type !== 'breach' || !e.damage)).toBe(true);
  });

  it('Time Attack: ends when the clock runs out', () => {
    const { state, events } = setup([], MODES.timeAttack);
    expect(timeLeft(state)).toBe(CONFIG.timeAttackSeconds);
    stepMatch(state, CONFIG.timeAttackSeconds - 1, NO_SPAWNS, events);
    expect(timeLeft(state)).toBeCloseTo(1);
    expect(state.status).toBe('playing');
    stepMatch(state, 2, NO_SPAWNS, events);
    expect(state).toMatchObject({ status: 'gameover', endReason: 'time', elapsed: CONFIG.timeAttackSeconds });
    expect(timeLeft(state)).toBe(0);
  });

  it('Survival has no clock', () => {
    expect(timeLeft(createMatchState())).toBeNull();
  });
});

describe('matchAccuracy', () => {
  it('is hits over all keys typed', () => {
    expect(matchAccuracy({ destroyed: 0, hits: 9, misses: 1, breaches: 0, empUses: 0, bosses: 0 })).toBeCloseTo(0.9);
  });

  it('is 0 when nothing was typed', () => {
    expect(matchAccuracy({ destroyed: 0, hits: 0, misses: 0, breaches: 0, empUses: 0, bosses: 0 })).toBe(0);
  });
});
