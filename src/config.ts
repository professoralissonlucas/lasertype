// Balancing constants. Every gameplay number lives here, never inline.
import type { EconomyConfig } from './economy/types.ts';
import type {
  ComboConfig,
  DifficultyPreset,
  GameDifficulty,
  GradingConfig,
  ScoringConfig,
  SpawnParams,
  SpecialConfig,
  WaveConfig,
} from './game/types.ts';
import type { Language } from './words/types.ts';

/**
 * Word spawning (wave 1 values; `WAVES` makes later waves harder). Positions and speeds
 * use normalized field coordinates: x ∈ [0, 1] across the play field, y = 0 at the top
 * and y = 1 at the perimeter. Speeds are "field heights per second", so fall time is
 * identical on every screen size.
 */
const SPAWN: SpawnParams = {
  firstDelay: 0.8,
  interval: 2.3,
  maxActive: 10,
  spawnY: 0,
  tierWeights: { easy: 0.6, medium: 0.32, hard: 0.08 },
  speed: { easy: 0.075, medium: 0.066, hard: 0.058 },
  speedJitter: 0.1,
  xMin: 0.08,
  xMax: 0.92,
  minXGap: 0.22,
  xAttempts: 8,
  xHistory: 2,
  initialHistory: 5,
  textHistory: 40,
  maxRerolls: 30,
};

/** Each wave: more words, spawned faster, falling faster, harder and more often special. */
const WAVES: WaveConfig = {
  firstWordCount: 8,
  wordCountStep: 2,
  maxWordCount: 30,
  intervalDecay: 0.92,
  minInterval: 0.85,
  speedStep: 0.07,
  maxSpeedMultiplier: 2.2,
  easyStep: 0.05,
  minEasy: 0.15,
  hardStep: 0.04,
  maxHard: 0.45,
  specialChanceBase: 0.08,
  specialChanceStep: 0.02,
  maxSpecialChance: 0.25,
  maxActiveStep: 1,
  maxActiveCap: 16,
  breakSeconds: 2.5,
};

const SPECIALS: SpecialConfig = {
  weights: { bomb: 0.3, ice: 0.25, shield: 0.15, armored: 0.3 },
  bombRadiusX: 0.2,
  bombRadiusY: 0.22,
  slowSeconds: 3,
  slowFactor: 0.4,
  armorLayers: 1,
};

/** Multiplier 1x (combo 0–4), 2x (5–14), 3x (15–29), 4x (30+). */
const COMBO: ComboConfig = {
  tiers: [
    { min: 0, multiplier: 1 },
    { min: 5, multiplier: 2 },
    { min: 15, multiplier: 3 },
    { min: 30, multiplier: 4 },
  ],
  chargePerWord: 0.05,
};

/** points = letters × 10 × combo multiplier × height bonus (1.5 in the upper half). */
const SCORING: ScoringConfig = {
  pointsPerLetter: 10,
  highLine: 0.5,
  highBonus: 1.5,
  areaKillFactor: 0.5,
};

/** Menu difficulty: applied on top of the wave-1 spawn settings (the wave curve stays the same). */
const DIFFICULTY: Readonly<Record<GameDifficulty, DifficultyPreset>> = {
  easy: { speed: 0.8, interval: 1.2, easyShift: 0.15 },
  normal: { speed: 1, interval: 1, easyShift: 0 },
  hard: { speed: 1.25, interval: 0.85, easyShift: -0.25 },
};

/** Mission Report grade: 40% accuracy, 35% speed (vs 60 WPM), 25% defense (words not lost). */
const GRADING: GradingConfig = {
  weights: { accuracy: 0.4, speed: 0.35, defense: 0.25 },
  targetWpm: 60,
  minWords: 5,
  tiers: [
    { grade: 'S', min: 0.9 },
    { grade: 'A', min: 0.8 },
    { grade: 'B', min: 0.65 },
    { grade: 'C', min: 0.5 },
  ],
};

/**
 * Coins per match: min(floor(points / 100), 80) + grade bonus, × the mode factor (Zen 25%).
 * Prices by rarity; the daily shop has 4 items, one of them 30% off.
 */
const ECONOMY: EconomyConfig = {
  pointsPerCoin: 100,
  maxScoreCoins: 80,
  gradeBonus: { S: 20, A: 10, B: 5, C: 0, D: 0 },
  modeFactor: { survival: 1, timeAttack: 1, zen: 0.25 },
  rarityPrice: { common: 300, rare: 900, epic: 2500, legendary: 6000 },
  shopSize: 4,
  discountFactor: 0.7,
  discountStep: 10,
};

const DEFAULT_LANGUAGE: Language = 'pt-BR';

export const CONFIG = {
  /** Fixed-timestep game loop rate. */
  updatesPerSecond: 60,
  /** Longest frame the loop will simulate (avoids the "spiral of death" after a stall). */
  maxFrameSeconds: 0.25,
  /** Starting (and maximum) shield HP. */
  shieldMaxHp: 3,
  /** Time Attack length. */
  timeAttackSeconds: 60,
  defaultLanguage: DEFAULT_LANGUAGE,
  spawn: SPAWN,
  waves: WAVES,
  specials: SPECIALS,
  combo: COMBO,
  scoring: SCORING,
  difficulty: DIFFICULTY,
  grading: GRADING,
  economy: ECONOMY,
} as const;
