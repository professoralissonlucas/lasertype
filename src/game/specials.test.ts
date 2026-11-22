import { describe, expect, it } from 'vitest';
import { createRng } from '../utils/rng.ts';
import { findNeighbors, pickWordKind } from './specials.ts';

const WEIGHTS = { bomb: 1, ice: 1, shield: 1, armored: 1 };

describe('pickWordKind', () => {
  it('is always normal with zero chance and always special with chance 1', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) expect(pickWordKind(rng, 0, WEIGHTS)).toBe('normal');
    for (let i = 0; i < 200; i++) expect(pickWordKind(rng, 1, WEIGHTS)).not.toBe('normal');
  });

  it('follows the chance and the weights', () => {
    const rng = createRng(2);
    const counts = new Map<string, number>();
    for (let i = 0; i < 20_000; i++) {
      const kind = pickWordKind(rng, 0.2, { bomb: 3, ice: 1, shield: 0, armored: 0 });
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    expect((counts.get('normal') ?? 0) / 20_000).toBeCloseTo(0.8, 1);
    expect(counts.get('shield')).toBeUndefined();
    expect((counts.get('bomb') ?? 0) / (counts.get('ice') ?? 1)).toBeCloseTo(3, 0);
  });

  it('is deterministic for a seed', () => {
    const a = createRng(3);
    const b = createRng(3);
    for (let i = 0; i < 100; i++) expect(pickWordKind(a, 0.5, WEIGHTS)).toBe(pickWordKind(b, 0.5, WEIGHTS));
  });
});

describe('findNeighbors', () => {
  const center = { id: 1, x: 0.5, y: 0.5 };
  const words = [
    center,
    { id: 2, x: 0.6, y: 0.5 }, // inside on x
    { id: 3, x: 0.5, y: 0.7 }, // inside on y
    { id: 4, x: 0.75, y: 0.5 }, // outside on x
    { id: 5, x: 0.66, y: 0.68 }, // corner: inside the bounding box, outside the ellipse
  ];

  it('returns words inside the blast ellipse, excluding the bomb itself', () => {
    expect(findNeighbors(words, center, 0.2, 0.25).map((w) => w.id)).toEqual([2, 3]);
  });

  it('includes words exactly on the edge', () => {
    expect(findNeighbors([center, { id: 9, x: 0.7, y: 0.5 }], center, 0.2, 0.25)).toHaveLength(1);
  });

  it('returns nothing on an empty field', () => {
    expect(findNeighbors([center], center, 0.2, 0.2)).toEqual([]);
  });
});
