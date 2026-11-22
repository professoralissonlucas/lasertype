// Menu difficulty (pure): adjusts the wave-1 spawn settings; waves then ramp up as usual.
import { clamp } from '../utils/math.ts';
import type { DifficultyPreset, SpawnParams } from './types.ts';

const MIN_EASY = 0.05;
const MAX_EASY = 0.95;

export function applyDifficulty(spawn: SpawnParams, preset: DifficultyPreset): SpawnParams {
  const { easy, medium, hard } = spawn.tierWeights;
  const nextEasy = clamp(easy + preset.easyShift, MIN_EASY, MAX_EASY);
  // Medium and hard share what is left, keeping their original proportion.
  const rest = medium + hard;
  const scale = rest > 0 ? (1 - nextEasy) / rest : 0;
  return {
    ...spawn,
    interval: spawn.interval * preset.interval,
    tierWeights: rest > 0 ? { easy: nextEasy, medium: medium * scale, hard: hard * scale } : { easy: 1, medium: 0, hard: 0 },
    speed: {
      easy: spawn.speed.easy * preset.speed,
      medium: spawn.speed.medium * preset.speed,
      hard: spawn.speed.hard * preset.speed,
    },
  };
}
