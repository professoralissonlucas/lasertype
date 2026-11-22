// Word and wave generation (seedable).
//
// Content and timing are separate:
// - `next()` produces the deterministic sequence (text, kind, x, speed). Each wave has a
//   fixed word quota, so the N-th word always belongs to the same wave and the sequence
//   depends only on the seed — never on what the player does (Daily Challenge).
// - `update()` decides *when* to release the next word: spawn interval, screen limit,
//   and (in modes with wave breaks) waiting for a clear screen plus a short break. Every
//   few waves a boss comes in that clear screen, before the next wave (boss.ts).
import { createRng, pickWeighted, type Rng } from '../utils/rng.ts';
import { DIFFICULTIES, type BossPhrases, type WordList } from '../words/types.ts';
import { bossNumber, bossPhrase, bossSpeed } from './boss.ts';
import { stripAccents } from './input.ts';
import { pickWordKind } from './specials.ts';
import type {
  BossConfig,
  SpawnedBoss,
  SpawnedWord,
  SpawnParams,
  SpecialConfig,
  WaveConfig,
  WaveParams,
  WordSource,
} from './types.ts';
import { waveParams } from './waves.ts';

export interface BossSource {
  readonly config: BossConfig;
  readonly phrases: BossPhrases;
  /** Fall speed multiplier of the difficulty preset. */
  readonly difficultySpeed: number;
}

export interface SpawnerConfig {
  readonly spawn: SpawnParams;
  readonly waves: WaveConfig;
  readonly specials: SpecialConfig;
  /** Survival/Zen: after a wave's last word, wait for a clear screen and a break. */
  readonly waveBreak: boolean;
  /** Without it there are no bosses. They also need `waveBreak` (they fight on a clear screen). */
  readonly boss?: BossSource;
}

type Phase = 'spawning' | 'waitingForClear' | 'break';

function initialOf(text: string): string {
  return stripAccents(text.slice(0, 1).toLowerCase());
}

function pushBounded<T>(list: T[], value: T, max: number): void {
  if (max <= 0) return;
  list.push(value);
  while (list.length > max) list.shift();
}

export class Spawner implements WordSource {
  private readonly seed: number | string;
  private readonly rng: Rng;
  private readonly words: WordList;
  private readonly config: SpawnerConfig;
  private readonly recentTexts: string[] = [];
  private readonly recentInitials: string[] = [];
  private readonly recentX: number[] = [];

  /** Wave announced to the player (drives timing). */
  private currentWave = 1;
  private currentParams: WaveParams;
  /** Wave the next generated word belongs to (drives content). */
  private contentWave = 1;
  private contentParams: WaveParams;
  private spawnedInWave = 0;

  private phase: Phase = 'spawning';
  private timer: number;
  /** Last wave whose boss was released. */
  private bossWave = 0;

  constructor(seed: number | string, words: WordList, config: SpawnerConfig) {
    for (const tier of DIFFICULTIES) {
      if (words[tier].length === 0) throw new Error(`Spawner: tier "${tier}" has no words`);
    }
    this.seed = seed;
    this.rng = createRng(seed);
    this.words = words;
    this.config = config;
    this.currentParams = waveParams(1, config.spawn, config.waves);
    this.contentParams = this.currentParams;
    this.timer = config.spawn.firstDelay;
  }

  get wave(): number {
    return this.currentWave;
  }

  /** Advances the timers; returns a word (or a boss) when it is time to release one. */
  update(dt: number, activeCount: number): SpawnedWord | SpawnedBoss | null {
    if (this.phase === 'waitingForClear') {
      if (activeCount > 0) return null;
      const boss = this.takeBoss();
      if (boss) return boss; // and wait for it to be gone
      // Screen clear: announce the next wave now and give the player a breather.
      this.enterWave(this.contentWave);
      this.phase = 'break';
      this.timer = this.config.waves.breakSeconds;
      return null;
    }

    this.timer -= dt;
    if (this.timer > 0) return null;
    if (this.phase === 'break') this.phase = 'spawning';
    if (activeCount >= this.currentParams.maxActive) {
      // Hold until there is room, then spawn right away.
      this.timer = 0;
      return null;
    }

    const word = this.next();
    // Restart the countdown (no backlog: a long stall never releases a burst of words).
    this.timer = this.currentParams.interval;
    if (this.contentWave !== this.currentWave) {
      // That was the wave's last word.
      if (this.config.waveBreak) this.phase = 'waitingForClear';
      else this.enterWave(this.contentWave);
    }
    return word;
  }

  /** The next word of the deterministic sequence. */
  next(): SpawnedWord {
    const { spawn, specials } = this.config;
    const params = this.contentParams;

    const difficulty = pickWeighted(this.rng, DIFFICULTIES, params.tierWeights);
    const text = this.pickText(this.words[difficulty]);
    const x = this.pickX();
    const jitter = 1 + this.rng.range(-spawn.speedJitter, spawn.speedJitter);
    const speed = spawn.speed[difficulty] * jitter * params.speedMultiplier;
    const kind = pickWordKind(this.rng, params.specialChance, specials.weights);

    pushBounded(this.recentTexts, text, spawn.textHistory);
    pushBounded(this.recentInitials, initialOf(text), spawn.initialHistory);
    pushBounded(this.recentX, x, spawn.xHistory);

    this.spawnedInWave++;
    if (this.spawnedInWave >= params.wordCount) {
      this.spawnedInWave = 0;
      this.contentWave++;
      this.contentParams = waveParams(this.contentWave, spawn, this.config.waves);
    }
    return { text, difficulty, kind, x, speed };
  }

  /** The boss that closes the current wave, once; null when it has none (or it was released). */
  private takeBoss(): SpawnedBoss | null {
    const { boss, spawn, waves } = this.config;
    const wave = this.currentWave;
    if (!boss || this.bossWave === wave) return null;
    const number = bossNumber(wave, boss.config);
    if (number === 0) return null;
    this.bossWave = wave;
    return {
      kind: 'boss',
      number,
      phrase: bossPhrase(this.seed, number, boss.phrases),
      speed: bossSpeed(wave, boss.difficultySpeed, boss.config, spawn, waves),
    };
  }

  private enterWave(wave: number): void {
    this.currentWave = wave;
    this.currentParams = waveParams(wave, this.config.spawn, this.config.waves);
  }

  /**
   * Preference: fresh word with a fresh first letter > fresh word > fresh first letter > anything.
   * (A fresh first letter keeps the "first key locks" rule unambiguous most of the time.)
   */
  private pickText(pool: readonly string[]): string {
    let freshText: string | null = null;
    let freshInitial: string | null = null;
    for (let i = 0; i < this.config.spawn.maxRerolls; i++) {
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
    const p = this.config.spawn;
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
