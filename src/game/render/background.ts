import type { Rng } from '../../utils/rng.ts';

/** A static star in normalized screen coordinates. */
export interface Star {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly alpha: number;
}

export function createStarfield(rng: Rng, count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rng.next(),
      y: rng.next(),
      size: rng.next() < 0.85 ? 1 : 2,
      alpha: rng.range(0.15, 0.8),
    });
  }
  return stars;
}
