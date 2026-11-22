// Game modes (what makes the Daily Challenge's sequence the same for everyone: daily.ts).
import { CONFIG } from '../config.ts';
import type { ModeId, ModeRules } from './types.ts';

export const MODES: Readonly<Record<ModeId, ModeRules>> = {
  /** Endless, until the shield breaks. */
  survival: { id: 'survival', timeLimit: null, damage: true, waveBreak: true, fixedDifficulty: null },
  /** 60 seconds for the highest score; waves follow each other without breaks. */
  timeAttack: {
    id: 'timeAttack',
    timeLimit: CONFIG.timeAttackSeconds,
    damage: true,
    waveBreak: false,
    fixedDifficulty: null,
  },
  /** Survival rules with the day's seed, always on Normal: the same match for everyone. */
  daily: { id: 'daily', timeLimit: null, damage: true, waveBreak: true, fixedDifficulty: 'normal' },
  /** Practice: no damage, no time limit. */
  zen: { id: 'zen', timeLimit: null, damage: false, waveBreak: true, fixedDifficulty: null },
};
