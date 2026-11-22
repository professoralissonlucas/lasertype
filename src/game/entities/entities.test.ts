import { describe, expect, it } from 'vitest';
import { Cannon, SETTLED_SHOT_AGE, type CannonMotion } from './Cannon.ts';
import { LaserPool } from './Laser.ts';

describe('Cannon', () => {
  it('eases toward the target angle over fixed steps', () => {
    const cannon = new Cannon();
    for (let i = 0; i < 60; i++) {
      cannon.beginStep();
      cannon.turnTowards(0.5, 1 / 60);
    }
    expect(cannon.angle).toBeCloseTo(0.5, 3);
  });

  it('never points too far from vertical', () => {
    const cannon = new Cannon();
    cannon.snapTo(10);
    expect(cannon.angle).toBeLessThan(Math.PI / 2);
    cannon.snapTo(-10);
    expect(cannon.angle).toBeGreaterThan(-Math.PI / 2);
  });

  it('interpolates between the previous and the current angle', () => {
    const cannon = new Cannon();
    cannon.beginStep();
    cannon.snapTo(0.4);
    expect(cannon.interpolated(0.5)).toBeCloseTo(0.2);
  });

  it('turns like a damped spring: speeds up, then settles without overshooting', () => {
    const cannon = new Cannon();
    const steps: number[] = [];
    let previous = 0;
    for (let i = 0; i < 40; i++) {
      cannon.beginStep();
      cannon.turnTowards(1, 1 / 60);
      steps.push(cannon.angle - previous);
      previous = cannon.angle;
      expect(cannon.angle).toBeLessThanOrEqual(1 + 1e-6);
    }
    // Ease in (the first step is not the biggest), ease out (the last steps are tiny).
    expect(Math.max(...steps)).toBeGreaterThan(steps[0] ?? 0);
    expect(steps.at(-1) ?? 1).toBeLessThan(0.002);
  });

  it('a snap stops the turn (the next turn starts from rest)', () => {
    const cannon = new Cannon();
    for (let i = 0; i < 5; i++) cannon.turnTowards(1, 1 / 60);
    cannon.snapTo(0.2);
    cannon.turnTowards(0.2, 1 / 60);
    expect(cannon.angle).toBeCloseTo(0.2, 6);
  });

  it('kicks back the barrel that fired and returns it to rest quickly', () => {
    const cannon = new Cannon();
    cannon.beginStep();
    cannon.kick();
    expect(cannon.recoil).toEqual([1, 0]);
    expect(cannon.interpolatedRecoil(0.5)).toBeCloseTo(0.5);
    for (let i = 0; i < 9; i++) {
      cannon.beginStep();
      cannon.recover(1 / 60);
    }
    expect(cannon.recoil[0]).toBe(0);
    cannon.kick(1);
    expect(cannon.recoil).toEqual([0, 1]);
  });

  it('counts shots and ages each barrel’s muzzle effects, capped once they are over', () => {
    const cannon = new Cannon();
    cannon.kick(0);
    cannon.kick(1);
    expect(cannon.shots).toBe(2);
    expect(cannon.shotAge).toEqual([0, 0]);
    cannon.beginStep();
    cannon.recover(0.25);
    expect(cannon.shotAge).toEqual([0.25, 0.25]);
    for (let i = 0; i < 10; i++) cannon.recover(0.25);
    expect(cannon.shotAge).toEqual([SETTLED_SHOT_AGE, SETTLED_SHOT_AGE]);
  });

  it('writes the interpolated motion for the renderer', () => {
    const cannon = new Cannon();
    cannon.kick(0);
    cannon.kick(1);
    cannon.beginStep();
    cannon.snapTo(0.4);
    cannon.recover(0.1);
    const motion: CannonMotion = { angle: 0, recoil: [0, 0], shotAge: [0, 0], shotSeed: [0, 0] };
    cannon.writeMotion(0.5, motion);
    expect(motion.angle).toBeCloseTo(0.2);
    expect(motion.shotAge[1]).toBeCloseTo(0.05);
    expect(motion.shotSeed).toEqual([0, 1]);
  });

  it('reset() clears recoil, shots and the muzzle effects', () => {
    const cannon = new Cannon();
    cannon.kick();
    cannon.reset();
    expect(cannon.recoil).toEqual([0, 0]);
    expect(cannon.shots).toBe(0);
    expect(cannon.shotAge).toEqual([SETTLED_SHOT_AGE, SETTLED_SHOT_AGE]);
  });
});

describe('LaserPool', () => {
  it('reuses inactive lasers instead of allocating', () => {
    const pool = new LaserPool(2);
    const first = pool.fire(0, 0, 1, 1, 0.1);
    pool.update(0.2);
    expect(pool.activeCount).toBe(0);
    const second = pool.fire(0, 0, 2, 2, 0.1);
    expect(second).toBe(first);
  });

  it('recycles the laser closest to fading when full', () => {
    const pool = new LaserPool(2);
    const a = pool.fire(0, 0, 1, 1, 0.1);
    pool.fire(0, 0, 1, 1, 0.5);
    const c = pool.fire(0, 0, 3, 3, 0.2);
    expect(c).toBe(a);
    expect(pool.activeCount).toBe(2);
    expect(c?.x1).toBe(3);
  });

  it('fades lasers out over their lifetime', () => {
    const pool = new LaserPool(1);
    const laser = pool.fire(0, 0, 1, 1, 0.1);
    pool.update(0.05);
    expect(laser?.active).toBe(true);
    expect(laser?.life).toBeCloseTo(0.05);
    pool.update(0.06);
    expect(laser?.active).toBe(false);
  });

  it('clear() deactivates everything', () => {
    const pool = new LaserPool(3);
    pool.fire(0, 0, 1, 1, 1);
    pool.fire(0, 0, 1, 1, 1);
    pool.clear();
    expect(pool.activeCount).toBe(0);
  });
});
