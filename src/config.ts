// Balancing constants. Every gameplay number lives here, never inline.
import type { SpawnParams } from './game/types.ts';
import type { Language } from './words/types.ts';

/**
 * Word spawning. Positions and speeds use normalized field coordinates:
 * x ∈ [0, 1] across the play field, y = 0 at the top and y = 1 at the perimeter.
 * Speeds are "field heights per second", so fall time is identical on every screen size.
 */
const SPAWN: SpawnParams = {
  firstDelay: 0.8,
  interval: 2.3,
  maxActive: 10,
  spawnY: 0,
  tierWeights: { easy: 0.5, medium: 0.35, hard: 0.15 },
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

const DEFAULT_LANGUAGE: Language = 'pt-BR';

export const CONFIG = {
  /** Fixed-timestep game loop rate. */
  updatesPerSecond: 60,
  /** Longest frame the loop will simulate (avoids the "spiral of death" after a stall). */
  maxFrameSeconds: 0.25,
  /** Starting shield HP. */
  shieldMaxHp: 3,
  defaultLanguage: DEFAULT_LANGUAGE,
  spawn: SPAWN,
} as const;
