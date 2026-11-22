import { describe, expect, it } from 'vitest';
import { createRng } from '../../utils/rng.ts';
import {
  BackgroundState,
  createFractalNoise,
  createStarLayers,
  generateNebula,
  NEBULA_SPEED,
  PeriodicNoise,
} from './background.ts';

describe('PeriodicNoise', () => {
  it('repeats seamlessly every period', () => {
    const noise = new PeriodicNoise(createRng(1), 4);
    for (const [u, v] of [[0.3, 1.7], [2.25, 0.5], [3.9, 3.1]] as const) {
      expect(noise.sample(u + 4, v)).toBeCloseTo(noise.sample(u, v), 10);
      expect(noise.sample(u, v + 4)).toBeCloseTo(noise.sample(u, v), 10);
    }
  });

  it('stays in [0, 1] and varies smoothly', () => {
    const noise = new PeriodicNoise(createRng(2), 8);
    let previous = noise.sample(0, 0.5);
    for (let u = 0.01; u < 8; u += 0.01) {
      const value = noise.sample(u, 0.5);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(Math.abs(value - previous)).toBeLessThan(0.05);
      previous = value;
    }
  });
});

describe('createFractalNoise', () => {
  it('tiles at u, v = 1', () => {
    const field = createFractalNoise(createRng(3), 4, 4);
    expect(field(1, 0.37)).toBeCloseTo(field(0, 0.37), 10);
    expect(field(0.61, 1)).toBeCloseTo(field(0.61, 0), 10);
  });
});

describe('generateNebula', () => {
  const size = 32;
  const cyan = [34, 211, 238] as const;
  const pink = [255, 46, 136] as const;

  it('returns RGBA pixels with alpha capped by maxAlpha', () => {
    const pixels = generateNebula(size, createRng(4), cyan, pink, 0.2);
    expect(pixels).toHaveLength(size * size * 4);
    let maxAlpha = 0;
    for (let i = 3; i < pixels.length; i += 4) maxAlpha = Math.max(maxAlpha, pixels[i] ?? 0);
    expect(maxAlpha).toBeGreaterThan(0);
    expect(maxAlpha).toBeLessThanOrEqual(Math.ceil(0.2 * 255));
  });

  it('only uses colors between the two tints', () => {
    const pixels = generateNebula(size, createRng(5), cyan, pink, 1);
    for (let i = 0; i < pixels.length; i += 4) {
      if ((pixels[i + 3] ?? 0) === 0) continue;
      expect(pixels[i]).toBeGreaterThanOrEqual(33);
      expect(pixels[i]).toBeLessThanOrEqual(255);
    }
  });

  it('is deterministic for the same seed', () => {
    expect(generateNebula(size, createRng(6), cyan, pink, 0.2)).toEqual(
      generateNebula(size, createRng(6), cyan, pink, 0.2),
    );
  });
});

describe('star layers', () => {
  it('puts far layers behind: more stars, dimmer and slower than near ones', () => {
    const layers = createStarLayers(createRng(7));
    expect(layers).toHaveLength(3);
    const [far, , near] = layers;
    if (!far || !near) throw new Error('missing layers');
    expect(far.stars.length).toBeGreaterThan(near.stars.length);
    expect(far.speed).toBeLessThan(near.speed);
    const avg = (xs: readonly { alpha: number }[]) => xs.reduce((s, x) => s + x.alpha, 0) / xs.length;
    expect(avg(far.stars)).toBeLessThan(avg(near.stars));
    expect(NEBULA_SPEED).toBeLessThan(far.speed);
  });

  it('keeps stars in normalized coordinates', () => {
    for (const layer of createStarLayers(createRng(8))) {
      for (const star of layer.stars) {
        expect(star.x).toBeGreaterThanOrEqual(0);
        expect(star.x).toBeLessThan(1);
        expect(star.y).toBeGreaterThanOrEqual(0);
        expect(star.y).toBeLessThan(1);
      }
    }
  });
});

describe('BackgroundState', () => {
  it('scrolls each layer at its own speed (parallax)', () => {
    const bg = new BackgroundState(createRng(9));
    bg.update(1);
    const nebula = bg.offset(0, 1);
    const far = bg.offset(1, 1);
    const near = bg.offset(3, 1);
    expect(nebula).toBeCloseTo(NEBULA_SPEED);
    expect(far).toBeGreaterThan(nebula);
    expect(near).toBeGreaterThan(far);
  });

  it('interpolates between updates', () => {
    const bg = new BackgroundState(createRng(10));
    bg.update(1);
    bg.update(1);
    expect(bg.offset(1, 0.5)).toBeCloseTo(((bg.offset(1, 0) + bg.offset(1, 1)) / 2) % 1);
  });

  it('wraps offsets into [0, 1) without jumping backwards', () => {
    const bg = new BackgroundState(createRng(11));
    for (let i = 0; i < 6000; i++) bg.update(1);
    for (let layer = 0; layer < 4; layer++) {
      const value = bg.offset(layer, 0.3);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('stays still when never updated (reduced effects)', () => {
    const bg = new BackgroundState(createRng(12));
    expect(bg.offset(2, 0.7)).toBe(0);
  });
});
