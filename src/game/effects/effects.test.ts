import { describe, expect, it } from 'vitest';
import { createRng } from '../../utils/rng.ts';
import { Effects } from './Effects.ts';
import {
  emitArmorBreak,
  emitBlast,
  emitBreach,
  emitExplosion,
  emitGlyphs,
  emitImpact,
  emitScorePopup,
  emitShieldUp,
} from './emitters.ts';
import { ScreenFlash } from './flash.ts';
import { ParticlePool, type Particle } from './particles.ts';
import { SHAKE_MAX_OFFSET, ScreenShake } from './shake.ts';

const active = (pool: ParticlePool): Particle[] => pool.items.filter((p) => p.active);

function run(update: (dt: number) => void, seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) update(1 / 60);
}

describe('ParticlePool', () => {
  it('spawns a particle with defaults reset', () => {
    const pool = new ParticlePool(4);
    const first = pool.spawn('glyph', 'danger', 1, 2, 0.5);
    if (!first) throw new Error('no particle');
    first.vx = 99;
    first.glyph = 'x';
    first.life = 0;
    pool.update(1 / 60); // dies
    const again = pool.spawn('spark', 'primary', 5, 6, 1);
    expect(again).toBe(first);
    expect(again).toMatchObject({ kind: 'spark', color: 'primary', x: 5, y: 6, prevX: 5, vx: 0, glyph: '' });
  });

  it('moves particles with drag and gravity, remembering the previous position', () => {
    const pool = new ParticlePool(1);
    const p = pool.spawn('spark', 'primary', 0, 0, 1);
    if (!p) throw new Error('no particle');
    p.vx = 100;
    p.gravity = 600;
    pool.update(0.1);
    expect(p.prevX).toBe(0);
    expect(p.x).toBeCloseTo(10);
    expect(p.vy).toBeCloseTo(60);
    p.drag = 5;
    const vx = p.vx;
    pool.update(0.1);
    expect(p.vx).toBeLessThan(vx);
  });

  it('deactivates particles when their life runs out', () => {
    const pool = new ParticlePool(2);
    pool.spawn('glow', 'text', 0, 0, 0.1);
    pool.update(0.05);
    expect(pool.activeCount).toBe(1);
    pool.update(0.06);
    expect(pool.activeCount).toBe(0);
  });
});

describe('emitters', () => {
  it('impact sprays sparks along the laser direction', () => {
    const pool = new ParticlePool(100);
    emitImpact(pool, createRng(1), 50, 50, 0, 1); // laser pointing straight up
    const sparks = active(pool).filter((p) => p.kind === 'spark');
    expect(sparks.length).toBeGreaterThan(0);
    for (const spark of sparks) expect(spark.vy).toBeLessThan(0); // keep going up
    expect(active(pool).some((p) => p.kind === 'ring')).toBe(true);
  });

  it('explosion turns every letter into a glyph particle at its position', () => {
    const pool = new ParticlePool(200);
    emitExplosion(pool, createRng(2), 'gato', 100, 10, 40, 1);
    const glyphs = active(pool).filter((p) => p.kind === 'glyph');
    expect(glyphs.map((p) => p.glyph)).toEqual(['g', 'a', 't', 'o']);
    expect(glyphs.map((p) => p.x)).toEqual([105, 115, 125, 135]);
    expect(active(pool).filter((p) => p.kind === 'spark').length).toBeGreaterThan(10);
  });

  it('glyphs on the left fly left and on the right fly right (on average)', () => {
    const pool = new ParticlePool(50);
    emitGlyphs(pool, createRng(3), 'abcdefghij', 0, 10, 0, 'text');
    const glyphs = active(pool);
    const left = glyphs.slice(0, 3).reduce((sum, p) => sum + p.vx, 0);
    const right = glyphs.slice(-3).reduce((sum, p) => sum + p.vx, 0);
    expect(left).toBeLessThan(0);
    expect(right).toBeGreaterThan(0);
  });

  it('breach uses the danger color', () => {
    const pool = new ParticlePool(200);
    emitBreach(pool, createRng(4), 'mar', 0, 10, 500, 1);
    expect(active(pool).every((p) => p.color === 'danger')).toBe(true);
  });

  it('scale reduces particle counts', () => {
    const full = new ParticlePool(400);
    const half = new ParticlePool(400);
    emitExplosion(full, createRng(5), 'planeta', 0, 10, 0, 1);
    emitExplosion(half, createRng(5), 'planeta', 0, 10, 0, 0.5);
    expect(half.activeCount).toBeLessThan(full.activeCount);
  });

  it('is deterministic for the same seed', () => {
    const a = new ParticlePool(200);
    const b = new ParticlePool(200);
    emitExplosion(a, createRng(6), 'luz', 0, 10, 0, 1);
    emitExplosion(b, createRng(6), 'luz', 0, 10, 0, 1);
    expect(a.items).toEqual(b.items);
  });

  it('never overflows a small pool', () => {
    const pool = new ParticlePool(5);
    emitExplosion(pool, createRng(7), 'paralelepípedo', 0, 10, 0, 1);
    expect(pool.items).toHaveLength(5);
  });
});

describe('ScreenShake', () => {
  it('does not move without trauma', () => {
    const shake = new ScreenShake();
    shake.update(0.1);
    expect(shake.offsetX()).toBe(0);
    expect(shake.offsetY()).toBe(0);
  });

  it('stays within the maximum offset and clamps trauma to 1', () => {
    const shake = new ScreenShake();
    shake.add(5);
    expect(shake.trauma).toBe(1);
    for (let i = 0; i < 120; i++) {
      shake.update(1 / 60);
      expect(Math.abs(shake.offsetX())).toBeLessThanOrEqual(SHAKE_MAX_OFFSET);
      expect(Math.abs(shake.offsetY())).toBeLessThanOrEqual(SHAKE_MAX_OFFSET);
    }
  });

  it('decays back to rest', () => {
    const shake = new ScreenShake();
    shake.add(1);
    run((dt) => shake.update(dt), 1);
    expect(shake.trauma).toBe(0);
  });
});

describe('ScreenFlash', () => {
  it('fades out linearly', () => {
    const flash = new ScreenFlash();
    flash.trigger('danger', 0.4, 0.2);
    expect(flash.alpha).toBeCloseTo(0.4);
    flash.update(0.1);
    expect(flash.alpha).toBeCloseTo(0.2);
    flash.update(0.2);
    expect(flash.alpha).toBe(0);
  });

  it('a weaker flash does not cut a stronger one', () => {
    const flash = new ScreenFlash();
    flash.trigger('danger', 0.3, 0.3);
    flash.trigger('text', 0.05, 0.1);
    expect(flash.color).toBe('danger');
    expect(flash.alpha).toBeCloseTo(0.3);
  });
});

describe('Phase 3 emitters', () => {
  it('score popup is a rising text particle', () => {
    const pool = new ParticlePool(4);
    emitScorePopup(pool, 10, 20, '+120', 'combo');
    const [p] = active(pool);
    expect(p).toMatchObject({ kind: 'glyph', glyph: '+120', color: 'combo', x: 10, y: 20, spin: 0 });
    expect(p?.vy).toBeLessThan(0);
  });

  it('armor break sparks across the word width', () => {
    const pool = new ParticlePool(100);
    emitArmorBreak(pool, createRng(8), 100, 60, 50, 1);
    const sparks = active(pool).filter((p) => p.kind === 'spark');
    expect(sparks.length).toBeGreaterThan(5);
    for (const s of sparks) {
      expect(s.x).toBeGreaterThanOrEqual(100);
      expect(s.x).toBeLessThanOrEqual(160);
    }
  });

  it('blast ring grows to the requested radius', () => {
    const pool = new ParticlePool(4);
    emitBlast(pool, 0, 0, 300, 'primary', 0.5);
    expect(active(pool).find((p) => p.kind === 'ring')).toMatchObject({ sizeEnd: 300, color: 'primary' });
  });

  it('shield pickup glows rise', () => {
    const pool = new ParticlePool(40);
    emitShieldUp(pool, createRng(9), 0, 0);
    for (const p of active(pool).filter((q) => q.kind === 'glow')) expect(p.vy).toBeLessThan(0);
  });
});

describe('Effects', () => {
  it('bomb and EMP blasts shake and flash, and respect reduced effects', () => {
    const fx = new Effects(false);
    fx.bomb(0, 0, 100);
    expect(fx.flash.color).toBe('combo');
    fx.emp(0, 0, 1000);
    expect(fx.flash.color).toBe('primary');
    expect(fx.shake.trauma).toBeGreaterThan(0.5);

    const reduced = new Effects(true);
    reduced.bomb(0, 0, 100);
    reduced.emp(0, 0, 1000);
    expect(reduced.shake.trauma).toBe(0);
    expect(reduced.flash.alpha).toBe(0);
    expect(reduced.particles.activeCount).toBeGreaterThan(0);
  });

  it('area kills explode smaller and without their own shake', () => {
    const typed = new Effects(false);
    const area = new Effects(false);
    typed.explosion('planeta', 0, 10, 100);
    area.explosion('planeta', 0, 10, 100, true);
    expect(area.particles.activeCount).toBeLessThan(typed.particles.activeCount);
    expect(area.shake.trauma).toBe(0);
  });

  it('a harmless breach (Zen) only fades the letters', () => {
    const fx = new Effects(false);
    fx.breach('mar', 0, 10, 500, false);
    expect(fx.perimeterPulse).toBe(0);
    expect(fx.shake.trauma).toBe(0);
    expect(fx.particles.items.filter((p) => p.active).every((p) => p.kind === 'glyph')).toBe(true);
  });

  it('shakes and flashes on destroy and breach', () => {
    const fx = new Effects(false);
    fx.explosion('sol', 0, 10, 100);
    expect(fx.shake.trauma).toBeGreaterThan(0);
    expect(fx.flash.alpha).toBeGreaterThan(0);
    fx.breach('mar', 0, 10, 500);
    expect(fx.flash.color).toBe('danger');
    expect(fx.perimeterPulse).toBe(1);
  });

  it('"Reduzir efeitos" removes shake and flash but keeps particles and the perimeter cue', () => {
    const fx = new Effects(true);
    fx.explosion('sol', 0, 10, 100);
    fx.breach('mar', 0, 10, 500);
    expect(fx.shake.trauma).toBe(0);
    expect(fx.flash.alpha).toBe(0);
    expect(fx.particles.activeCount).toBeGreaterThan(0);
    expect(fx.perimeterPulse).toBe(1);
  });

  it('"Reduzir efeitos" emits fewer particles', () => {
    const full = new Effects(false);
    const reduced = new Effects(true);
    full.explosion('planeta', 0, 10, 100);
    reduced.explosion('planeta', 0, 10, 100);
    expect(reduced.particles.activeCount).toBeLessThan(full.particles.activeCount);
  });

  it('everything settles after a while', () => {
    const fx = new Effects(false);
    fx.explosion('sol', 0, 10, 100);
    fx.breach('mar', 0, 10, 500);
    fx.impact(10, 10, 0);
    run((dt) => fx.update(dt), 2);
    expect(fx.particles.activeCount).toBe(0);
    expect(fx.shake.trauma).toBe(0);
    expect(fx.flash.alpha).toBe(0);
    expect(fx.perimeterPulse).toBe(0);
  });

  it('clear() resets all effects', () => {
    const fx = new Effects(false);
    fx.breach('mar', 0, 10, 500);
    fx.clear();
    expect(fx.particles.activeCount).toBe(0);
    expect(fx.shake.trauma).toBe(0);
    expect(fx.flash.alpha).toBe(0);
    expect(fx.perimeterPulse).toBe(0);
  });
});
