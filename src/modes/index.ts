// Game modes. The Daily Challenge (seed = UTC date) arrives in Phase 7.
import { CONFIG } from '../config.ts';
import type { ModeId, ModeRules } from './types.ts';

export const MODES: Readonly<Record<ModeId, ModeRules>> = {
  /** Endless, until the shield breaks. */
  survival: { id: 'survival', timeLimit: null, damage: true, waveBreak: true },
  /** 60 seconds for the highest score; waves follow each other without breaks. */
  timeAttack: { id: 'timeAttack', timeLimit: CONFIG.timeAttackSeconds, damage: true, waveBreak: false },
  /** Practice: no damage, no time limit. */
  zen: { id: 'zen', timeLimit: null, damage: false, waveBreak: true },
};
