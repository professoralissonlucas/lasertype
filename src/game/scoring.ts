// Score, combo multiplier, typing stats and the final grade (pure).
//   points = letters × pointsPerLetter × comboMultiplier × heightBonus
//   heightBonus = 1.5 when destroyed in the upper half of the field, else 1.0
//   grade = S/A/B/C/D from accuracy, WPM and the share of words not lost (see gradeScore)
import { CONFIG } from '../config.ts';
import type { ComboTier, Grade, GradingConfig, ScoringConfig } from './types.ts';

/** Multiplier for a combo count: the highest tier whose `min` the combo reaches. */
export function comboMultiplier(combo: number, tiers: readonly ComboTier[] = CONFIG.combo.tiers): number {
  let multiplier = 1;
  for (const tier of tiers) if (combo >= tier.min) multiplier = tier.multiplier;
  return multiplier;
}

/** Combo needed for the next multiplier tier, or null at the top tier. */
export function nextTierAt(combo: number, tiers: readonly ComboTier[] = CONFIG.combo.tiers): number | null {
  for (const tier of tiers) if (tier.min > combo) return tier.min;
  return null;
}

/** 1.5× for words destroyed in the upper half of the field (normalized y < 0.5). */
export function heightBonus(y: number, scoring: ScoringConfig = CONFIG.scoring): number {
  return y < scoring.highLine ? scoring.highBonus : 1;
}

/** Points for a word destroyed by typing. `letters` counts every pass (armored words count twice). */
export function wordPoints(
  letters: number,
  multiplier: number,
  y: number,
  scoring: ScoringConfig = CONFIG.scoring,
): number {
  return Math.round(letters * scoring.pointsPerLetter * multiplier * heightBonus(y, scoring));
}

// ---------- Typing stats ----------

/** Correct letters / all letters typed (0 when nothing was typed). */
export function accuracyOf(hits: number, misses: number): number {
  const total = hits + misses;
  return total === 0 ? 0 : hits / total;
}

/** Standard WPM: (correct letters / 5) per minute. 0 during the first second (no spikes). */
export function wordsPerMinute(letters: number, seconds: number): number {
  if (seconds < 1) return 0;
  return letters / 5 / (seconds / 60);
}

/** Share of words that did not reach the perimeter: destroyed / (destroyed + lost). */
export function defenseRate(destroyed: number, lost: number): number {
  const total = destroyed + lost;
  return total === 0 ? 0 : destroyed / total;
}

// ---------- Grade ----------

export interface GradeInput {
  readonly accuracy: number;
  readonly wpm: number;
  readonly defense: number;
  readonly destroyed: number;
}

/** 0..1: weighted accuracy, speed (WPM vs the target, capped at 1) and defense. */
export function gradeScore(input: GradeInput, grading: GradingConfig = CONFIG.grading): number {
  const { weights } = grading;
  const speed = Math.min(1, input.wpm / grading.targetWpm);
  return weights.accuracy * input.accuracy + weights.speed * speed + weights.defense * input.defense;
}

export function gradeFor(input: GradeInput, grading: GradingConfig = CONFIG.grading): Grade {
  if (input.destroyed < grading.minWords) return 'D';
  const score = gradeScore(input, grading);
  for (const tier of grading.tiers) if (score >= tier.min) return tier.grade;
  return 'D';
}

/** Points for a word destroyed by a bomb or the EMP: half of `wordPoints`. */
export function areaKillPoints(
  letters: number,
  multiplier: number,
  y: number,
  scoring: ScoringConfig = CONFIG.scoring,
): number {
  return Math.round(
    letters * scoring.pointsPerLetter * multiplier * heightBonus(y, scoring) * scoring.areaKillFactor,
  );
}
