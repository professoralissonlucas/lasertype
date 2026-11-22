import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { waveParams } from './waves.ts';

const waves = Array.from({ length: 40 }, (_, i) => waveParams(i + 1));

describe('waveParams', () => {
  it('wave 1 uses the base spawn settings', () => {
    const first = waveParams(1);
    expect(first).toMatchObject({
      wave: 1,
      wordCount: CONFIG.waves.firstWordCount,
      interval: CONFIG.spawn.interval,
      speedMultiplier: 1,
      maxActive: CONFIG.spawn.maxActive,
      specialChance: CONFIG.waves.specialChanceBase,
    });
    expect(first.tierWeights.easy).toBeCloseTo(CONFIG.spawn.tierWeights.easy);
  });

  it('gets harder every wave until each cap', () => {
    for (let i = 1; i < waves.length; i++) {
      const prev = waves[i - 1];
      const next = waves[i];
      if (!prev || !next) throw new Error('missing wave');
      expect(next.wordCount).toBeGreaterThanOrEqual(prev.wordCount);
      expect(next.interval).toBeLessThanOrEqual(prev.interval);
      expect(next.speedMultiplier).toBeGreaterThanOrEqual(prev.speedMultiplier);
      expect(next.specialChance).toBeGreaterThanOrEqual(prev.specialChance);
      expect(next.maxActive).toBeGreaterThanOrEqual(prev.maxActive);
      expect(next.tierWeights.easy).toBeLessThanOrEqual(prev.tierWeights.easy + 1e-12);
      expect(next.tierWeights.hard).toBeGreaterThanOrEqual(prev.tierWeights.hard - 1e-12);
    }
    expect(waveParams(2).interval).toBeLessThan(waveParams(1).interval);
    expect(waveParams(2).speedMultiplier).toBeGreaterThan(1);
  });

  it('respects every cap', () => {
    const late = waveParams(200);
    const w = CONFIG.waves;
    expect(late.wordCount).toBe(w.maxWordCount);
    expect(late.interval).toBe(w.minInterval);
    expect(late.speedMultiplier).toBe(w.maxSpeedMultiplier);
    expect(late.specialChance).toBe(w.maxSpecialChance);
    expect(late.maxActive).toBe(w.maxActiveCap);
    expect(late.tierWeights.easy).toBeCloseTo(w.minEasy);
    expect(late.tierWeights.hard).toBeCloseTo(w.maxHard);
  });

  it('difficulty weights always add up to 1 and are never negative', () => {
    for (const wave of waves) {
      const { easy, medium, hard } = wave.tierWeights;
      expect(easy + medium + hard).toBeCloseTo(1);
      for (const weight of [easy, medium, hard]) expect(weight).toBeGreaterThanOrEqual(0);
    }
  });
});
