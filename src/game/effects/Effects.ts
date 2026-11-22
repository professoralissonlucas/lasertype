// Visual effects state: particles, screen shake, flash, perimeter pulse. No DOM/canvas.
import { DEFAULT_COSMETICS } from '../../cosmetics/equip.ts';
import type { ExplosionParams } from '../../cosmetics/types.ts';
import type { Boss } from '../entities/Boss.ts';
import { createRng, type Rng } from '../../utils/rng.ts';
import {
  emitArmorBreak,
  emitBlast,
  emitBossBlast,
  emitBossFinale,
  emitBossFragments,
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
const BOSS_ENTER_TRAUMA = 0.45;
const BOSS_WORD_TRAUMA = 0.5;
const BOSS_BLAST_TRAUMA = 0.35;
const BOSS_FINALE_TRAUMA = 1;
const BOSS_BREACH_TRAUMA = 1;
const DESTROY_FLASH = { intensity: 0.07, duration: 0.09 } as const;
const BREACH_FLASH = { intensity: 0.22, duration: 0.28 } as const;
const BOMB_FLASH = { intensity: 0.14, duration: 0.18 } as const;
const EMP_FLASH = { intensity: 0.3, duration: 0.35 } as const;
const BOSS_WORD_FLASH = { intensity: 0.1, duration: 0.14 } as const;
const BOSS_FINALE_FLASH = { intensity: 0.38, duration: 0.7 } as const;
const BOSS_BREACH_FLASH = { intensity: 0.32, duration: 0.45 } as const;
/** A defeated boss goes off in a chain of small blasts and then the finale. */
const BOSS_CHAIN_BLASTS = 6;
const BOSS_CHAIN_STEP = 0.13;
const BOSS_FINALE_DELAY = BOSS_CHAIN_BLASTS * BOSS_CHAIN_STEP + 0.12;
/** Seconds the perimeter keeps glowing after a breach. */
const PERIMETER_PULSE = 0.6;

/** The hull of a defeated boss, drawn until the finale (`heat` 0 → 1). */
export interface BossWreck {
  readonly boss: Readonly<Boss>;
  heat: number;
}

/** Something that goes off a little later (the chain of a defeated boss). */
interface Delayed {
  wait: number;
  readonly run: () => void;
}

export class Effects {
  readonly particles = new ParticlePool(PARTICLE_CAPACITY);
  readonly shake = new ScreenShake();
  readonly flash = new ScreenFlash();
  /** 0..1: extra glow on the perimeter line after a breach. */
  perimeterPulse = 0;
  wreck: BossWreck | null = null;
  /** With "Reduzir efeitos": no shake, no flash, half the particles. */
  readonly reduced: boolean;
  /** Equipped explosion cosmetic (visual only). */
  explosionStyle: ExplosionParams;
  private readonly rng: Rng;
  private readonly scale: number;
  private delayed: Delayed[] = [];

  constructor(reduced: boolean, seed: string = 'fx', explosionStyle: ExplosionParams = DEFAULT_COSMETICS.explosion) {
    this.reduced = reduced;
    this.scale = reduced ? REDUCED_PARTICLE_SCALE : 1;
    this.rng = createRng(seed);
    this.explosionStyle = explosionStyle;
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
      this.explosionStyle,
    );
    if (area) return;
    this.kick(DESTROY_TRAUMA, 'text', DESTROY_FLASH);
  }

  /** Floating score text at (x, y). */
  scorePopup(x: number, y: number, points: number): void {
    emitScorePopup(this.particles, x, y, `+${points}`, 'combo');
  }

  /** The boss starts to descend. */
  bossEnter(): void {
    if (!this.reduced) this.shake.add(BOSS_ENTER_TRAUMA);
  }

  /** A word of the boss broke: its letters fly and pieces of hull come off. */
  bossWord(text: string, startX: number, charWidth: number, y: number): void {
    emitGlyphs(this.particles, this.rng, text, startX, charWidth, y, 'text');
    emitBossFragments(this.particles, this.rng, startX, text.length * charWidth, y, this.scale);
    this.kick(BOSS_WORD_TRAUMA, 'danger', BOSS_WORD_FLASH);
  }

  /**
   * The boss was defeated: a chain of blasts over its hull (centered at x, y), then it flies
   * apart in one that fills the screen.
   */
  bossDefeated(boss: Readonly<Boss>, x: number, y: number, width: number, height: number, reach: number): void {
    const { particles, rng, scale } = this;
    this.wreck = { boss, heat: 0 };
    for (let i = 0; i < BOSS_CHAIN_BLASTS; i++) {
      const bx = x + (rng.next() - 0.5) * width;
      const by = y + (rng.next() - 0.5) * height;
      this.later(i * BOSS_CHAIN_STEP, () => {
        emitBossBlast(particles, rng, bx, by, 46 + height * 0.35, scale);
        if (!this.reduced) this.shake.add(BOSS_BLAST_TRAUMA);
      });
    }
    this.later(BOSS_FINALE_DELAY, () => {
      this.wreck = null;
      emitBossFinale(particles, rng, x, y, reach, scale);
      for (const row of [-0.3, 0, 0.3]) emitBossFragments(particles, rng, x - width / 2, width, y + row * height, scale);
      this.kick(BOSS_FINALE_TRAUMA, 'blast', BOSS_FINALE_FLASH);
    });
  }

  /** The boss crashed into the perimeter at (x, y) with `width` px of hull. */
  bossBreach(x: number, y: number, width: number, damage: boolean): void {
    emitBossFragments(this.particles, this.rng, x - width / 2, width, y, this.scale);
    if (!damage) return;
    emitBlast(this.particles, x, y, width * 0.75, 'danger', 0.5);
    this.perimeterPulse = 1;
    this.kick(BOSS_BREACH_TRAUMA, 'danger', BOSS_BREACH_FLASH);
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
    if (this.delayed.length > 0) this.runDelayed(dt);
    if (this.wreck) this.wreck.heat = Math.min(1, this.wreck.heat + dt / BOSS_FINALE_DELAY);
    this.particles.update(dt);
    this.shake.update(dt);
    this.flash.update(dt);
    this.perimeterPulse = Math.max(0, this.perimeterPulse - dt / PERIMETER_PULSE);
  }

  clear(): void {
    this.delayed = [];
    this.wreck = null;
    this.particles.clear();
    this.shake.reset();
    this.flash.reset();
    this.perimeterPulse = 0;
  }

  private later(wait: number, run: () => void): void {
    this.delayed.push({ wait, run });
  }

  private runDelayed(dt: number): void {
    const due: Delayed[] = [];
    for (const entry of this.delayed) {
      entry.wait -= dt;
      if (entry.wait <= 0) due.push(entry);
    }
    if (due.length === 0) return;
    this.delayed = this.delayed.filter((entry) => entry.wait > 0);
    for (const entry of due) entry.run();
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
