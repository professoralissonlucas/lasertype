// Canvas 2D drawing. Reads game state, never changes it.
import { lerp } from '../../utils/math.ts';
import { createRng } from '../../utils/rng.ts';
import type { LaserPool } from '../entities/Laser.ts';
import type { MatchState } from '../state.ts';
import { createStarfield, type Star } from './background.ts';
import { computeLayout, LAYOUT, toScreenY, wordStartX, type Layout } from './layout.ts';
import { PALETTE, withAlpha } from './palette.ts';

const WORD_FONT_FAMILY = "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace";
const STARFIELD_SEED = 'orbital-defense';
const STAR_COUNT = 160;

const PLATE_FILL = withAlpha(PALETTE.bg, 0.78);
const PLATE_STROKE = withAlpha(PALETTE.muted, 0.35);
const BASE_FILL = withAlpha(PALETTE.muted, 0.35);

export interface RenderFrame {
  readonly state: Readonly<MatchState>;
  /** Interpolation factor between the previous and current update. */
  readonly alpha: number;
  readonly cannonAngle: number;
  readonly lasers: LaserPool;
  /** A wrong key was pressed very recently. */
  readonly missFlash: boolean;
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly background: HTMLCanvasElement;
  private readonly stars: readonly Star[];
  private wordFont = '';
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
    this.background = document.createElement('canvas');
    this.stars = createStarfield(createRng(STARFIELD_SEED), STAR_COUNT);
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

    this.layout = computeLayout(width, height);
    this.wordFont = `${this.layout.fontSize}px ${WORD_FONT_FAMILY}`;
    this.ctx.font = this.wordFont;
    this.charWidth = this.ctx.measureText('M').width;

    this.paintBackground(width, height, dpr);
    if (dpr !== this.watchedDpr) this.watchDpr(dpr);
  };

  draw(frame: RenderFrame): void {
    const { ctx, layout } = this;
    ctx.drawImage(this.background, 0, 0, layout.width, layout.height);
    this.drawPerimeter();
    this.drawWords(frame);
    this.drawLasers(frame.lasers);
    this.drawCannon(frame.cannonAngle, frame.missFlash);
  }

  /** Moving the window to a screen with another pixel ratio does not always fire `resize`. */
  private watchDpr(dpr: number): void {
    this.dprQuery?.removeEventListener('change', this.resize);
    this.watchedDpr = dpr;
    this.dprQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
    this.dprQuery.addEventListener('change', this.resize);
  }

  /** Static background (color + stars), cached in an offscreen canvas. */
  private paintBackground(width: number, height: number, dpr: number): void {
    const bg = this.background;
    bg.width = Math.round(width * dpr);
    bg.height = Math.round(height * dpr);
    const ctx = bg.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = PALETTE.text;
    for (const star of this.stars) {
      ctx.globalAlpha = star.alpha;
      ctx.fillRect(Math.round(star.x * width), Math.round(star.y * height), star.size, star.size);
    }
    ctx.globalAlpha = 1;
  }

  private drawPerimeter(): void {
    const { ctx, layout } = this;
    ctx.save();
    ctx.strokeStyle = PALETTE.danger;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(0, layout.perimeterY);
    ctx.lineTo(layout.width, layout.perimeterY);
    ctx.stroke();
    ctx.restore();
  }

  private drawWords(frame: RenderFrame): void {
    const { ctx, layout, charWidth } = this;
    const { state, alpha } = frame;
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

      ctx.beginPath();
      ctx.roundRect(x - padX, y - plateHeight / 2, textWidth + padX * 2, plateHeight, 4);
      ctx.fillStyle = PLATE_FILL;
      ctx.fill();
      ctx.lineWidth = locked ? 1.5 : 1;
      ctx.strokeStyle = locked ? (frame.missFlash ? PALETTE.danger : PALETTE.primary) : PLATE_STROKE;
      ctx.stroke();

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
    }
  }

  private drawLasers(lasers: LaserPool): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = PALETTE.primary;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const laser of lasers.items) {
      if (!laser.active) continue;
      ctx.globalAlpha = Math.max(0, laser.life / laser.maxLife);
      ctx.beginPath();
      ctx.moveTo(laser.x0, laser.y0);
      ctx.lineTo(laser.x1, laser.y1);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawCannon(angle: number, missFlash: boolean): void {
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

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = missFlash ? PALETTE.danger : PALETTE.primary;
    ctx.fillRect(-LAYOUT.barrelWidth / 2, -LAYOUT.barrelLength, LAYOUT.barrelWidth, LAYOUT.barrelLength);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.text;
    ctx.fill();
  }
}
