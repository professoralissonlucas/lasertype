// Canvas 2D drawing. Reads game state, never changes it.
import { lerp } from '../../utils/math.ts';
import { createRng } from '../../utils/rng.ts';
import type { Effects } from '../effects/Effects.ts';
import type { ScreenFlash } from '../effects/flash.ts';
import type { FxColor, ParticlePool } from '../effects/particles.ts';
import type { LaserPool } from '../entities/Laser.ts';
import type { Word } from '../entities/Word.ts';
import type { MatchState } from '../state.ts';
import type { SpecialKind, WordKind } from '../types.ts';
import { isEmpReady } from '../combo.ts';
import { generateNebula, NEBULA_SIZE, type BackgroundState } from './background.ts';
import { computeLayout, LAYOUT, toScreenY, wordStartX, type Layout } from './layout.ts';
import { hexToRgb, PALETTE, withAlpha } from './palette.ts';

const WORD_FONT_FAMILY = "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace";
const NEBULA_SEED = 'orbital-defense-nebula';
const NEBULA_MAX_ALPHA = 0.2;
const TAU = Math.PI * 2;

/** Spark streak length = velocity × this (seconds). */
const SPARK_STREAK = 0.035;
/** Laser glow radius (CSS px; scaled by DPR because shadowBlur ignores the transform). */
const LASER_GLOW = 16;
const LOCK_GLOW = 10;

const PLATE_FILL = withAlpha(PALETTE.bg, 0.78);
const PLATE_STROKE = withAlpha(PALETTE.muted, 0.35);
const BASE_FILL = withAlpha(PALETTE.muted, 0.35);
const GAUGE_TRACK = withAlpha(PALETTE.muted, 0.3);
/** Max opacity of the icy tint while the ice slow is active. */
const SLOW_TINT = 0.08;

/** Plate border per word kind (when not locked). */
const KIND_STROKE: Readonly<Record<WordKind, string>> = {
  normal: PLATE_STROKE,
  bomb: withAlpha(PALETTE.combo, 0.85),
  ice: withAlpha(PALETTE.primary, 0.65),
  shield: withAlpha(PALETTE.text, 0.85),
  armored: withAlpha(PALETTE.text, 0.5),
};
const KIND_COLOR: Readonly<Record<SpecialKind, string>> = {
  bomb: PALETTE.combo,
  ice: PALETTE.primary,
  shield: PALETTE.text,
  armored: PALETTE.text,
};

export interface RenderFrame {
  /** Null in menus: only the idle station and background are drawn. */
  readonly state: Readonly<MatchState> | null;
  /** Interpolation for words (1 once the match is frozen). */
  readonly alpha: number;
  /** Interpolation for effects and background (always live). */
  readonly fxAlpha: number;
  readonly cannonAngle: number;
  /** 0..1 barrel recoil. */
  readonly recoil: number;
  readonly lasers: LaserPool;
  readonly effects: Effects;
  readonly background: BackgroundState;
  /** A wrong key was pressed very recently. */
  readonly missFlash: boolean;
  /** Seconds of wall-clock animation time (pulses). */
  readonly time: number;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Soft radial blob, drawn once and stamped with 'lighter' (much cheaper than shadowBlur). */
function createGlowSprite(color: string): HTMLCanvasElement {
  const size = 64;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, withAlpha(color, 1));
  gradient.addColorStop(0.25, withAlpha(color, 0.45));
  gradient.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/** Vertical soft band (transparent → color → transparent), stretched under the perimeter. */
function createBandSprite(color: string): HTMLCanvasElement {
  const canvas = createCanvas(1, 64);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const gradient = ctx.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, withAlpha(color, 0));
  gradient.addColorStop(0.5, withAlpha(color, 1));
  gradient.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1, 64);
  return canvas;
}

function createNebulaCanvas(): HTMLCanvasElement {
  const canvas = createCanvas(NEBULA_SIZE, NEBULA_SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const pixels = generateNebula(
    NEBULA_SIZE,
    createRng(NEBULA_SEED),
    hexToRgb(PALETTE.primary),
    hexToRgb(PALETTE.danger),
    NEBULA_MAX_ALPHA,
  );
  const image = ctx.createImageData(NEBULA_SIZE, NEBULA_SIZE);
  image.data.set(pixels);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** Repeating pattern: the GPU wraps the tile, so scrolling has no seam. */
  private readonly nebula: CanvasPattern | null;
  /** Reused every frame to position the pattern (no per-frame allocation). */
  private readonly nebulaMatrix = new DOMMatrix();
  private readonly glow: Readonly<Record<FxColor, HTMLCanvasElement>>;
  private readonly perimeterBand: HTMLCanvasElement;
  private wordFont = '';
  private dpr = 1;
  private watchedDpr = 0;
  private dprQuery: MediaQueryList | null = null;

  /** Current layout in CSS pixels. */
  layout: Layout = computeLayout(1, 1);
  /** Width of one character of the word font, in CSS pixels. */
  charWidth = 1;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.canvas = canvas;
    this.ctx = ctx;
    this.nebula = ctx.createPattern(createNebulaCanvas(), 'repeat');
    this.glow = {
      primary: createGlowSprite(PALETTE.primary),
      text: createGlowSprite(PALETTE.text),
      combo: createGlowSprite(PALETTE.combo),
      danger: createGlowSprite(PALETTE.danger),
    };
    this.perimeterBand = createBandSprite(PALETTE.danger);
  }

  attach(): void {
    window.addEventListener('resize', this.resize);
    // Re-measure once web fonts finish loading (character width may change).
    void document.fonts.ready.then(this.resize);
    this.resize();
  }

  detach(): void {
    window.removeEventListener('resize', this.resize);
    this.dprQuery?.removeEventListener('change', this.resize);
    this.dprQuery = null;
  }

  /** Matches the backing store to the CSS size × devicePixelRatio. */
  readonly resize = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    // Resizing resets the context, so the transform is set afterwards.
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dpr = dpr;

    this.layout = computeLayout(width, height);
    this.wordFont = `${this.layout.fontSize}px ${WORD_FONT_FAMILY}`;
    this.ctx.font = this.wordFont;
    this.charWidth = this.ctx.measureText('M').width;

    if (dpr !== this.watchedDpr) this.watchDpr(dpr);
  };

  draw(frame: RenderFrame): void {
    const { ctx } = this;
    const { effects } = frame;

    this.drawBackground(frame.background, frame.fxAlpha);
    const { state } = frame;
    if (state) this.drawSlowTint(state.slowTimer);

    // The world shakes; the far background does not (and its edges never show).
    ctx.save();
    ctx.translate(effects.shake.offsetX(), effects.shake.offsetY());
    this.drawPerimeter(effects.perimeterPulse);
    if (state) this.drawWords(state, frame);
    this.drawParticles(effects.particles, frame.fxAlpha);
    this.drawLasers(frame.lasers);
    this.drawCannon(frame.cannonAngle, frame.recoil, frame.missFlash);
    if (state) this.drawEmpGauge(state.combo.charge, frame.time);
    ctx.restore();

    this.drawFlash(effects.flash);
  }

  /** Moving the window to a screen with another pixel ratio does not always fire `resize`. */
  private watchDpr(dpr: number): void {
    this.dprQuery?.removeEventListener('change', this.resize);
    this.watchedDpr = dpr;
    this.dprQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
    this.dprQuery.addEventListener('change', this.resize);
  }

  private drawBackground(background: BackgroundState, alpha: number): void {
    const { ctx } = this;
    const { width, height } = this.layout;

    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, width, height);

    // Nebula: the tileable texture stretched to the screen and scrolled as a repeating pattern.
    if (this.nebula) {
      const m = this.nebulaMatrix;
      m.a = width / NEBULA_SIZE;
      m.d = height / NEBULA_SIZE;
      m.f = background.offset(0, alpha) * height;
      this.nebula.setTransform(m);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = this.nebula;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.fillStyle = PALETTE.text;
    for (let i = 0; i < background.layers.length; i++) {
      const layer = background.layers[i];
      if (!layer) continue;
      const offset = background.offset(i + 1, alpha);
      for (const star of layer.stars) {
        let y = star.y + offset;
        if (y >= 1) y -= 1;
        ctx.globalAlpha = star.alpha;
        ctx.fillRect(star.x * width, y * height, star.size, star.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawPerimeter(pulse: number): void {
    const { ctx, layout } = this;
    const y = layout.perimeterY;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const band = 12 + 22 * pulse;
    ctx.globalAlpha = 0.12 + 0.45 * pulse;
    ctx.drawImage(this.perimeterBand, 0, y - band, layout.width, band * 2);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = PALETTE.danger;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2 + 1.5 * pulse;
    if (pulse > 0) {
      ctx.shadowColor = PALETTE.danger;
      ctx.shadowBlur = 18 * pulse * this.dpr;
    }
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(layout.width, y);
    ctx.stroke();
    ctx.restore();
  }

  private drawWords(state: Readonly<MatchState>, frame: RenderFrame): void {
    const { ctx, layout, charWidth } = this;
    const { alpha } = frame;
    const plateHeight = Math.round(layout.fontSize * 1.6);
    const padX = LAYOUT.wordPadX;

    ctx.font = this.wordFont;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    for (const word of state.words) {
      const length = word.text.length;
      const textWidth = length * charWidth;
      const x = wordStartX(layout, word.x, length, charWidth);
      const y = toScreenY(layout, lerp(word.prevY, word.y, alpha));
      const locked = word.id === state.lockedId;
      const plateX = x - padX;
      const plateY = y - plateHeight / 2;
      const plateW = textWidth + padX * 2;

      if (word.armor > 0) {
        // Armored: a second plate peeking out behind, one per armor layer left.
        ctx.beginPath();
        ctx.roundRect(plateX + 4, plateY + 4, plateW, plateHeight, 4);
        ctx.fillStyle = PLATE_FILL;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = KIND_STROKE.armored;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.roundRect(plateX, plateY, plateW, plateHeight, 4);
      ctx.fillStyle = PLATE_FILL;
      ctx.fill();
      if (locked) {
        const color = frame.missFlash ? PALETTE.danger : PALETTE.primary;
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = LOCK_GLOW * this.dpr;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.lineWidth = word.kind === 'normal' ? 1 : 1.5;
        ctx.strokeStyle = KIND_STROKE[word.kind];
        ctx.stroke();
      }

      if (word.typed > 0) {
        ctx.fillStyle = PALETTE.primary;
        ctx.fillText(word.text.slice(0, word.typed), x, y);
        ctx.fillStyle = PALETTE.text;
        ctx.fillText(word.text.slice(word.typed), x + word.typed * charWidth, y);
      } else {
        ctx.fillStyle = PALETTE.text;
        ctx.fillText(word.text, x, y);
      }

      if (locked && word.typed < length) {
        // Underline the next letter to type.
        ctx.fillStyle = PALETTE.primary;
        ctx.fillRect(x + word.typed * charWidth + 1, y + layout.fontSize * 0.55, charWidth - 2, 2);
      }

      if (word.kind !== 'normal') this.drawBadge(word, plateX, plateY, layout.fontSize * 0.42);
    }
  }

  /** Small round badge on the plate's top-left corner identifying a special word. */
  private drawBadge(word: Word, cx: number, cy: number, r: number): void {
    if (word.kind === 'normal') return;
    const { ctx } = this;
    const color = KIND_COLOR[word.kind];

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fillStyle = PALETTE.bg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    switch (word.kind) {
      case 'bomb':
        ctx.beginPath();
        ctx.arc(cx - r * 0.08, cy + r * 0.12, r * 0.42, 0, TAU);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.2, cy - r * 0.2);
        ctx.lineTo(cx + r * 0.45, cy - r * 0.5);
        ctx.stroke();
        ctx.fillStyle = PALETTE.text;
        ctx.fillRect(cx + r * 0.4, cy - r * 0.68, 2, 2);
        break;
      case 'ice':
        // Six-spoke snowflake.
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = (i * Math.PI) / 3;
          const dx = Math.cos(a) * r * 0.62;
          const dy = Math.sin(a) * r * 0.62;
          ctx.moveTo(cx - dx, cy - dy);
          ctx.lineTo(cx + dx, cy + dy);
        }
        ctx.stroke();
        break;
      case 'shield':
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.5, cy - r * 0.5);
        ctx.lineTo(cx + r * 0.5, cy - r * 0.5);
        ctx.lineTo(cx + r * 0.5, cy);
        ctx.quadraticCurveTo(cx + r * 0.5, cy + r * 0.45, cx, cy + r * 0.65);
        ctx.quadraticCurveTo(cx - r * 0.5, cy + r * 0.45, cx - r * 0.5, cy);
        ctx.closePath();
        ctx.fill();
        break;
      case 'armored': {
        // One bar per pass still to type.
        const bars = word.armor + 1;
        const h = r * 0.26;
        for (let i = 0; i < bars; i++) {
          ctx.fillRect(cx - r * 0.5, cy - (bars * h * 1.6) / 2 + i * h * 1.6 + h * 0.3, r, h);
        }
        break;
      }
    }
  }

  /** Icy tint over the battlefield while the ice slow lasts (fades in its last half second). */
  private drawSlowTint(slowTimer: number): void {
    if (slowTimer <= 0) return;
    const { ctx, layout } = this;
    ctx.globalAlpha = SLOW_TINT * Math.min(1, slowTimer / 0.5);
    ctx.fillStyle = PALETTE.primary;
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.globalAlpha = 1;
  }

  /** EMP charge as an arc hugging the cannon dome; pulses with a glow when full. */
  private drawEmpGauge(charge: number, time: number): void {
    const { ctx, layout } = this;
    const r = LAYOUT.baseRadius + 7;
    const { cannonX: cx, cannonY: cy } = layout;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = GAUGE_TRACK;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, TAU);
    ctx.stroke();

    if (charge > 0) {
      ctx.strokeStyle = PALETTE.primary;
      if (isEmpReady(charge)) {
        ctx.shadowColor = PALETTE.primary;
        ctx.shadowBlur = (8 + 6 * Math.sin(time * 6)) * this.dpr;
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * Math.min(1, charge));
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawParticles(pool: ParticlePool, alpha: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.font = this.wordFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const p of pool.items) {
      if (!p.active) continue;
      const t = p.life / p.maxLife; // 1 at birth → 0 at death
      const x = lerp(p.prevX, p.x, alpha);
      const y = lerp(p.prevY, p.y, alpha);
      const size = lerp(p.sizeEnd, p.size, t);
      const color = PALETTE[p.color];

      switch (p.kind) {
        case 'spark':
          ctx.globalAlpha = t;
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(0.5, size);
          ctx.beginPath();
          ctx.moveTo(x - p.vx * SPARK_STREAK, y - p.vy * SPARK_STREAK);
          ctx.lineTo(x, y);
          ctx.stroke();
          break;
        case 'glow':
          if (size <= 0) break;
          ctx.globalAlpha = t;
          ctx.drawImage(this.glow[p.color], x - size, y - size, size * 2, size * 2);
          break;
        case 'ring':
          ctx.globalAlpha = t;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1 + 2 * t;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(0, size), 0, TAU);
          ctx.stroke();
          break;
        case 'glyph':
          ctx.globalAlpha = Math.min(1, t * 1.4);
          ctx.fillStyle = color;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.angle);
          ctx.scale(size, size);
          ctx.fillText(p.glyph, 0, 0);
          ctx.restore();
          break;
      }
    }
    ctx.restore();
  }

  /** Beams with glow: a blurred additive halo plus a thin bright core, and a muzzle flash. */
  private drawLasers(lasers: LaserPool): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const laser of lasers.items) {
      if (!laser.active) continue;
      const t = Math.max(0, laser.life / laser.maxLife);

      ctx.beginPath();
      ctx.moveTo(laser.x0, laser.y0);
      ctx.lineTo(laser.x1, laser.y1);

      ctx.shadowColor = PALETTE.primary;
      ctx.shadowBlur = LASER_GLOW * this.dpr;
      ctx.globalAlpha = 0.55 * t;
      ctx.strokeStyle = PALETTE.primary;
      ctx.lineWidth = 2 + 4 * t;
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.globalAlpha = t;
      ctx.strokeStyle = PALETTE.text;
      ctx.lineWidth = 1.2 + t;
      ctx.stroke();

      const flash = 8 + 10 * t;
      ctx.drawImage(this.glow.primary, laser.x0 - flash, laser.y0 - flash, flash * 2, flash * 2);
    }
    ctx.restore();
  }

  private drawCannon(angle: number, recoil: number, missFlash: boolean): void {
    const { ctx, layout } = this;
    const { cannonX: cx, cannonY: cy } = layout;

    // Dome first, then the barrel on top of it, then the pivot hub.
    ctx.beginPath();
    ctx.arc(cx, cy, LAYOUT.baseRadius, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = BASE_FILL;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PALETTE.muted;
    ctx.stroke();

    const kick = recoil * LAYOUT.recoilDistance;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = missFlash ? PALETTE.danger : PALETTE.primary;
    ctx.fillRect(-LAYOUT.barrelWidth / 2, -LAYOUT.barrelLength + kick, LAYOUT.barrelWidth, LAYOUT.barrelLength);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, TAU);
    ctx.fillStyle = PALETTE.text;
    ctx.fill();
  }

  private drawFlash(flash: ScreenFlash): void {
    const alpha = flash.alpha;
    if (alpha <= 0) return;
    const { ctx, layout } = this;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = PALETTE[flash.color];
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.globalAlpha = 1;
  }
}
