// Canvas 2D drawing. Reads game state, never changes it.
// Cosmetic look comes from the Skin (drawing functions shared with the shop preview).
import { DEFAULT_COSMETICS } from '../../cosmetics/equip.ts';
import type { ResolvedCosmetics } from '../../cosmetics/types.ts';
import { lerp } from '../../utils/math.ts';
import type { Effects } from '../effects/Effects.ts';
import type { ScreenFlash } from '../effects/flash.ts';
import type { LaserPool } from '../entities/Laser.ts';
import type { MatchState } from '../state.ts';
import { isEmpReady } from '../combo.ts';
import type { BackgroundState } from './background.ts';
import { drawBackground } from './drawBackground.ts';
import { drawCannon } from './drawCannon.ts';
import { drawBeams, drawParticles } from './drawFx.ts';
import { drawWord, type WordMetrics } from './drawWord.ts';
import { computeLayout, LAYOUT, toScreenY, wordStartX, type Layout } from './layout.ts';
import { PALETTE, withAlpha } from './palette.ts';
import { Skin } from './skin.ts';
import { bandSprite } from './sprites.ts';

export const WORD_FONT_FAMILY = "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace";
const TAU = Math.PI * 2;

const GAUGE_TRACK = withAlpha(PALETTE.muted, 0.3);
/** Max opacity of the icy tint while the ice slow is active. */
const SLOW_TINT = 0.08;

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

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private skin = new Skin(DEFAULT_COSMETICS);
  /** The skin's nebula as a repeating pattern: the GPU wraps the tile, so scrolling has no seam. */
  private nebula: CanvasPattern | null;
  /** Reused every frame to position the pattern (no per-frame allocation). */
  private readonly nebulaMatrix = new DOMMatrix();
  private readonly perimeterBand: HTMLCanvasElement;
  /** Reused for every word drawn. */
  private readonly metrics: WordMetrics = { x: 0, y: 0, fontSize: 16, charWidth: 1, padX: LAYOUT.wordPadX, dpr: 1 };
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
    this.nebula = ctx.createPattern(this.skin.nebula, 'repeat');
    this.perimeterBand = bandSprite(PALETTE.danger);
  }

  /** Equipped cosmetics changed (also in the middle of a match: it is only looks). */
  setCosmetics(cosmetics: ResolvedCosmetics): void {
    this.skin = new Skin(cosmetics);
    this.nebula = this.ctx.createPattern(this.skin.nebula, 'repeat');
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
    const { ctx, layout, skin } = this;
    const { effects } = frame;

    drawBackground(ctx, skin, this.nebula, this.nebulaMatrix, frame.background, frame.fxAlpha, layout.width, layout.height);
    const { state } = frame;
    if (state) this.drawSlowTint(state.slowTimer);

    // The world shakes; the far background does not (and its edges never show).
    ctx.save();
    ctx.translate(effects.shake.offsetX(), effects.shake.offsetY());
    this.drawPerimeter(effects.perimeterPulse);
    if (state) this.drawWords(state, frame);
    drawParticles(ctx, effects.particles, frame.fxAlpha, skin, this.wordFont);
    drawBeams(ctx, frame.lasers, skin, this.dpr);
    drawCannon(ctx, skin, layout.cannonX, layout.cannonY, frame.cannonAngle, frame.recoil, frame.missFlash, frame.time);
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
    const { ctx, layout, charWidth, skin, metrics } = this;
    const { alpha } = frame;

    ctx.font = this.wordFont;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    metrics.fontSize = layout.fontSize;
    metrics.charWidth = charWidth;
    metrics.dpr = this.dpr;

    for (const word of state.words) {
      metrics.x = wordStartX(layout, word.x, word.text.length, charWidth);
      metrics.y = toScreenY(layout, lerp(word.prevY, word.y, alpha));
      drawWord(ctx, skin, word, word.id === state.lockedId, metrics, frame.missFlash);
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

  private drawFlash(flash: ScreenFlash): void {
    const alpha = flash.alpha;
    if (alpha <= 0) return;
    const { ctx, layout } = this;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.skin.fx[flash.color];
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.globalAlpha = 1;
  }
}
