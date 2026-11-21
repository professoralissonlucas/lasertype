// Match state and the rules that change it. No DOM/canvas access.
import { CONFIG } from '../config.ts';
import type { Word } from './entities/Word.ts';
import { resolveKey } from './targeting.ts';
import type { GameEvent, SpawnedWord, TypingOptions, WordSource } from './types.ts';

/** Normalized y of the perimeter line. A word whose y reaches it breaches the shield. */
export const PERIMETER_Y = 1;

export type MatchStatus = 'playing' | 'gameover';

export interface MatchStats {
  destroyed: number;
  /** Correct letters. */
  hits: number;
  /** Wrong letters (including keys that matched no word). */
  misses: number;
  breaches: number;
}

export interface MatchState {
  status: MatchStatus;
  /** Simulated seconds since the match started. */
  elapsed: number;
  words: Word[];
  lockedId: number | null;
  shield: number;
  readonly maxShield: number;
  nextWordId: number;
  readonly stats: MatchStats;
}

export function createMatchState(maxShield: number = CONFIG.shieldMaxHp): MatchState {
  return {
    status: 'playing',
    elapsed: 0,
    words: [],
    lockedId: null,
    shield: maxShield,
    maxShield,
    nextWordId: 1,
    stats: { destroyed: 0, hits: 0, misses: 0, breaches: 0 },
  };
}

export function lockedWord(state: Readonly<MatchState>): Word | null {
  if (state.lockedId === null) return null;
  return state.words.find((word) => word.id === state.lockedId) ?? null;
}

export function spawnWord(
  state: MatchState,
  spawned: SpawnedWord,
  events: GameEvent[],
  y: number = CONFIG.spawn.spawnY,
): Word {
  const word: Word = {
    id: state.nextWordId++,
    text: spawned.text,
    difficulty: spawned.difficulty,
    x: spawned.x,
    speed: spawned.speed,
    y,
    prevY: y,
    typed: 0,
  };
  state.words.push(word);
  events.push({ type: 'spawn', wordId: word.id });
  return word;
}

/** One fixed update: words fall, breaches hurt the shield, new words spawn. */
export function stepMatch(
  state: MatchState,
  dt: number,
  source: WordSource,
  events: GameEvent[],
): void {
  if (state.status !== 'playing') return;
  state.elapsed += dt;

  const words = state.words;
  for (let i = words.length - 1; i >= 0; i--) {
    const word = words[i];
    if (!word) continue;
    word.prevY = word.y;
    word.y += word.speed * dt;
    if (word.y >= PERIMETER_Y) {
      words.splice(i, 1);
      breach(state, word, events);
      if (state.status !== 'playing') return;
    }
  }

  const spawned = source.update(dt, words.length);
  if (spawned) spawnWord(state, spawned, events);
}

function breach(state: MatchState, word: Word, events: GameEvent[]): void {
  state.stats.breaches++;
  state.shield = Math.max(0, state.shield - 1);
  if (state.lockedId === word.id) state.lockedId = null;
  events.push({ type: 'breach', wordId: word.id, x: word.x, shield: state.shield });
  if (state.shield === 0) {
    state.status = 'gameover';
    state.lockedId = null;
    events.push({ type: 'gameover' });
  }
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
    events.push({ type: 'miss', wordId: outcome.word?.id ?? null });
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

  if (outcome.completed) {
    const index = state.words.indexOf(word);
    if (index >= 0) state.words.splice(index, 1);
    state.lockedId = null;
    state.stats.destroyed++;
    events.push({ type: 'destroy', wordId: word.id, text: word.text, x: word.x, y: word.y });
  }
}

/** Backspace: releases the lock and resets that word's progress. */
export function unlockTarget(state: MatchState, events: GameEvent[]): void {
  if (state.status !== 'playing') return;
  const word = lockedWord(state);
  state.lockedId = null;
  if (!word) return;
  word.typed = 0;
  events.push({ type: 'unlock', wordId: word.id });
}

/** Correct letters / all letters typed (0 when nothing was typed). */
export function matchAccuracy(stats: Readonly<MatchStats>): number {
  const total = stats.hits + stats.misses;
  return total === 0 ? 0 : stats.hits / total;
}
