import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { MODES } from './index.ts';
import { MODE_IDS } from './types.ts';

describe('MODES', () => {
  it('defines every mode with its own id', () => {
    for (const id of MODE_IDS) expect(MODES[id].id).toBe(id);
  });

  it('Survival: endless, with damage and wave breaks', () => {
    expect(MODES.survival).toMatchObject({ timeLimit: null, damage: true, waveBreak: true });
  });

  it('Time Attack: 60 s, continuous waves', () => {
    expect(MODES.timeAttack).toMatchObject({ timeLimit: CONFIG.timeAttackSeconds, damage: true, waveBreak: false });
    expect(CONFIG.timeAttackSeconds).toBe(60);
  });

  it('Zen: no damage, no clock', () => {
    expect(MODES.zen).toMatchObject({ timeLimit: null, damage: false });
  });
});
