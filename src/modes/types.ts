import type { GameDifficulty } from '../game/types.ts';

export const MODE_IDS = ['survival', 'timeAttack', 'daily', 'zen'] as const;
export type ModeId = (typeof MODE_IDS)[number];

/** Rules that change between game modes (pure data). */
export interface ModeRules {
  readonly id: ModeId;
  /** Match length in seconds, or null for no limit. */
  readonly timeLimit: number | null;
  /** Words crossing the perimeter hurt the shield (and can end the match). */
  readonly damage: boolean;
  /** After each wave, wait for a clear screen and a short break before the next one. */
  readonly waveBreak: boolean;
  /** Difficulty of every match of this mode, or null = the player's choice in the menu. */
  readonly fixedDifficulty: GameDifficulty | null;
}
