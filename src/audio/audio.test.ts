import { describe, expect, it } from 'vitest';
import { createRng } from '../utils/rng.ts';
import { createNoiseSamples, planSound, SoundThrottle } from './plan.ts';
import { DEFAULT_SOUNDS } from './recipes.ts';
import type { SoundName, SoundRecipe } from './types.ts';

const NAMES = Object.keys(DEFAULT_SOUNDS) as SoundName[];

describe('default sound recipes', () => {
  it('cover every sound the game plays', () => {
    expect(NAMES.sort()).toEqual([
      'armor',
      'bomb',
      'breach',
      'emp',
      'empReady',
      'explosion',
      'freeze',
      'gameover',
      'miss',
      'multiplier',
      'shieldUp',
      'shot',
      'unlock',
      'wave',
    ]);
  });

  it.each(NAMES)('%s has sane layers', (name) => {
    const recipe = DEFAULT_SOUNDS[name];
    expect(recipe.layers.length).toBeGreaterThan(0);
    expect(recipe.cooldown).toBeGreaterThanOrEqual(0);
    expect(recipe.pitchJitter).toBeGreaterThanOrEqual(0);
    expect(recipe.pitchJitter).toBeLessThanOrEqual(0.2);
    for (const layer of recipe.layers) {
      expect(layer.attack).toBeGreaterThan(0);
      expect(layer.duration).toBeGreaterThan(layer.attack);
      expect(layer.duration).toBeLessThanOrEqual(1);
      expect(layer.gain).toBeGreaterThan(0);
      expect(layer.gain).toBeLessThanOrEqual(0.5);
      expect(layer.delay ?? 0).toBeGreaterThanOrEqual(0);
      const freqs = layer.kind === 'tone' ? [layer.freq, layer.freqEnd] : [layer.cutoff, layer.cutoffEnd];
      for (const f of freqs) {
        if (f === undefined) continue;
        // Exponential ramps need positive targets; keep everything audible.
        expect(f).toBeGreaterThanOrEqual(20);
        expect(f).toBeLessThanOrEqual(20_000);
      }
    }
  });
});

describe('planSound', () => {
  const recipe: SoundRecipe = {
    pitchJitter: 0,
    cooldown: 0,
    layers: [
      { kind: 'tone', wave: 'square', freq: 400, freqEnd: 200, attack: 0.01, duration: 0.1, gain: 0.1 },
      { kind: 'noise', filter: 'lowpass', cutoff: 1000, attack: 0.01, duration: 0.1, gain: 0.1 },
    ],
  };

  it('scales every frequency and cutoff by the pitch', () => {
    const [tone, noise] = planSound(recipe, 1.5, createRng(1));
    expect(tone).toMatchObject({ kind: 'tone', freq: 600, freqEnd: 300 });
    expect(noise).toMatchObject({ kind: 'noise', cutoff: 1500 });
  });

  it('keeps optional end values undefined', () => {
    const [, noise] = planSound(recipe, 1, createRng(1));
    expect(noise?.kind === 'noise' && noise.cutoffEnd).toBeUndefined();
  });

  it('applies jitter within bounds and does not mutate the recipe', () => {
    const jittery = { ...recipe, pitchJitter: 0.1 };
    const rng = createRng(2);
    for (let i = 0; i < 200; i++) {
      const [tone] = planSound(jittery, 1, rng);
      if (tone?.kind !== 'tone') throw new Error('expected tone');
      expect(tone.freq).toBeGreaterThanOrEqual(360);
      expect(tone.freq).toBeLessThanOrEqual(440);
    }
    expect(recipe.layers[0]).toMatchObject({ freq: 400 });
  });
});

describe('SoundThrottle', () => {
  it('drops repeats inside the cooldown, per sound', () => {
    const throttle = new SoundThrottle();
    expect(throttle.allow('shot', 0.05, 1)).toBe(true);
    expect(throttle.allow('shot', 0.05, 1.02)).toBe(false);
    expect(throttle.allow('miss', 0.05, 1.02)).toBe(true);
    expect(throttle.allow('shot', 0.05, 1.06)).toBe(true);
  });
});

describe('createNoiseSamples', () => {
  it('fills [-1, 1) deterministically', () => {
    const a = createNoiseSamples(1000, createRng(3));
    const b = createNoiseSamples(1000, createRng(3));
    expect(a).toEqual(b);
    for (const sample of a) {
      expect(sample).toBeGreaterThanOrEqual(-1);
      expect(sample).toBeLessThan(1);
    }
    // Roughly centered (white noise has no DC offset).
    const mean = a.reduce((sum, s) => sum + s, 0) / a.length;
    expect(Math.abs(mean)).toBeLessThan(0.1);
  });
});
