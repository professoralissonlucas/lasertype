// Combo and EMP charge as a pure reducer.
//   - a word destroyed by typing without any error on it: combo +1
//   - any wrong key: combo back to 0 (the lock is kept elsewhere)
//   - every word destroyed by typing charges the EMP by chargePerWord × multiplier
//   - firing the EMP empties the charge
import { CONFIG } from '../config.ts';
import { comboMultiplier } from './scoring.ts';
import type { ComboConfig } from './types.ts';

export interface ComboState {
  readonly combo: number;
  readonly maxCombo: number;
  /** EMP charge, 0..1. */
  readonly charge: number;
}

export type ComboEvent =
  | { readonly type: 'kill'; /** The word had a typing error. */ readonly flawed: boolean }
  | { readonly type: 'miss' }
  | { readonly type: 'emp' };

export const INITIAL_COMBO: ComboState = { combo: 0, maxCombo: 0, charge: 0 };

/** Float tolerance so 20 × 0.05 counts as a full bar. */
const FULL = 1 - 1e-9;

export function isEmpReady(charge: number): boolean {
  return charge >= FULL;
}

export function updateCombo(
  state: ComboState,
  event: ComboEvent,
  config: ComboConfig = CONFIG.combo,
): ComboState {
  switch (event.type) {
    case 'kill': {
      const combo = event.flawed ? state.combo : state.combo + 1;
      const gain = config.chargePerWord * comboMultiplier(combo, config.tiers);
      return {
        combo,
        maxCombo: Math.max(state.maxCombo, combo),
        charge: Math.min(1, state.charge + gain),
      };
    }
    case 'miss':
      return state.combo === 0 ? state : { ...state, combo: 0 };
    case 'emp':
      return { ...state, charge: 0 };
  }
}
