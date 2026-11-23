import { describe, expect, it } from 'vitest';
import { getItem } from '../../../cosmetics/catalog.ts';
import type { CannonParams } from '../../../cosmetics/types.ts';
import { SETTLED_SHOT_AGE } from '../../entities/Cannon.ts';
import { LAYOUT } from '../layout.ts';
import {
  barrelOf,
  coreEnergy,
  createCannonPose,
  IDLE_ENERGY,
  muzzleSideOffset,
  recoilKick,
  TWIN_BARREL_OFFSET,
} from './model.ts';

function cannon(id: string): CannonParams {
  const item = getItem(id);
  if (item?.type !== 'cannon') throw new Error(id);
  return item.params;
}

describe('barrels', () => {
  it('the twin alternates left/right; every other cannon fires its one barrel from the center', () => {
    const twin = cannon('cannon_twin');
    expect([0, 1, 2, 3].map((shot) => barrelOf(twin, shot))).toEqual([0, 1, 0, 1]);
    expect([0, 1].map((shot) => muzzleSideOffset(twin, shot))).toEqual([-TWIN_BARREL_OFFSET, TWIN_BARREL_OFFSET]);
    for (const id of ['cannon_sentinel', 'cannon_crystal', 'cannon_halo', 'cannon_golden']) {
      expect(barrelOf(cannon(id), 1), id).toBe(0);
      expect(muzzleSideOffset(cannon(id), 1), id).toBe(0);
    }
  });
});

describe('recoilKick', () => {
  it('goes from rest to the full slide, easing at both ends', () => {
    expect(recoilKick(0)).toBe(0);
    expect(recoilKick(1)).toBe(LAYOUT.recoilDistance);
    expect(recoilKick(0.5)).toBeCloseTo(LAYOUT.recoilDistance / 2);
    expect(recoilKick(2)).toBe(LAYOUT.recoilDistance);
    let previous = 0;
    for (let r = 0.05; r <= 1; r += 0.05) {
      expect(recoilKick(r)).toBeGreaterThan(previous);
      previous = recoilKick(r);
    }
  });
});

describe('coreEnergy', () => {
  it('rises with the combo multiplier and the EMP charge; full only when the EMP is ready', () => {
    expect(coreEnergy(1, 0)).toBeCloseTo(0.2);
    expect(coreEnergy(2, 0)).toBeGreaterThan(coreEnergy(1, 0));
    expect(coreEnergy(4, 0)).toBeGreaterThan(coreEnergy(3, 0));
    expect(coreEnergy(1, 0.5)).toBeGreaterThan(coreEnergy(1, 0.2));
    expect(coreEnergy(4, 0.99)).toBeLessThan(1);
    expect(coreEnergy(1, 1)).toBe(1);
  });

  it('stays in 0..1 whatever comes in', () => {
    for (const [multiplier, charge] of [
      [0, -1],
      [10, 0.9],
      [-3, 5],
    ] as const) {
      const energy = coreEnergy(multiplier, charge);
      expect(energy).toBeGreaterThanOrEqual(0);
      expect(energy).toBeLessThanOrEqual(1);
    }
  });
});

describe('createCannonPose', () => {
  it('starts at rest: upright, no recoil, no muzzle effects, idle glow', () => {
    expect(createCannonPose()).toEqual({
      angle: 0,
      recoil: [0, 0],
      shotAge: [SETTLED_SHOT_AGE, SETTLED_SHOT_AGE],
      shotSeed: [0, 0],
      energy: IDLE_ENERGY,
      missFlash: false,
      time: 0,
      reduced: false,
    });
  });
});
