import type { Difficulty } from '../words/types.ts';
import type { Boss } from './entities/Boss.ts';

/** How typed characters are compared against word letters. */
export interface TypingOptions {
  /** When false (default), `ação` accepts `acao`. */
  readonly requireAccents: boolean;
}

// ---------- Word kinds ----------

export const SPECIAL_KINDS = ['bomb', 'ice', 'shield', 'armored'] as const;
/**
 * - bomb: destroys nearby words when typed
 * - ice: slows everything for a few seconds
 * - shield: +1 shield HP (up to the maximum)
 * - armored: must be typed twice
 */
export type SpecialKind = (typeof SPECIAL_KINDS)[number];
export type WordKind = 'normal' | SpecialKind;

// ---------- Tuning (values live in config.ts) ----------

/** Spawner tuning for wave 1. See `CONFIG.spawn` for the coordinate system. */
export interface SpawnParams {
  /** Seconds before the first word. */
  readonly firstDelay: number;
  /** Seconds between spawns (wave 1). */
  readonly interval: number;
  /** Spawning pauses while this many words are on screen (wave 1). */
  readonly maxActive: number;
  /** Normalized y where new words appear. */
  readonly spawnY: number;
  /** Difficulty mix of wave 1 (must add up to 1). */
  readonly tierWeights: Readonly<Record<Difficulty, number>>;
  /** Base fall speed per tier, in field heights per second. */
  readonly speed: Readonly<Record<Difficulty, number>>;
  /** Speed varies by ±this fraction. */
  readonly speedJitter: number;
  readonly xMin: number;
  readonly xMax: number;
  /** Preferred minimum horizontal distance from the last `xHistory` spawns. */
  readonly minXGap: number;
  readonly xAttempts: number;
  readonly xHistory: number;
  /** New words avoid the first letter of the last N spawned words, when possible. */
  readonly initialHistory: number;
  /** New words never repeat any of the last N spawned words, when possible. */
  readonly textHistory: number;
  readonly maxRerolls: number;
}

/** How each wave gets harder than the previous one. */
export interface WaveConfig {
  /** Words in wave 1, added per wave, and the cap. */
  readonly firstWordCount: number;
  readonly wordCountStep: number;
  readonly maxWordCount: number;
  /** Spawn interval is multiplied by this each wave, down to `minInterval`. */
  readonly intervalDecay: number;
  readonly minInterval: number;
  /** Fall speed multiplier grows by this each wave, up to the max. */
  readonly speedStep: number;
  readonly maxSpeedMultiplier: number;
  /** Difficulty mix shift per wave: fewer easy words, more hard ones. */
  readonly easyStep: number;
  readonly minEasy: number;
  readonly hardStep: number;
  readonly maxHard: number;
  /** Chance that a word is special, per wave. */
  readonly specialChanceBase: number;
  readonly specialChanceStep: number;
  readonly maxSpecialChance: number;
  /** Extra simultaneous words allowed per wave, and the cap. */
  readonly maxActiveStep: number;
  readonly maxActiveCap: number;
  /** Pause between waves (modes with wave breaks), after the screen is clear. */
  readonly breakSeconds: number;
}

/** Resolved numbers for one wave (see `waves.ts`). */
export interface WaveParams {
  readonly wave: number;
  readonly wordCount: number;
  readonly interval: number;
  readonly speedMultiplier: number;
  readonly tierWeights: Readonly<Record<Difficulty, number>>;
  readonly specialChance: number;
  readonly maxActive: number;
}

export interface SpecialConfig {
  /** Relative frequency of each special kind. */
  readonly weights: Readonly<Record<SpecialKind, number>>;
  /** Bomb blast: an ellipse in normalized field units (x: field widths, y: field heights). */
  readonly bombRadiusX: number;
  readonly bombRadiusY: number;
  /** Ice: everything moves at `slowFactor` speed for `slowSeconds`. */
  readonly slowSeconds: number;
  readonly slowFactor: number;
  /** Armored: extra times the word must be typed. */
  readonly armorLayers: number;
}

/** The boss that closes every few waves (game/boss.ts). */
export interface BossConfig {
  /** Waves 5, 10, 15… end with a boss (modes with wave breaks only). */
  readonly everyWaves: number;
  /** Entrance alert: it neither descends nor can be typed yet. */
  readonly alertSeconds: number;
  /** Time to come down the whole field on Normal, at wave-1 speed. */
  readonly fallSeconds: number;
  /** Shield HP lost when it reaches the perimeter. */
  readonly damage: number;
  /** Calm after it is gone, before the next wave is announced. */
  readonly restSeconds: number;
  /** Points for defeating the first boss, added per later boss, and the cap. */
  readonly firstBonus: number;
  readonly bonusStep: number;
  readonly maxBonus: number;
}

/** The typing speed that counts only the time spent typing (game/burst.ts). */
export interface BurstConfig {
  /** Words typed in a row that make a burst. */
  readonly words: number;
  /** Shorter words are left out. */
  readonly minLetters: number;
  readonly maxWpm: number;
}

export interface ComboTier {
  /** Combo needed for this tier. */
  readonly min: number;
  readonly multiplier: number;
}

export interface ComboConfig {
  /** Sorted by `min`, ascending; the first tier must start at 0. */
  readonly tiers: readonly ComboTier[];
  /** EMP charge per word destroyed by typing, × the combo multiplier (1 = full bar). */
  readonly chargePerWord: number;
}

export interface ScoringConfig {
  readonly pointsPerLetter: number;
  /** Words destroyed above this normalized y (upper half) get `highBonus`. */
  readonly highLine: number;
  readonly highBonus: number;
  /** Words destroyed by a bomb or the EMP score this fraction. */
  readonly areaKillFactor: number;
}

// ---------- Player-chosen difficulty and grading ----------

export const GAME_DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
/** Chosen in the menu (not to be confused with the word-list tiers easy/medium/hard). */
export type GameDifficulty = (typeof GAME_DIFFICULTIES)[number];

export interface DifficultyPreset {
  /** Multiplies every fall speed. */
  readonly speed: number;
  /** Multiplies the spawn interval. */
  readonly interval: number;
  /** Weight moved onto easy words in the difficulty mix (negative: away from them). */
  readonly easyShift: number;
}

export const GRADES = ['S', 'A', 'B', 'C', 'D'] as const;
export type Grade = (typeof GRADES)[number];

export interface GradingConfig {
  /** How much each part counts in the 0..1 grade score (sum = 1). */
  readonly weights: { readonly accuracy: number; readonly speed: number; readonly defense: number };
  /** WPM that earns the full speed part. */
  readonly targetWpm: number;
  /** Fewer words destroyed than this is always a D. */
  readonly minWords: number;
  /** Best grade first; below the last tier it is a D. */
  readonly tiers: readonly { readonly grade: Grade; readonly min: number }[];
}

// ---------- Spawning ----------

export interface SpawnedWord {
  readonly text: string;
  readonly difficulty: Difficulty;
  readonly kind: WordKind;
  readonly x: number;
  readonly speed: number;
}

export interface SpawnedBoss {
  readonly kind: 'boss';
  /** 1 for the first boss of the match. */
  readonly number: number;
  readonly phrase: string;
  /** Descent in field heights per second. */
  readonly speed: number;
}

/** Anything that hands out new words (and bosses) over time (the Spawner, or a stub in tests). */
export interface WordSource {
  /** Current wave (announced to the player). */
  readonly wave: number;
  /** `activeCount` = what is on screen: the words plus the boss, if any. */
  update(dt: number, activeCount: number): SpawnedWord | SpawnedBoss | null;
}

// ---------- Events ----------

export type DestroyCause = 'typed' | 'bomb' | 'emp';
export type EndReason = 'shield' | 'time' | 'quit';

/**
 * Things that happened during an update. Logic emits them; the presentation layer
 * (lasers, particles, sounds, HUD) reacts to them.
 */
export type GameEvent =
  | { readonly type: 'spawn'; readonly wordId: number }
  | { readonly type: 'lock'; readonly wordId: number }
  /** `wordId` is null for the boss's current word. */
  | { readonly type: 'unlock'; readonly wordId: number | null }
  | {
      readonly type: 'hit';
      readonly wordId: number;
      /** Index of the letter that was just hit. */
      readonly index: number;
      readonly length: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'miss';
      readonly wordId: number | null;
      /** Combo that this error broke (0 if there was none). */
      readonly comboLost: number;
    }
  | {
      readonly type: 'armorBreak';
      readonly wordId: number;
      readonly length: number;
      readonly x: number;
      readonly y: number;
      readonly armorLeft: number;
    }
  | {
      readonly type: 'destroy';
      readonly wordId: number;
      readonly text: string;
      readonly kind: WordKind;
      readonly x: number;
      readonly y: number;
      readonly points: number;
      /** Combo multiplier the points were scored with. */
      readonly multiplier: number;
      readonly cause: DestroyCause;
    }
  | { readonly type: 'multiplier'; readonly multiplier: number }
  | { readonly type: 'empReady' }
  | { readonly type: 'empDenied' }
  | { readonly type: 'emp'; readonly count: number }
  | { readonly type: 'bomb'; readonly x: number; readonly y: number }
  | { readonly type: 'slow'; readonly seconds: number }
  | { readonly type: 'shieldUp'; readonly shield: number; readonly gained: number }
  | {
      readonly type: 'breach';
      readonly wordId: number;
      readonly text: string;
      readonly x: number;
      readonly shield: number;
      /** False in modes without damage (Zen): the word just leaves. */
      readonly damage: boolean;
    }
  | { readonly type: 'wave'; readonly wave: number }
  /** A boss is coming: the entrance alert starts. (Boss events carry it for its geometry.) */
  | { readonly type: 'bossAlert'; readonly boss: Readonly<Boss> }
  /** The alert is over: it descends and can be typed. */
  | { readonly type: 'bossEnter'; readonly boss: Readonly<Boss> }
  | { readonly type: 'bossHit'; readonly boss: Readonly<Boss>; readonly word: number; readonly index: number }
  /** One of its words was destroyed. */
  | {
      readonly type: 'bossWord';
      readonly boss: Readonly<Boss>;
      readonly word: number;
      readonly text: string;
      readonly points: number;
      readonly multiplier: number;
      readonly cause: Exclude<DestroyCause, 'bomb'>;
    }
  | { readonly type: 'bossDefeated'; readonly boss: Readonly<Boss>; readonly points: number }
  /** It reached the perimeter. `lost` = shield HP it cost (0 without damage: Zen). */
  | { readonly type: 'bossBreach'; readonly boss: Readonly<Boss>; readonly shield: number; readonly lost: number }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'gameover'; readonly reason: EndReason };
