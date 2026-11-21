import { describe, expect, it } from 'vitest';
import { CONFIG } from './config.ts';

describe('CONFIG', () => {
  it('uses a 60 Hz fixed timestep', () => {
    expect(CONFIG.updatesPerSecond).toBe(60);
  });

  it('starts the shield with 3 HP', () => {
    expect(CONFIG.shieldMaxHp).toBe(3);
  });
});
