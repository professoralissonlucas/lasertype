import { describe, expect, it } from 'vitest';
import { Cannon } from './Cannon.ts';
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
