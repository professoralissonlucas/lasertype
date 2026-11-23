// XP, levels and level-up chests (pure).
//   xp    = min(letters + 2 × words + 50 × bosses, 1000) × mode factor (Zen 25%)
//   level n → n + 1 costs 200 + 100 × (n − 1) XP
//   chest = min(150, 40 + 5 × new level) coins
import { CONFIG } from '../config.ts';
import type { ModeId } from '../modes/types.ts';
import type { ProgressionConfig } from './types.ts';

export interface XpInput {
  readonly mode: ModeId;
  /** Correct letters. */
  readonly letters: number;
  /** Words destroyed. */
  readonly destroyed: number;
  /** Bosses defeated. */
  readonly bosses: number;
}

/** XP earned by one match, with the breakdown the Mission Report shows. */
export interface XpReward {
  readonly fromLetters: number;
  readonly fromWords: number;
  readonly fromBosses: number;
  readonly factor: number;
  /** floor(min(sum, maxPerMatch) × factor). */
  readonly total: number;
}

export function matchXp(input: XpInput, config: ProgressionConfig = CONFIG.progression): XpReward {
  const { perLetter, perWord, perBoss, maxPerMatch, modeFactor } = config.xp;
  const fromLetters = input.letters * perLetter;
  const fromWords = input.destroyed * perWord;
  const fromBosses = input.bosses * perBoss;
  const factor = modeFactor[input.mode];
  const total = Math.floor(Math.min(fromLetters + fromWords + fromBosses, maxPerMatch) * factor);
  return { fromLetters, fromWords, fromBosses, factor, total };
}

/** XP needed to go from `level` to the next one. */
export function levelCost(level: number, config: ProgressionConfig = CONFIG.progression): number {
  return config.level.firstCost + config.level.costStep * (level - 1);
}

/** Total XP at which `level` is reached (0 for level 1). */
export function xpToReach(level: number, config: ProgressionConfig = CONFIG.progression): number {
  const n = level - 1;
  return n * config.level.firstCost + (config.level.costStep * n * (n - 1)) / 2;
}

/** Level of a player with `xp` in total. */
export function levelOf(xp: number, config: ProgressionConfig = CONFIG.progression): number {
  const { firstCost, costStep } = config.level;
  // Solves xpToReach(n + 1) = xp for n, then settles the rounding.
  const half = costStep / 2;
  const b = firstCost - half;
  let level = 1 + Math.max(0, Math.floor((Math.sqrt(b * b + 4 * half * Math.max(0, xp)) - b) / (2 * half)));
  while (xpToReach(level + 1, config) <= xp) level++;
  while (level > 1 && xpToReach(level, config) > xp) level--;
  return level;
}

export interface LevelProgress {
  readonly level: number;
  /** XP earned inside this level, and what the whole level costs. */
  readonly into: number;
  readonly cost: number;
}

export function levelProgress(xp: number, config: ProgressionConfig = CONFIG.progression): LevelProgress {
  const level = levelOf(xp, config);
  return { level, into: Math.max(0, xp) - xpToReach(level, config), cost: levelCost(level, config) };
}

/** Coins of the chest for reaching `level`. */
export function chestCoins(level: number, config: ProgressionConfig = CONFIG.progression): number {
  const { base, perLevel, max } = config.chest;
  return Math.min(max, base + perLevel * level);
}
