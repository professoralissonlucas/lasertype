// A falling word: plate (shape from the wordBorder cosmetic), letters, lock state and the
// special-word badge. Locked and special words keep their gameplay colors whatever the
// cosmetic; only normal plates take the cosmetic color.
import type { WordBorderParams } from '../../cosmetics/types.ts';
import type { SpecialKind, WordKind } from '../types.ts';
import { PALETTE, withAlpha } from './palette.ts';
import type { Skin } from './skin.ts';

const TAU = Math.PI * 2;
const PLATE_FILL = withAlpha(PALETTE.bg, 0.78);
const LOCK_GLOW = 10;
/** Armored words show an extra plate peeking out behind, offset by this (px). */
const ARMOR_OFFSET = 4;

/** Plate border per special kind (gameplay colors, independent of the cosmetic). */
const KIND_STROKE: Readonly<Record<SpecialKind, string>> = {
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

/** What drawing needs from a word (a game `Word` fits as is). */
export interface WordVisual {
  readonly text: string;
  /** Letters typed in the current pass. */
  readonly typed: number;
  readonly kind: WordKind;
  /** Armor passes still to break (armored words). */
  readonly armor: number;
}

/** Mutable on purpose: the renderer reuses one object for every word (no per-frame allocation). */
export interface WordMetrics {
  /** Left edge of the text and its vertical center (CSS px). */
  x: number;
  y: number;
  fontSize: number;
  charWidth: number;
  padX: number;
  dpr: number;
}

/** Outline used to fill the plate (and to stroke it, for the closed shapes). */
function tracePlate(ctx: CanvasRenderingContext2D, shape: WordBorderParams['shape'], x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  switch (shape) {
    case 'rounded':
      ctx.roundRect(x, y, w, h, 4);
      break;
    case 'circuit':
      ctx.roundRect(x, y, w, h, 3);
      break;
    case 'brackets':
      ctx.roundRect(x, y, w, h, 2);
      break;
    case 'chamfer': {
      const c = Math.min(7, h * 0.3);
      ctx.moveTo(x + c, y);
      ctx.lineTo(x + w - c, y);
      ctx.lineTo(x + w, y + c);
      ctx.lineTo(x + w, y + h - c);
      ctx.lineTo(x + w - c, y + h);
      ctx.lineTo(x + c, y + h);
      ctx.lineTo(x, y + h - c);
      ctx.lineTo(x, y + c);
      ctx.closePath();
      break;
    }
  }
}

/** Path of the plate's border decoration (then stroked by the caller). */
function traceBorder(ctx: CanvasRenderingContext2D, shape: WordBorderParams['shape'], x: number, y: number, w: number, h: number): void {
  switch (shape) {
    case 'rounded':
    case 'chamfer':
      tracePlate(ctx, shape, x, y, w, h);
      break;
    case 'brackets': {
      // Four corner brackets, like a targeting frame.
      const arm = Math.min(9, h * 0.42, w * 0.3);
      ctx.beginPath();
      ctx.moveTo(x, y + arm);
      ctx.lineTo(x, y);
      ctx.lineTo(x + arm, y);
      ctx.moveTo(x + w - arm, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + arm);
      ctx.moveTo(x + w, y + h - arm);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w - arm, y + h);
      ctx.moveTo(x + arm, y + h);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x, y + h - arm);
      break;
    }
    case 'circuit': {
      // Outer line, an inner line and a contact pin on each side.
      const inset = 3;
      const mid = y + h / 2;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 3);
      ctx.moveTo(x + inset + 2, y + inset);
      ctx.lineTo(x + w - inset - 2, y + inset);
      ctx.moveTo(x + inset + 2, y + h - inset);
      ctx.lineTo(x + w - inset - 2, y + h - inset);
      ctx.moveTo(x - 4, mid);
      ctx.lineTo(x, mid);
      ctx.moveTo(x + w, mid);
      ctx.lineTo(x + w + 4, mid);
      break;
    }
  }
}

function drawPlate(
  ctx: CanvasRenderingContext2D,
  shape: WordBorderParams['shape'],
  x: number,
  y: number,
  w: number,
  h: number,
  stroke: string,
  lineWidth: number,
): void {
  tracePlate(ctx, shape, x, y, w, h);
  ctx.fillStyle = PLATE_FILL;
  ctx.fill();
  traceBorder(ctx, shape, x, y, w, h);
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

/** Small round badge on the plate's top-left corner identifying a special word. */
function drawBadge(ctx: CanvasRenderingContext2D, kind: SpecialKind, armor: number, cx: number, cy: number, r: number): void {
  const color = KIND_COLOR[kind];

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = PALETTE.bg;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  switch (kind) {
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
      const bars = armor + 1;
      const h = r * 0.26;
      for (let i = 0; i < bars; i++) {
        ctx.fillRect(cx - r * 0.5, cy - (bars * h * 1.6) / 2 + i * h * 1.6 + h * 0.3, r, h);
      }
      break;
    }
  }
}

/**
 * Draws one word. The caller sets `ctx.font` (word font), `textBaseline = 'middle'` and
 * `textAlign = 'left'` once for all words. `missFlash` turns the lock outline red.
 */
export function drawWord(
  ctx: CanvasRenderingContext2D,
  skin: Skin,
  word: WordVisual,
  locked: boolean,
  m: Readonly<WordMetrics>,
  missFlash: boolean,
): void {
  const border = skin.cosmetics.wordBorder;
  const length = word.text.length;
  const plateHeight = Math.round(m.fontSize * 1.6);
  const plateX = m.x - m.padX;
  const plateY = m.y - plateHeight / 2;
  const plateW = length * m.charWidth + m.padX * 2;

  if (word.armor > 0) {
    drawPlate(ctx, border.shape, plateX + ARMOR_OFFSET, plateY + ARMOR_OFFSET, plateW, plateHeight, KIND_STROKE.armored, 1.5);
  }

  if (locked) {
    const color = missFlash ? PALETTE.danger : PALETTE.primary;
    tracePlate(ctx, border.shape, plateX, plateY, plateW, plateHeight);
    ctx.fillStyle = PLATE_FILL;
    ctx.fill();
    ctx.save();
    traceBorder(ctx, border.shape, plateX, plateY, plateW, plateHeight);
    ctx.shadowColor = color;
    ctx.shadowBlur = LOCK_GLOW * m.dpr;
    ctx.lineWidth = Math.max(1.5, border.width);
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  } else if (word.kind === 'normal') {
    drawPlate(ctx, border.shape, plateX, plateY, plateW, plateHeight, skin.plateStroke, border.width);
  } else {
    drawPlate(ctx, border.shape, plateX, plateY, plateW, plateHeight, KIND_STROKE[word.kind], Math.max(1.5, border.width));
  }

  if (word.typed > 0) {
    ctx.fillStyle = PALETTE.primary;
    ctx.fillText(word.text.slice(0, word.typed), m.x, m.y);
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(word.text.slice(word.typed), m.x + word.typed * m.charWidth, m.y);
  } else {
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(word.text, m.x, m.y);
  }

  if (locked && word.typed < length) {
    // Underline the next letter to type.
    ctx.fillStyle = PALETTE.primary;
    ctx.fillRect(m.x + word.typed * m.charWidth + 1, m.y + m.fontSize * 0.55, m.charWidth - 2, 2);
  }

  if (word.kind !== 'normal') drawBadge(ctx, word.kind, word.armor, plateX, plateY, m.fontSize * 0.42);
}
