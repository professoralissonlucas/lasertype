import { describe, expect, it } from 'vitest';
import { FixedTimestep } from './timestep.ts';

describe('FixedTimestep', () => {
  it('runs one update per 1/60 s frame', () => {
    const loop = new FixedTimestep(60, 0.25);
    expect(loop.step).toBeCloseTo(1 / 60);
    expect(loop.advance(1 / 60)).toBe(1);
  });

  it('runs the same number of updates regardless of frame rate', () => {
    const at30 = new FixedTimestep(60, 0.25);
    const at144 = new FixedTimestep(60, 0.25);
    let steps30 = 0;
    let steps144 = 0;
    for (let i = 0; i < 30; i++) steps30 += at30.advance(1 / 30);
    for (let i = 0; i < 144; i++) steps144 += at144.advance(1 / 144);
    // One simulated second ≈ 60 updates either way (±1 for float rounding).
    expect(Math.abs(steps30 - 60)).toBeLessThanOrEqual(1);
    expect(Math.abs(steps144 - 60)).toBeLessThanOrEqual(1);
  });

  it('carries leftover time into the interpolation factor', () => {
    const loop = new FixedTimestep(60, 0.25);
    expect(loop.advance(1.5 / 60)).toBe(1);
    expect(loop.alpha).toBeCloseTo(0.5);
  });

  it('clamps huge frames to avoid a spiral of death', () => {
    const loop = new FixedTimestep(60, 0.25);
    expect(loop.advance(10)).toBe(15);
  });

  it('ignores negative frame times and can be reset', () => {
    const loop = new FixedTimestep(60, 0.25);
    expect(loop.advance(-1)).toBe(0);
    loop.advance(0.5 / 60);
    loop.reset();
    expect(loop.alpha).toBe(0);
  });
});
