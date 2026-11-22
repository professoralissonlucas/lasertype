// The cannon's pose and the pure rules around it (no drawing, no DOM): which barrel fires,
// where its muzzle is, how far the barrel slides back, how bright the energy core burns.
import type { CannonParams } from '../../../cosmetics/types.ts';
import { clamp } from '../../../utils/math.ts';
import { SETTLED_SHOT_AGE, type BarrelIndex, type CannonMotion } from '../../entities/Cannon.ts';
import { LAYOUT } from '../layout.ts';

/** Twin barrels: half-distance between the two barrels (px). Shots alternate sides. */
export const TWIN_BARREL_OFFSET = 4.5;
/** Core brightness outside matches. */
export const IDLE_ENERGY = 0.3;

/** Everything that moves on the cannon for one frame (one object reused every frame). */
export interface CannonPose extends CannonMotion {
  /** 0..1 energy core level (combo and EMP charge, see coreEnergy). */
  energy: number;
  /** A wrong key was pressed very recently: core and lights turn red. */
  missFlash: boolean;
  /** Seconds of animation time (breathing, ring pulse, orbit). */
  time: number;
  /** "Reduzir efeitos": no idle motion, sparks or smoke (recoil and the muzzle glow stay). */
  reduced: boolean;
}

export function createCannonPose(): CannonPose {
  return {
    angle: 0,
    recoil: [0, 0],
    shotAge: [SETTLED_SHOT_AGE, SETTLED_SHOT_AGE],
    shotSeed: [0, 0],
    energy: IDLE_ENERGY,
    missFlash: false,
    time: 0,
    reduced: false,
  };
}

/** Which barrel fires shot number `shot` (the twin alternates, starting on the left). */
export function barrelOf(params: CannonParams, shot: number): BarrelIndex {
  return params.barrel === 'twin' && shot % 2 === 1 ? 1 : 0;
}

/** Sideways muzzle offset for shot number `shot` (twin barrels alternate; others 0). */
export function muzzleSideOffset(params: CannonParams, shot: number): number {
  if (params.barrel !== 'twin') return 0;
  return barrelOf(params, shot) === 0 ? -TWIN_BARREL_OFFSET : TWIN_BARREL_OFFSET;
}

/**
 * How bright the energy core burns: a low idle glow, rising with the combo multiplier
 * (1x–4x) and the EMP charge, full once the EMP is ready.
 */
export function coreEnergy(multiplier: number, charge: number): number {
  if (charge >= 1 - 1e-9) return 1;
  const combo = clamp((multiplier - 1) / 3, 0, 1);
  return clamp(0.2 + 0.3 * combo + 0.45 * clamp(charge, 0, 1), 0, 0.95);
}

/** Barrel slide (px) for a recoil of 0..1: holds back an instant, then eases home. */
export function recoilKick(recoil: number): number {
  const r = clamp(recoil, 0, 1);
  return LAYOUT.recoilDistance * r * r * (3 - 2 * r);
}
