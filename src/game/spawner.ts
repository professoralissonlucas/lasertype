// Word generation (seedable).
//
// The *sequence* of words (text, x, speed) depends only on the seed and the spawner's own
// history, never on what the player does. Timing is separate (`update`), so two players with
// the same seed (Daily Challenge) always face the same words in the same order.
import { createRng, pickWeighted, type Rng } from '../utils/rng.ts';
import { DIFFICULTIES, type WordList } from '../words/types.ts';
import { stripAccents } from './input.ts';
import type { SpawnedWord, SpawnParams, WordSource } from './types.ts';

function initialOf(text: string): string {
  return stripAccents(text.slice(0, 1).toLowerCase());
}

function pushBounded<T>(list: T[], value: T, max: number): void {
  if (max <= 0) return;
  list.push(value);
  while (list.length > max) list.shift();
}

export class Spawner implements WordSource {
  private readonly rng: Rng;
  private readonly words: WordList;
  private readonly params: SpawnParams;
  private timer: number;
  private readonly recentTexts: string[] = [];
  private readonly recentInitials: string[] = [];
  private readonly recentX: number[] = [];

  constructor(seed: number | string, words: WordList, params: SpawnParams) {
    for (const tier of DIFFICULTIES) {
      if (params.tierWeights[tier] > 0 && words[tier].length === 0) {
        throw new Error(`Spawner: tier "${tier}" has weight but no words`);
      }
    }
    this.rng = createRng(seed);
    this.words = words;
    this.params = params;
    this.timer = params.firstDelay;
  }

  /** Advances the spawn timer; returns a word when it is time to spawn one. */
  update(dt: number, activeCount: number): SpawnedWord | null {
    this.timer -= dt;
    if (this.timer > 0) return null;
    if (activeCount >= this.params.maxActive) {
      // Hold until there is room, then spawn right away.
      this.timer = 0;
      return null;
    }
    // Restart the countdown (no backlog: a long stall never releases a burst of words).
    this.timer = this.params.interval;
    return this.next();
  }

  /** The next word of the deterministic sequence. */
  next(): SpawnedWord {
    const p = this.params;
    const difficulty = pickWeighted(this.rng, DIFFICULTIES, p.tierWeights);
    const text = this.pickText(this.words[difficulty]);
    const x = this.pickX();
    const speed = p.speed[difficulty] * (1 + this.rng.range(-p.speedJitter, p.speedJitter));

    pushBounded(this.recentTexts, text, p.textHistory);
    pushBounded(this.recentInitials, initialOf(text), p.initialHistory);
    pushBounded(this.recentX, x, p.xHistory);
    return { text, difficulty, x, speed };
  }

  /**
   * Preference: fresh word with a fresh first letter > fresh word > fresh first letter > anything.
   * (A fresh first letter keeps the "first key locks" rule unambiguous most of the time.)
   */
  private pickText(pool: readonly string[]): string {
    let freshText: string | null = null;
    let freshInitial: string | null = null;
    for (let i = 0; i < this.params.maxRerolls; i++) {
      const candidate = this.rng.pick(pool);
      const textOk = !this.recentTexts.includes(candidate);
      const initialOk = !this.recentInitials.includes(initialOf(candidate));
      if (textOk && initialOk) return candidate;
      if (textOk) freshText ??= candidate;
      else if (initialOk) freshInitial ??= candidate;
    }
    return freshText ?? freshInitial ?? this.rng.pick(pool);
  }

  /** Samples positions and keeps the first one far enough from recent spawns (or the farthest). */
  private pickX(): number {
    const p = this.params;
    let bestX = (p.xMin + p.xMax) / 2;
    let bestGap = -1;
    for (let i = 0; i < Math.max(1, p.xAttempts); i++) {
      const x = this.rng.range(p.xMin, p.xMax);
      let gap = Infinity;
      for (const other of this.recentX) gap = Math.min(gap, Math.abs(x - other));
      if (gap >= p.minXGap) return x;
      if (gap > bestGap) {
        bestGap = gap;
        bestX = x;
      }
    }
    return bestX;
  }
}
