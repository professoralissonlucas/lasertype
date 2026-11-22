// Special words (pure helpers).
import { pickWeighted, type Rng } from '../utils/rng.ts';
import { SPECIAL_KINDS, type SpecialKind, type WordKind } from './types.ts';

/**
 * Normal word with probability 1 − chance, otherwise a special kind by weight.
 * Always consumes one roll first, so the sequence stays deterministic per seed.
 */
export function pickWordKind(
  rng: Rng,
  chance: number,
  weights: Readonly<Record<SpecialKind, number>>,
): WordKind {
  if (rng.next() >= chance) return 'normal';
  return pickWeighted(rng, SPECIAL_KINDS, weights);
}

export interface Positioned {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

/**
 * Words inside the blast ellipse around `center` (radii in normalized field units),
 * excluding the center word itself.
 */
export function findNeighbors<T extends Positioned>(
  words: readonly T[],
  center: Positioned,
  radiusX: number,
  radiusY: number,
): T[] {
  const result: T[] = [];
  for (const word of words) {
    if (word.id === center.id) continue;
    const dx = (word.x - center.x) / radiusX;
    const dy = (word.y - center.y) / radiusY;
    if (dx * dx + dy * dy <= 1) result.push(word);
  }
  return result;
}
