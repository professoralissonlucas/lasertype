// Match state and the rules that change it. No DOM/canvas access.
import { CONFIG } from '../config.ts';
import { MODES } from '../modes/index.ts';
import type { ModeRules } from '../modes/types.ts';
import { INITIAL_COMBO, isEmpReady, updateCombo, type ComboState } from './combo.ts';
import { lettersOf, type Word } from './entities/Word.ts';
import { accuracyOf, areaKillPoints, comboMultiplier, wordPoints } from './scoring.ts';
import { findNeighbors } from './specials.ts';
import { resolveKey } from './targeting.ts';
import type {
  DestroyCause,
  EndReason,
  GameDifficulty,
  GameEvent,
  SpawnedWord,
  TypingOptions,
  WordSource,
} from './types.ts';

/** Normalized y of the perimeter line. A word whose y reaches it breaches the shield. */
export const PERIMETER_Y = 1;

export type MatchStatus = 'playing' | 'paused' | 'gameover';

export interface MatchStats {
  /** Words destroyed by any means (typing, bomb, EMP). */
  destroyed: number;
  /** Correct letters. */
  hits: number;
  /** Wrong letters (including keys that matched no word). */
  misses: number;
  /** Words that crossed the perimeter. */
  breaches: number;
  empUses: number;
}

export interface MatchState {
  status: MatchStatus;
  readonly mode: ModeRules;
  /** Menu difficulty the match was started with (the spawner applies it; kept for reports). */
  readonly difficulty: GameDifficulty;
  /** Simulated seconds since the match started (paused time excluded). */
  elapsed: number;
  words: Word[];
  lockedId: number | null;
  shield: number;
  readonly maxShield: number;
  nextWordId: number;
  score: number;
  combo: ComboState;
  /** Current wave (0 until the first update announces wave 1). */
  wave: number;
  /** Seconds of ice slow left. */
  slowTimer: number;
  endReason: EndReason | null;
  readonly stats: MatchStats;
}

export interface MatchOptions {
  readonly mode?: ModeRules;
  readonly difficulty?: GameDifficulty;
  readonly maxShield?: number;
}

export function createMatchState(options: MatchOptions = {}): MatchState {
  const maxShield = options.maxShield ?? CONFIG.shieldMaxHp;
  return {
    status: 'playing',
    mode: options.mode ?? MODES.survival,
    difficulty: options.difficulty ?? 'normal',
    elapsed: 0,
    words: [],
    lockedId: null,
    shield: maxShield,
    maxShield,
    nextWordId: 1,
    score: 0,
    combo: INITIAL_COMBO,
    wave: 0,
    slowTimer: 0,
    endReason: null,
    stats: { destroyed: 0, hits: 0, misses: 0, breaches: 0, empUses: 0 },
  };
}

export function lockedWord(state: Readonly<MatchState>): Word | null {
  if (state.lockedId === null) return null;
  return state.words.find((word) => word.id === state.lockedId) ?? null;
}

/** Seconds left in timed modes, null otherwise. */
export function timeLeft(state: Readonly<MatchState>): number | null {
  const limit = state.mode.timeLimit;
  return limit === null ? null : Math.max(0, limit - state.elapsed);
}

export function spawnWord(
  state: MatchState,
  spawned: SpawnedWord,
  events: GameEvent[],
  y: number = CONFIG.spawn.spawnY,
): Word {
  const layers = spawned.kind === 'armored' ? 1 + CONFIG.specials.armorLayers : 1;
  const word: Word = {
    id: state.nextWordId++,
    text: spawned.text,
    difficulty: spawned.difficulty,
    kind: spawned.kind,
    x: spawned.x,
    speed: spawned.speed,
    y,
    prevY: y,
    typed: 0,
    layers,
    armor: layers - 1,
    flawed: false,
  };
  state.words.push(word);
  events.push({ type: 'spawn', wordId: word.id });
  return word;
}

/** One fixed update: time limit, words fall (slowed by ice), breaches, spawns, waves. */
export function stepMatch(
  state: MatchState,
  dt: number,
  source: WordSource,
  events: GameEvent[],
): void {
  if (state.status !== 'playing') return;
  state.elapsed += dt;

  const limit = state.mode.timeLimit;
  if (limit !== null && state.elapsed >= limit) {
    state.elapsed = limit;
    endMatch(state, 'time', events);
    return;
  }

  // Ice slows the whole battlefield (falling words and the spawn rhythm), not the clock.
  let worldDt = dt;
  if (state.slowTimer > 0) {
    worldDt = dt * CONFIG.specials.slowFactor;
    state.slowTimer = Math.max(0, state.slowTimer - dt);
  }

  const words = state.words;
  for (let i = words.length - 1; i >= 0; i--) {
    const word = words[i];
    if (!word) continue;
    word.prevY = word.y;
    word.y += word.speed * worldDt;
    if (word.y >= PERIMETER_Y) {
      words.splice(i, 1);
      breach(state, word, events);
      if (state.status !== 'playing') return;
    }
  }

  const spawned = source.update(worldDt, words.length);
  if (spawned) spawnWord(state, spawned, events);

  if (source.wave !== state.wave) {
    state.wave = source.wave;
    events.push({ type: 'wave', wave: state.wave });
  }
}

function breach(state: MatchState, word: Word, events: GameEvent[]): void {
  const damage = state.mode.damage;
  state.stats.breaches++;
  if (damage) state.shield = Math.max(0, state.shield - 1);
  if (state.lockedId === word.id) state.lockedId = null;
  events.push({ type: 'breach', wordId: word.id, text: word.text, x: word.x, shield: state.shield, damage });
  if (damage && state.shield === 0) endMatch(state, 'shield', events);
}

/** Applies one typed character (already mapped from the keyboard). */
export function typeChar(
  state: MatchState,
  char: string,
  options: TypingOptions,
  events: GameEvent[],
): void {
  if (state.status !== 'playing') return;

  const outcome = resolveKey(state.words, state.lockedId, char, options);
  if (outcome.kind === 'miss') {
    state.stats.misses++;
    if (outcome.word) outcome.word.flawed = true;
    const comboLost = state.combo.combo;
    state.combo = updateCombo(state.combo, { type: 'miss' });
    events.push({ type: 'miss', wordId: outcome.word?.id ?? null, comboLost });
    return;
  }

  const word = outcome.word;
  state.stats.hits++;
  if (outcome.newLock) {
    state.lockedId = word.id;
    events.push({ type: 'lock', wordId: word.id });
  }
  word.typed = outcome.index + 1;
  events.push({
    type: 'hit',
    wordId: word.id,
    index: outcome.index,
    length: word.text.length,
    x: word.x,
    y: word.y,
  });
  if (!outcome.completed) return;

  if (word.armor > 0) {
    // Armor plate broken: the same word must be typed again (it stays locked).
    word.armor--;
    word.typed = 0;
    events.push({
      type: 'armorBreak',
      wordId: word.id,
      length: word.text.length,
      x: word.x,
      y: word.y,
      armorLeft: word.armor,
    });
    return;
  }
  destroyByTyping(state, word, events);
}

function removeWord(state: MatchState, word: Word): void {
  const index = state.words.indexOf(word);
  if (index >= 0) state.words.splice(index, 1);
  if (state.lockedId === word.id) state.lockedId = null;
  state.stats.destroyed++;
}

function destroyByTyping(state: MatchState, word: Word, events: GameEvent[]): void {
  removeWord(state, word);

  const multiplierBefore = comboMultiplier(state.combo.combo);
  const wasReady = isEmpReady(state.combo.charge);
  state.combo = updateCombo(state.combo, { type: 'kill', flawed: word.flawed });
  // The word that reaches a new tier already scores with it.
  const multiplier = comboMultiplier(state.combo.combo);
  const points = wordPoints(lettersOf(word), multiplier, word.y);
  state.score += points;

  events.push({
    type: 'destroy',
    wordId: word.id,
    text: word.text,
    kind: word.kind,
    x: word.x,
    y: word.y,
    points,
    multiplier,
    cause: 'typed',
  });
  if (multiplier > multiplierBefore) events.push({ type: 'multiplier', multiplier });
  if (!wasReady && isEmpReady(state.combo.charge)) events.push({ type: 'empReady' });

  applySpecial(state, word, multiplier, events);
}

/** Special effects trigger only for words destroyed by typing (no chain reactions). */
function applySpecial(state: MatchState, word: Word, multiplier: number, events: GameEvent[]): void {
  const specials = CONFIG.specials;
  switch (word.kind) {
    case 'bomb': {
      events.push({ type: 'bomb', x: word.x, y: word.y });
      const neighbors = findNeighbors(state.words, word, specials.bombRadiusX, specials.bombRadiusY);
      for (const neighbor of neighbors) areaKill(state, neighbor, multiplier, 'bomb', events);
      break;
    }
    case 'ice':
      state.slowTimer = specials.slowSeconds;
      events.push({ type: 'slow', seconds: specials.slowSeconds });
      break;
    case 'shield': {
      const before = state.shield;
      state.shield = Math.min(state.maxShield, state.shield + 1);
      events.push({ type: 'shieldUp', shield: state.shield, gained: state.shield - before });
      break;
    }
    case 'armored':
    case 'normal':
      break;
  }
}

/** A word destroyed by a bomb or the EMP: half points, no combo, no special effect. */
function areaKill(
  state: MatchState,
  word: Word,
  multiplier: number,
  cause: Exclude<DestroyCause, 'typed'>,
  events: GameEvent[],
): void {
  removeWord(state, word);
  const points = areaKillPoints(lettersOf(word), multiplier, word.y);
  state.score += points;
  events.push({
    type: 'destroy',
    wordId: word.id,
    text: word.text,
    kind: word.kind,
    x: word.x,
    y: word.y,
    points,
    multiplier,
    cause,
  });
}

/** Space: with a full charge, destroys every word on screen (half points each). */
export function activateEmp(state: MatchState, events: GameEvent[]): boolean {
  if (state.status !== 'playing') return false;
  if (!isEmpReady(state.combo.charge)) {
    events.push({ type: 'empDenied' });
    return false;
  }
  const multiplier = comboMultiplier(state.combo.combo);
  state.combo = updateCombo(state.combo, { type: 'emp' });
  state.stats.empUses++;
  events.push({ type: 'emp', count: state.words.length });
  for (let i = state.words.length - 1; i >= 0; i--) {
    const word = state.words[i];
    if (word) areaKill(state, word, multiplier, 'emp', events);
  }
  state.lockedId = null;
  return true;
}

/** Backspace: releases the lock and resets that word's progress (armor already broken stays broken). */
export function unlockTarget(state: MatchState, events: GameEvent[]): void {
  if (state.status !== 'playing') return;
  const word = lockedWord(state);
  state.lockedId = null;
  if (!word) return;
  word.typed = 0;
  events.push({ type: 'unlock', wordId: word.id });
}

/** Esc: pause ↔ resume. Does nothing after the match ended. */
export function togglePause(state: MatchState, events: GameEvent[]): void {
  if (state.status === 'playing') {
    state.status = 'paused';
    events.push({ type: 'pause' });
  } else if (state.status === 'paused') {
    state.status = 'playing';
    events.push({ type: 'resume' });
  }
}

export function endMatch(state: MatchState, reason: EndReason, events: GameEvent[]): void {
  if (state.status === 'gameover') return;
  state.status = 'gameover';
  state.endReason = reason;
  state.lockedId = null;
  events.push({ type: 'gameover', reason });
}

/** Correct letters / all letters typed (0 when nothing was typed). */
export function matchAccuracy(stats: Readonly<MatchStats>): number {
  return accuracyOf(stats.hits, stats.misses);
}
