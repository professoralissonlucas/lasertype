// Live preview of a cosmetic in a mini canvas: the scripted scene (previewScript.ts) drawn
// with the same functions and effects as the game, so what you see is what you get.
import { CONFIG } from '../config.ts';
import type { ResolvedCosmetics } from '../cosmetics/types.ts';
import { Effects } from '../game/effects/Effects.ts';
import { Cannon } from '../game/entities/Cannon.ts';
import { LaserPool } from '../game/entities/Laser.ts';
import { BackgroundState } from '../game/render/background.ts';
import { drawBackground } from '../game/render/drawBackground.ts';
import { barrelOf, createCannonPose, drawCannon, muzzleSideOffset } from '../game/render/drawCannon.ts';
import { drawBeams, drawParticles } from '../game/render/drawFx.ts';
import { drawWord, type WordMetrics, type WordVisual } from '../game/render/drawWord.ts';
import { LAYOUT } from '../game/render/layout.ts';
import { PALETTE } from '../game/render/palette.ts';
import { WORD_FONT_FAMILY } from '../game/render/renderer.ts';
import { Skin } from '../game/render/skin.ts';
import { FixedTimestep } from '../game/timestep.ts';
import { aimAngle } from '../utils/math.ts';
import { createRng } from '../utils/rng.ts';
import { el } from './dom.ts';
import { PreviewScript, type PreviewCue } from './previewScript.ts';

/** The scene is laid out in a virtual space this tall, scaled to the canvas. */
const VIRTUAL_HEIGHT = 230;
const FONT_SIZE = 18;
const LASER_LIFETIME = 0.12;
const CANNON_OFFSET = 26;
const PERIMETER_OFFSET = 66;
/** Target word: horizontal center (fraction of the width), top line and drift (px/s). */
const TARGET_X = 0.42;
const TARGET_Y = 62;
const TARGET_DRIFT = 10;
/** A second, idle word shows the normal (unlocked) plate when there is room. */
const IDLE_WORD = 'nebula';
const IDLE_X = 0.8;
const IDLE_Y = 34;
const IDLE_MIN_WIDTH = 330;
const FADE_IN = 0.25;

export class ShopPreview {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly timestep = new FixedTimestep(CONFIG.updatesPerSecond, CONFIG.maxFrameSeconds);
  private readonly background = new BackgroundState(createRng('preview-stars'));
  private readonly lasers = new LaserPool(8);
  private readonly cannon = new Cannon();
  private readonly pose = createCannonPose();
  private readonly script = new PreviewScript();
  private readonly cues: PreviewCue[] = [];
  private readonly nebulaMatrix = new DOMMatrix();
  private readonly metrics: WordMetrics = { x: 0, y: 0, fontSize: FONT_SIZE, charWidth: 10, padX: LAYOUT.wordPadX, dpr: 1 };
  private readonly target = { text: '', typed: 0, kind: 'normal', armor: 0 } satisfies WordVisual;
  private readonly idle: WordVisual = { text: IDLE_WORD, typed: 0, kind: 'normal', armor: 0 };
  private readonly font = `${FONT_SIZE}px ${WORD_FONT_FAMILY}`;
  private skin: Skin;
  private nebula: CanvasPattern | null = null;
  private effects: Effects;
  private reduced: boolean;
  private observer: ResizeObserver | null = null;
  private rafId: number | null = null;
  private lastTime: number | null = null;
  private time = 0;
  private aimHold = 0;
  /** Virtual size and the scale/DPR that maps it to the backing store. */
  private width = 1;
  private height = VIRTUAL_HEIGHT;
  private scale = 1;
  private dpr = 1;
  private charWidth = 10;

  constructor(cosmetics: ResolvedCosmetics, reduced: boolean) {
    this.canvas = el('canvas', 'shop__canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d');
    this.reduced = reduced;
    this.skin = new Skin(cosmetics);
    this.effects = new Effects(reduced, 'preview-fx', cosmetics.explosion);
    this.applySkin();
  }

  setCosmetics(cosmetics: ResolvedCosmetics): void {
    if (cosmetics === this.skin.cosmetics) return;
    this.skin = new Skin(cosmetics);
    this.effects.explosionStyle = cosmetics.explosion;
    this.applySkin();
  }

  /** "Reduzir efeitos": still background and half the particles. */
  setReducedEffects(reduced: boolean): void {
    if (reduced === this.reduced) return;
    this.reduced = reduced;
    this.effects = new Effects(reduced, 'preview-fx', this.skin.cosmetics.explosion);
  }

  start(): void {
    if (this.rafId !== null) return;
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(this.canvas);
    this.resize();
    this.lastTime = null;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.observer?.disconnect();
    this.observer = null;
  }

  private applySkin(): void {
    this.nebula = this.ctx?.createPattern(this.skin.nebula, 'repeat') ?? null;
  }

  private readonly resize = (): void => {
    const ctx = this.ctx;
    if (!ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width);
    const cssHeight = Math.max(1, rect.height);
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(cssWidth * this.dpr);
    this.canvas.height = Math.round(cssHeight * this.dpr);
    this.scale = cssHeight / VIRTUAL_HEIGHT;
    this.width = cssWidth / this.scale;
    this.height = VIRTUAL_HEIGHT;
    ctx.font = this.font;
    this.charWidth = ctx.measureText('M').width;
    this.metrics.charWidth = this.charWidth;
    this.metrics.dpr = this.dpr * this.scale;
  };

  private readonly frame = (now: number): void => {
    const dt = this.lastTime === null ? 0 : (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.time += dt;
    const steps = this.timestep.advance(dt);
    for (let i = 0; i < steps; i++) this.update(this.timestep.step);
    this.draw(this.timestep.alpha);
    this.rafId = requestAnimationFrame(this.frame);
  };

  private get cannonX(): number {
    return this.width / 2;
  }

  private get cannonY(): number {
    return this.height - CANNON_OFFSET;
  }

  private targetStartX(): number {
    const width = this.script.word.length * this.charWidth;
    return this.width * TARGET_X - width / 2;
  }

  private targetY(): number {
    return TARGET_Y + this.script.age * TARGET_DRIFT;
  }

  private update(dt: number): void {
    this.cannon.beginStep();
    this.script.step(dt, this.cues);
    this.aim(dt);
    this.cannon.recover(dt);
    this.lasers.update(dt);
    this.effects.update(dt);
    if (!this.reduced) this.background.update(dt);
    for (const cue of this.cues) this.handle(cue);
    this.cues.length = 0;
  }

  /** Tracks the next letter between shots; rests upright between words. */
  private aim(dt: number): void {
    if (this.aimHold > 0) {
      this.aimHold = Math.max(0, this.aimHold - dt);
      return;
    }
    const word = this.script.word;
    let goal = 0;
    if (word) {
      const index = Math.min(this.script.typed, word.length - 1);
      const x = this.targetStartX() + (index + 0.5) * this.charWidth;
      goal = aimAngle(this.cannonX, this.cannonY, x, this.targetY());
    }
    this.cannon.turnTowards(goal, dt);
  }

  private handle(cue: PreviewCue): void {
    switch (cue.type) {
      case 'spawn':
        break;
      case 'hit': {
        const x = this.targetStartX() + (cue.index + 0.5) * this.charWidth;
        const y = this.targetY();
        const angle = aimAngle(this.cannonX, this.cannonY, x, y);
        this.cannon.snapTo(angle);
        const shot = this.cannon.shots;
        this.cannon.kick(barrelOf(this.skin.cosmetics.cannon, shot));
        this.aimHold = LASER_LIFETIME;
        const a = this.cannon.angle;
        const side = muzzleSideOffset(this.skin.cosmetics.cannon, shot);
        const mx = this.cannonX + Math.sin(a) * LAYOUT.barrelLength + Math.cos(a) * side;
        const my = this.cannonY - Math.cos(a) * LAYOUT.barrelLength + Math.sin(a) * side;
        this.lasers.fire(mx, my, x, y, LASER_LIFETIME);
        this.effects.impact(x, y, a);
        break;
      }
      case 'destroy':
        this.effects.explosion(cue.word, this.targetStartX(), this.charWidth, this.targetY());
        break;
    }
  }

  private draw(alpha: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { width, height, skin } = this;
    const k = this.dpr * this.scale;
    ctx.setTransform(k, 0, 0, k, 0, 0);

    drawBackground(ctx, skin, this.nebula, this.nebulaMatrix, this.background, alpha, width, height);

    // Perimeter line, for context.
    const perimeterY = height - PERIMETER_OFFSET;
    ctx.save();
    ctx.strokeStyle = PALETTE.danger;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(0, perimeterY);
    ctx.lineTo(width, perimeterY);
    ctx.stroke();
    ctx.restore();

    ctx.font = this.font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const m = this.metrics;
    if (width >= IDLE_MIN_WIDTH) {
      m.x = width * IDLE_X - (IDLE_WORD.length * this.charWidth) / 2;
      m.y = IDLE_Y + Math.sin(this.time * 0.9) * 3;
      drawWord(ctx, skin, this.idle, false, m, false);
    }
    const word = this.script.word;
    if (word) {
      this.target.text = word;
      this.target.typed = this.script.typed;
      m.x = this.targetStartX();
      m.y = this.targetY();
      ctx.globalAlpha = Math.min(1, this.script.age / FADE_IN);
      drawWord(ctx, skin, this.target, true, m, false);
      ctx.globalAlpha = 1;
    }

    drawParticles(ctx, this.effects.particles, alpha, skin, this.font);
    drawBeams(ctx, this.lasers, skin, k);
    const pose = this.pose;
    this.cannon.writeMotion(alpha, pose);
    // The core charges up as the word is shot, so the preview shows it working.
    pose.energy = word ? 0.3 + (0.6 * this.script.typed) / word.length : 0.3;
    pose.time = this.time;
    pose.reduced = this.reduced;
    drawCannon(ctx, skin, this.cannonX, this.cannonY, pose);
  }
}
