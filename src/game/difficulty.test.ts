import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { applyDifficulty } from './difficulty.ts';
import { GAME_DIFFICULTIES } from './types.ts';

const base = CONFIG.spawn;

describe('applyDifficulty', () => {
  it('Normal leaves the spawn settings unchanged', () => {
    const normal = applyDifficulty(base, CONFIG.difficulty.normal);
    expect(normal.interval).toBe(base.interval);
    expect(normal.speed).toEqual(base.speed);
    for (const tier of ['easy', 'medium', 'hard'] as const) {
      expect(normal.tierWeights[tier]).toBeCloseTo(base.tierWeights[tier]);
    }
  });

  it('Easy is slower, sparser and has more easy words; Hard the opposite', () => {
    const easy = applyDifficulty(base, CONFIG.difficulty.easy);
    const hard = applyDifficulty(base, CONFIG.difficulty.hard);
    expect(easy.speed.easy).toBeLessThan(base.speed.easy);
    expect(hard.speed.hard).toBeGreaterThan(base.speed.hard);
    expect(easy.interval).toBeGreaterThan(base.interval);
    expect(hard.interval).toBeLessThan(base.interval);
    expect(easy.tierWeights.easy).toBeGreaterThan(base.tierWeights.easy);
    expect(hard.tierWeights.easy).toBeLessThan(base.tierWeights.easy);
  });

  it('keeps the difficulty mix a valid distribution and medium:hard proportional', () => {
    for (const id of GAME_DIFFICULTIES) {
      const { easy, medium, hard } = applyDifficulty(base, CONFIG.difficulty[id]).tierWeights;
      expect(easy + medium + hard).toBeCloseTo(1);
      for (const w of [easy, medium, hard]) expect(w).toBeGreaterThanOrEqual(0);
      expect(medium / hard).toBeCloseTo(base.tierWeights.medium / base.tierWeights.hard);
    }
  });

  it('clamps extreme shifts', () => {
    const all = applyDifficulty(base, { speed: 1, interval: 1, easyShift: 5 });
    expect(all.tierWeights.easy).toBeCloseTo(0.95);
    const none = applyDifficulty(base, { speed: 1, interval: 1, easyShift: -5 });
    expect(none.tierWeights.easy).toBeCloseTo(0.05);
  });

  it('does not touch unrelated settings', () => {
    const hard = applyDifficulty(base, CONFIG.difficulty.hard);
    expect(hard.xMin).toBe(base.xMin);
    expect(hard.textHistory).toBe(base.textHistory);
  });
});
