import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { MODES } from '../modes/index.ts';
import type { ModeRules } from '../modes/types.ts';
import { getBossPhrases } from '../words/index.ts';
import { bossBonus, bossNumber, bossPhrase, bossSpeed, bossTier, createBoss } from './boss.ts';
import { bossHealth, type Boss } from './entities/Boss.ts';
import { areaKillPoints, wordPoints } from './scoring.ts';
import {
  activateEmp,
  createMatchState,
  spawnBoss,
  spawnWord,
  stepMatch,
  togglePause,
  typeChar,
  unlockTarget,
  type MatchState,
} from './state.ts';
import type { GameEvent, SpawnedBoss, WordSource } from './types.ts';
import { waveParams } from './waves.ts';

const { alertSeconds, damage, restSeconds, firstBonus, bonusStep, maxBonus, everyWaves, fallSeconds } = CONFIG.boss;
const DT = 1 / CONFIG.updatesPerSecond;
const LOOSE = { requireAccents: false };
const STRICT = { requireAccents: true };
const SPEED = 0.05;

describe('boss rules', () => {
  it('closes every 5th wave', () => {
    expect(everyWaves).toBe(5);
    expect([0, 1, 4, 5, 6, 9, 10, 15].map((wave) => bossNumber(wave))).toEqual([0, 0, 0, 1, 0, 0, 2, 3]);
  });

  it('phrases grow: small, medium, then large for good', () => {
    expect([1, 2, 3, 4, 20].map(bossTier)).toEqual(['small', 'medium', 'large', 'large', 'large']);
  });

  it('the N-th boss of a seed is always the same, from the right tier', () => {
    const phrases = getBossPhrases('pt-BR');
    for (const number of [1, 2, 3, 7]) {
      const phrase = bossPhrase('daily:2026-11-22', number, phrases);
      expect(bossPhrase('daily:2026-11-22', number, phrases)).toBe(phrase);
      expect(phrases[bossTier(number)]).toContain(phrase);
    }
    expect(bossPhrase(123, 1, phrases)).toBe(bossPhrase(123, 1, phrases));
  });

  it('seeds differ, and a match never repeats a phrase until they run out', () => {
    const phrases = getBossPhrases('en');
    const firsts = new Set(Array.from({ length: 40 }, (_, i) => bossPhrase(`s${i}`, 1, phrases)));
    expect(firsts.size).toBeGreaterThan(4);
    const large = Array.from({ length: phrases.large.length }, (_, i) => bossPhrase('s', 3 + i, phrases));
    expect(new Set(large).size).toBe(phrases.large.length);
    expect(bossPhrase('s', 3 + phrases.large.length, phrases)).toBe(large[0]);
  });

  it('comes down slowly: the whole field in 30 s on Normal, scaled like the words', () => {
    expect(fallSeconds).toBe(30);
    expect(1 / bossSpeed(1, 1)).toBeCloseTo(fallSeconds);
    for (const wave of [5, 10, 15, 40]) {
      expect(bossSpeed(wave, 1)).toBeCloseTo(waveParams(wave).speedMultiplier / fallSeconds);
      expect(bossSpeed(wave, 0.8)).toBeCloseTo(bossSpeed(wave, 1) * 0.8);
      // Clearly slower than any word of that wave.
      const slowestWord = Math.min(...Object.values(CONFIG.spawn.speed)) * waveParams(wave).speedMultiplier;
      expect(bossSpeed(wave, 1)).toBeLessThan(slowestWord * 0.7);
    }
  });

  it('bonus: 1000, +500 per later boss, up to 2500', () => {
    expect([1, 2, 3, 4, 5, 50].map((n) => bossBonus(n))).toEqual([1000, 1500, 2000, 2500, 2500, 2500]);
    expect([firstBonus, bonusStep, maxBonus]).toEqual([1000, 500, 2500]);
  });

  it('starts above the field with every word whole', () => {
    const boss = createBoss({ kind: 'boss', number: 2, phrase: 'sol mar lua', speed: SPEED });
    expect(boss).toMatchObject({ number: 2, words: ['sol', 'mar', 'lua'], y: 0, alert: alertSeconds, index: 0, typed: 0 });
    expect(bossHealth(boss)).toBe(3);
  });
});

// ---------- Fight ----------

const IDLE: WordSource = { wave: 5, update: () => null };

interface Fight {
  readonly state: MatchState;
  readonly boss: Boss;
  readonly events: GameEvent[];
}

function fight(options: { phrase?: string; mode?: ModeRules; alert?: boolean; y?: number; number?: number } = {}): Fight {
  const state = createMatchState({ mode: options.mode ?? MODES.survival });
  state.wave = 5;
  const events: GameEvent[] = [];
  const spawned: SpawnedBoss = { kind: 'boss', number: options.number ?? 1, phrase: options.phrase ?? 'sol mar lua', speed: SPEED };
  const boss = spawnBoss(state, spawned, events);
  if (!options.alert) boss.alert = 0;
  if (options.y !== undefined) boss.y = options.y;
  events.length = 0;
  return { state, boss, events };
}

function step(f: Fight, seconds: number, source: WordSource = IDLE): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) stepMatch(f.state, DT, source, f.events);
}

function type(f: Fight, text: string, options = LOOSE): void {
  for (const char of text) typeChar(f.state, char, options, f.events);
}

const types = (f: Fight) => f.events.map((event) => event.type);
const last = <T extends GameEvent['type']>(f: Fight, kind: T) =>
  f.events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === kind).at(-1);

describe('boss entrance', () => {
  it('announces itself, waits 3 s without descending, then comes down', () => {
    const state = createMatchState();
    const events: GameEvent[] = [];
    let sent = false;
    const source: WordSource = {
      wave: 5,
      update: () => {
        if (sent) return null;
        sent = true;
        return { kind: 'boss', number: 1, phrase: 'sol mar', speed: SPEED };
      },
    };
    stepMatch(state, DT, source, events);
    expect(events.map((e) => e.type)).toContain('bossAlert');
    const f: Fight = { state, boss: state.boss as Boss, events };
    step(f, alertSeconds - 0.1, source);
    expect(f.boss.y).toBe(0);
    expect(types(f)).not.toContain('bossEnter');
    step(f, 0.2, source);
    expect(types(f)).toContain('bossEnter');
    step(f, 1, source);
    expect(f.boss.y).toBeGreaterThan(SPEED * 0.9);
    expect(f.boss.y).toBeLessThan(SPEED * 1.2);
  });

  it('ignores keys during the alert: neither hits nor errors', () => {
    const f = fight({ alert: true });
    f.state.combo = { combo: 7, maxCombo: 7, charge: 0 };
    type(f, 'solx');
    expect(f.events).toEqual([]);
    expect(f.state.stats).toMatchObject({ hits: 0, misses: 0 });
    expect(f.state.combo.combo).toBe(7);
    expect(f.boss.typed).toBe(0);
  });

  it('keeps the EMP charge during the alert', () => {
    const f = fight({ alert: true });
    f.state.combo = { combo: 0, maxCombo: 0, charge: 1 };
    expect(activateEmp(f.state, f.events)).toBe(false);
    expect(types(f)).toEqual(['empDenied']);
    expect(f.state.combo.charge).toBe(1);
  });

  it('is frozen while paused', () => {
    const f = fight();
    togglePause(f.state, f.events);
    step(f, 2);
    type(f, 's');
    expect(f.boss).toMatchObject({ y: 0, typed: 0 });
  });
});

describe('typing a boss', () => {
  it('takes the words in order, without spaces', () => {
    const f = fight();
    type(f, 'solmar');
    expect(f.boss).toMatchObject({ index: 2, typed: 0 });
    expect(bossHealth(f.boss)).toBe(1);
    const hits = f.events.filter((e) => e.type === 'bossHit');
    expect(hits.map((e) => [e.word, e.index])).toEqual([[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]]);
    expect(f.state.stats).toMatchObject({ hits: 6, misses: 0, destroyed: 2, bosses: 0 });
  });

  it('a later word cannot be started first', () => {
    const f = fight();
    type(f, 'm');
    expect(last(f, 'miss')).toBeDefined();
    expect(f.boss).toMatchObject({ index: 0, typed: 0 });
  });

  it('each word scores like a falling one: combo, height and EMP charge', () => {
    const f = fight({ y: 0.2 });
    f.state.combo = { combo: 4, maxCombo: 4, charge: 0 };
    type(f, 'sol');
    expect(last(f, 'bossWord')).toMatchObject({ word: 0, text: 'sol', cause: 'typed', multiplier: 2, points: wordPoints(3, 2, 0.2) });
    expect(f.state.score).toBe(wordPoints(3, 2, 0.2));
    expect(f.state.combo.combo).toBe(5);
    expect(f.state.combo.charge).toBeCloseTo(CONFIG.combo.chargePerWord * 2);
    expect(types(f)).toContain('multiplier');
  });

  it('a wrong letter breaks the combo, keeps the word and takes its combo away', () => {
    const f = fight();
    f.state.combo = { combo: 9, maxCombo: 9, charge: 0 };
    type(f, 'sx');
    expect(last(f, 'miss')).toMatchObject({ wordId: null, comboLost: 9 });
    expect(f.boss).toMatchObject({ index: 0, typed: 1, flawed: true });
    type(f, 'ol');
    expect(f.state.combo.combo).toBe(0); // flawed word
    type(f, 'mar');
    expect(f.state.combo.combo).toBe(1); // the next one is clean
  });

  it('accents follow the player’s option', () => {
    const loose = fight({ phrase: 'estação' });
    type(loose, 'estacao');
    expect(loose.state.stats.bosses).toBe(1);
    const strict = fight({ phrase: 'estação' });
    type(strict, 'estac', STRICT);
    expect(strict.state.stats.misses).toBe(1);
  });

  it('Backspace starts the current word over (words already broken stay broken)', () => {
    const f = fight();
    type(f, 'solma');
    unlockTarget(f.state, f.events);
    expect(f.boss).toMatchObject({ index: 1, typed: 0 });
    expect(types(f).at(-1)).toBe('unlock');
    f.events.length = 0;
    unlockTarget(f.state, f.events);
    expect(f.events).toEqual([]); // nothing to undo
  });

  it('the last word defeats it: bonus, counter, and a short calm', () => {
    const f = fight({ number: 2, y: 0.8 });
    type(f, 'solmarlua');
    const words = [0, 1, 2].reduce((sum) => sum + wordPoints(3, 1, 0.8), 0);
    expect(f.state.score).toBe(words + bossBonus(2));
    expect(last(f, 'bossDefeated')).toMatchObject({ points: bossBonus(2) });
    expect(f.state.boss).toBeNull();
    expect(f.state.stats).toMatchObject({ bosses: 1, destroyed: 3, breaches: 0 });
    expect(f.state.bossRest).toBe(restSeconds);
    expect(f.state.shield).toBe(3);
  });
});

describe('EMP on a boss', () => {
  it('destroys only the current word, for half the points', () => {
    const f = fight({ y: 0.9 });
    type(f, 'so');
    f.state.combo = { combo: 0, maxCombo: 0, charge: 1 };
    expect(activateEmp(f.state, f.events)).toBe(true);
    expect(last(f, 'bossWord')).toMatchObject({ text: 'sol', cause: 'emp', points: areaKillPoints(3, 1, 0.9) });
    expect(last(f, 'emp')).toMatchObject({ count: 1 });
    expect(f.boss).toMatchObject({ index: 1, typed: 0 });
    expect(f.state.combo.charge).toBe(0);
  });

  it('can finish it', () => {
    const f = fight({ phrase: 'sol' });
    f.state.combo = { combo: 0, maxCombo: 0, charge: 1 };
    activateEmp(f.state, f.events);
    expect(last(f, 'bossDefeated')).toBeDefined();
    expect(f.state.boss).toBeNull();
  });
});

describe('boss at the perimeter', () => {
  it('costs 2 HP and leaves; the combo stays', () => {
    const f = fight({ y: 0.999 });
    f.state.combo = { combo: 6, maxCombo: 6, charge: 0.3 };
    step(f, 0.2);
    expect(last(f, 'bossBreach')).toMatchObject({ shield: 1, lost: damage });
    expect(damage).toBe(2);
    expect(f.state).toMatchObject({ shield: 1, boss: null, status: 'playing', bossRest: expect.any(Number) });
    expect(f.state.combo.combo).toBe(6);
    expect(f.state.stats).toMatchObject({ breaches: 1, bosses: 0 });
  });

  it.each([1, 2])('with %i HP left it ends the match', (shield) => {
    const f = fight({ y: 0.999 });
    f.state.shield = shield;
    step(f, 0.2);
    expect(f.state).toMatchObject({ shield: 0, status: 'gameover', endReason: 'shield' });
    expect(last(f, 'bossBreach')).toMatchObject({ shield: 0, lost: shield });
    expect(types(f).at(-1)).toBe('gameover');
  });

  it('does no damage in Zen', () => {
    const f = fight({ y: 0.999, mode: MODES.zen });
    step(f, 0.2);
    expect(last(f, 'bossBreach')).toMatchObject({ shield: 3, lost: 0 });
    expect(f.state).toMatchObject({ shield: 3, status: 'playing', boss: null });
  });

  it('ice slows it down like the words', () => {
    const normal = fight();
    const iced = fight();
    iced.state.slowTimer = 10;
    step(normal, 1);
    step(iced, 1);
    expect(iced.boss.y / normal.boss.y).toBeCloseTo(CONFIG.specials.slowFactor, 2);
  });
});

describe('boss and the words', () => {
  it('holds the next wave while it is here and during the calm after it', () => {
    const f = fight({ phrase: 'sol' });
    const seen: number[] = [];
    const source: WordSource = { wave: 5, update: (_, active) => (seen.push(active), null) };
    step(f, 0.1, source);
    expect(new Set(seen)).toEqual(new Set([1]));
    type(f, 'sol');
    seen.length = 0;
    step(f, restSeconds - 0.1, source);
    expect(new Set(seen)).toEqual(new Set([1]));
    step(f, 0.3, source);
    expect(seen.at(-1)).toBe(0);
  });

  it('a boss clears the lock and takes every key', () => {
    const state = createMatchState();
    const events: GameEvent[] = [];
    spawnWord(state, { text: 'casa', difficulty: 'easy', kind: 'normal', x: 0.5, speed: 0.1 }, events, 0.5);
    typeChar(state, 'c', LOOSE, events);
    const boss = spawnBoss(state, { kind: 'boss', number: 1, phrase: 'abc', speed: SPEED }, events);
    boss.alert = 0;
    expect(state.lockedId).toBeNull();
    typeChar(state, 'a', LOOSE, events);
    expect(boss.typed).toBe(1);
  });
});
