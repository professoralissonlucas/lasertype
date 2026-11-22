// Wave difficulty curve (pure). Wave 1 uses CONFIG.spawn; each later wave is harder.
// (The boss every 5 waves arrives in Phase 7.)
import { CONFIG } from '../config.ts';
import type { SpawnParams, WaveConfig, WaveParams } from './types.ts';

export function waveParams(
  wave: number,
  spawn: SpawnParams = CONFIG.spawn,
  waves: WaveConfig = CONFIG.waves,
): WaveParams {
  const n = Math.max(0, wave - 1);

  // Difficulty mix: easy words give way to hard ones; medium takes the rest.
  const easy = Math.max(waves.minEasy, spawn.tierWeights.easy - waves.easyStep * n);
  const hard = Math.min(waves.maxHard, spawn.tierWeights.hard + waves.hardStep * n);
  const medium = Math.max(0, 1 - easy - hard);
  const total = easy + medium + hard;

  return {
    wave,
    wordCount: Math.min(waves.maxWordCount, waves.firstWordCount + waves.wordCountStep * n),
    interval: Math.max(waves.minInterval, spawn.interval * waves.intervalDecay ** n),
    speedMultiplier: Math.min(waves.maxSpeedMultiplier, 1 + waves.speedStep * n),
    tierWeights: { easy: easy / total, medium: medium / total, hard: hard / total },
    specialChance: Math.min(waves.maxSpecialChance, waves.specialChanceBase + waves.specialChanceStep * n),
    maxActive: Math.min(waves.maxActiveCap, spawn.maxActive + waves.maxActiveStep * n),
  };
}
