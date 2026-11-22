// Pure helpers for the synth: no Web Audio here, so everything is testable.
import type { Rng } from '../utils/rng.ts';
import type { SoundLayer, SoundRecipe } from './types.ts';

/**
 * Resolves a recipe for one play: applies the requested pitch and a random jitter
 * to every frequency (tones) and cutoff (noise filters).
 */
export function planSound(recipe: SoundRecipe, pitch: number, rng: Rng): SoundLayer[] {
  const factor = pitch * (1 + rng.range(-recipe.pitchJitter, recipe.pitchJitter));
  return recipe.layers.map((layer): SoundLayer => {
    if (layer.kind === 'tone') {
      return {
        ...layer,
        freq: layer.freq * factor,
        freqEnd: layer.freqEnd === undefined ? undefined : layer.freqEnd * factor,
      };
    }
    return {
      ...layer,
      cutoff: layer.cutoff * factor,
      cutoffEnd: layer.cutoffEnd === undefined ? undefined : layer.cutoffEnd * factor,
    };
  });
}

/** Drops plays of the same sound that come faster than its cooldown. */
export class SoundThrottle<K extends string = string> {
  private readonly last = new Map<K, number>();

  allow(name: K, cooldown: number, now: number): boolean {
    const previous = this.last.get(name);
    if (previous !== undefined && now - previous < cooldown) return false;
    this.last.set(name, now);
    return true;
  }
}

/** White noise samples in [-1, 1), generated with the seedable RNG. */
export function createNoiseSamples(length: number, rng: Rng): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = rng.next() * 2 - 1;
  return samples;
}
