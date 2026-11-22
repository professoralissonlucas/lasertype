// Visual effects state: particles, screen shake, flash, perimeter pulse. No DOM/canvas.
import { createRng, type Rng } from '../../utils/rng.ts';
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
import { ParticlePool, type FxColor } from './particles.ts';
import { ScreenShake } from './shake.ts';

const PARTICLE_CAPACITY = 900;
/** Particle counts with "Reduzir efeitos". */
const REDUCED_PARTICLE_SCALE = 0.5;
/** Words caught in a bomb/EMP blast explode smaller (the blast itself is the big event). */
const AREA_KILL_SCALE = 0.4;

const DESTROY_TRAUMA = 0.35;
const BREACH_TRAUMA = 0.8;
const BOMB_TRAUMA = 0.55;
const EMP_TRAUMA = 0.7;
const DESTROY_FLASH = { intensity: 0.07, duration: 0.09 } as const;
const BREACH_FLASH = { intensity: 0.22, duration: 0.28 } as const;
const BOMB_FLASH = { intensity: 0.14, duration: 0.18 } as const;
const EMP_FLASH = { intensity: 0.3, duration: 0.35 } as const;
/** Seconds the perimeter keeps glowing after a breach. */
const PERIMETER_PULSE = 0.6;

export class Effects {
  readonly particles = new ParticlePool(PARTICLE_CAPACITY);
  readonly shake = new ScreenShake();
  readonly flash = new ScreenFlash();
  /** 0..1: extra glow on the perimeter line after a breach. */
  perimeterPulse = 0;
  /** With "Reduzir efeitos": no shake, no flash, half the particles. */
  readonly reduced: boolean;
  private readonly rng: Rng;
  private readonly scale: number;

  constructor(reduced: boolean, seed: string = 'fx') {
    this.reduced = reduced;
    this.scale = reduced ? REDUCED_PARTICLE_SCALE : 1;
    this.rng = createRng(seed);
  }

  /** A laser reached a letter at (x, y), travelling at angle `aim`. */
  impact(x: number, y: number, aim: number): void {
    emitImpact(this.particles, this.rng, x, y, aim, this.scale);
  }

  /**
   * A word was destroyed. `startX` = left edge of its text, `y` = its center line.
   * `area`: caught in a bomb/EMP blast (smaller burst, no shake/flash of its own).
   */
  explosion(text: string, startX: number, charWidth: number, y: number, area = false): void {
    emitExplosion(
      this.particles,
      this.rng,
      text,
      startX,
      charWidth,
      y,
      this.scale * (area ? AREA_KILL_SCALE : 1),
    );
    if (area) return;
    this.kick(DESTROY_TRAUMA, 'text', DESTROY_FLASH);
  }

  /** Floating score text at (x, y). */
  scorePopup(x: number, y: number, points: number): void {
    emitScorePopup(this.particles, x, y, `+${points}`, 'combo');
  }

  /** An armored word lost a plate. */
  armorBreak(startX: number, width: number, y: number): void {
    emitArmorBreak(this.particles, this.rng, startX, width, y, this.scale);
  }

  /** Bomb blast centered at (x, y) reaching `radius` px. */
  bomb(x: number, y: number, radius: number): void {
    emitBlast(this.particles, x, y, radius, 'combo', 0.4);
    this.kick(BOMB_TRAUMA, 'combo', BOMB_FLASH);
  }

  /** EMP shockwave from the cannon sweeping the whole screen. */
  emp(x: number, y: number, radius: number): void {
    emitBlast(this.particles, x, y, radius, 'primary', 0.6);
    this.kick(EMP_TRAUMA, 'primary', EMP_FLASH);
  }

  /** Shield restored (glow over the cannon at x, y). */
  shieldUp(x: number, y: number): void {
    emitShieldUp(this.particles, this.rng, x, y);
  }

  /**
   * A word crossed the perimeter. `startX` = left edge of its text, `y` = the perimeter line.
   * Without `damage` (Zen) the word just fades out through the line.
   */
  breach(text: string, startX: number, charWidth: number, y: number, damage = true): void {
    if (!damage) {
      emitGlyphs(this.particles, this.rng, text, startX, charWidth, y, 'text');
      return;
    }
    emitBreach(this.particles, this.rng, text, startX, charWidth, y, this.scale);
    // The perimeter pulse stays on with reduced effects: it is the local damage cue
    // that replaces the full-screen flash.
    this.perimeterPulse = 1;
    this.kick(BREACH_TRAUMA, 'danger', BREACH_FLASH);
  }

  update(dt: number): void {
    this.particles.update(dt);
    this.shake.update(dt);
    this.flash.update(dt);
    this.perimeterPulse = Math.max(0, this.perimeterPulse - dt / PERIMETER_PULSE);
  }

  clear(): void {
    this.particles.clear();
    this.shake.reset();
    this.flash.reset();
    this.perimeterPulse = 0;
  }

  /** Screen shake + flash, both skipped with "Reduzir efeitos". */
  private kick(
    trauma: number,
    color: FxColor,
    flash: { readonly intensity: number; readonly duration: number },
  ): void {
    if (this.reduced) return;
    this.shake.add(trauma);
    this.flash.trigger(color, flash.intensity, flash.duration);
  }
}
