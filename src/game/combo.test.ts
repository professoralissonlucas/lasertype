import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { INITIAL_COMBO, isEmpReady, updateCombo, type ComboEvent, type ComboState } from './combo.ts';

const KILL: ComboEvent = { type: 'kill', flawed: false };
const FLAWED_KILL: ComboEvent = { type: 'kill', flawed: true };
const MISS: ComboEvent = { type: 'miss' };
const EMP: ComboEvent = { type: 'emp' };

function apply(events: ComboEvent[], from: ComboState = INITIAL_COMBO): ComboState {
  return events.reduce((state, event) => updateCombo(state, event), from);
}

describe('combo', () => {
  it('starts at zero', () => {
    expect(INITIAL_COMBO).toEqual({ combo: 0, maxCombo: 0, charge: 0 });
  });

  it('+1 for each word destroyed without errors', () => {
    expect(apply([KILL, KILL, KILL]).combo).toBe(3);
  });

  it('a wrong key resets the combo but remembers the best one', () => {
    const state = apply([KILL, KILL, KILL, MISS, KILL]);
    expect(state.combo).toBe(1);
    expect(state.maxCombo).toBe(3);
  });

  it('a word with an error does not add to the combo', () => {
    expect(apply([KILL, MISS, FLAWED_KILL]).combo).toBe(0);
  });

  it('a miss without a combo returns the same state (no allocation)', () => {
    const state = apply([MISS]);
    expect(updateCombo(state, MISS)).toBe(state);
  });

  it('does not mutate the previous state', () => {
    const before = apply([KILL]);
    updateCombo(before, KILL);
    expect(before.combo).toBe(1);
  });
});

describe('EMP charge', () => {
  const perWord = CONFIG.combo.chargePerWord;

  it('every destroyed word charges by chargePerWord × multiplier', () => {
    expect(apply([KILL]).charge).toBeCloseTo(perWord); // combo 1 → 1×
    const atFive = apply([KILL, KILL, KILL, KILL, KILL]);
    expect(atFive.charge).toBeCloseTo(4 * perWord + 2 * perWord); // 5th word at 2×
  });

  it('flawed words still charge (at the current multiplier)', () => {
    expect(apply([FLAWED_KILL]).charge).toBeCloseTo(perWord);
  });

  it('errors do not drain the charge', () => {
    const state = apply([KILL, KILL]);
    expect(updateCombo(state, MISS).charge).toBe(state.charge);
  });

  it('caps at 1 and is ready exactly when full', () => {
    const kills = Array.from({ length: 200 }, () => KILL);
    const full = apply(kills);
    expect(full.charge).toBe(1);
    expect(isEmpReady(full.charge)).toBe(true);
    expect(isEmpReady(0.99)).toBe(false);
  });

  it('a higher combo fills the bar faster', () => {
    let calm = INITIAL_COMBO;
    let streak: ComboState = { combo: 30, maxCombo: 30, charge: 0 };
    let calmWords = 0;
    let streakWords = 0;
    while (!isEmpReady(calm.charge)) {
      calm = updateCombo(updateCombo(calm, KILL), MISS); // never builds a combo
      calmWords++;
    }
    while (!isEmpReady(streak.charge)) {
      streak = updateCombo(streak, KILL);
      streakWords++;
    }
    expect(calmWords).toBe(Math.round(1 / perWord));
    expect(streakWords).toBeLessThan(calmWords / 3);
  });

  it('firing the EMP empties the charge but keeps the combo', () => {
    const state = updateCombo({ combo: 12, maxCombo: 12, charge: 1 }, EMP);
    expect(state).toEqual({ combo: 12, maxCombo: 12, charge: 0 });
  });
});
