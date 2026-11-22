// The boss: an armored hull carrying the phrase, one slot per word. Layers: fins → crown with
// the energy core → hull → slots (a broken one is a hole with glowing cracks) → words → core
// glow. Gameplay colors only (danger hull, the word being typed outlined like a locked one).
import { hashUnit } from '../../utils/rng.ts';
import { bossWordY, type BossPlate } from './bossLayout.ts';
import { PALETTE, withAlpha } from './palette.ts';
import type { Skin } from './skin.ts';

const TAU = Math.PI * 2;
/** Corner cut of the hull. */
const CHAMFER = 16;
const FIN_WIDTH = 34;
const CROWN_HALF = 58;
const CROWN_HEIGHT = 18;
const SLOT_PAD = 7;
const LOCK_GLOW = 12;

const HULL_TOP = '#2E1B33';
const HULL_BOTTOM = '#0E0913';
const FIN_FILL = '#1A101F';
const SLOT_FILL = withAlpha(PALETTE.bg, 0.72);
const SLOT_STROKE = withAlpha(PALETTE.danger, 0.28);
const HOLE_FILL = withAlpha(PALETTE.bg, 0.95);
const HULL_STROKE = PALETTE.danger;
const PANEL_STROKE = withAlpha(PALETTE.danger, 0.32);
const CRACK_STROKE = withAlpha(PALETTE.combo, 0.7);
const RIVET_FILL = withAlpha(PALETTE.text, 0.35);

/** What drawing needs from a boss (a game `Boss` fits as is). */
export interface BossVisual {
  readonly words: readonly string[];
  readonly index: number;
  readonly typed: number;
}

export interface BossView {
  /** Center and top of the plate (CSS px). */
  readonly x: number;
  readonly top: number;
  /** 0..1 while it arrives; 1 = it can be typed. */
  readonly entrance: number;
  /** 0..1: a defeated hull about to blow up. */
  readonly heat: number;
  readonly missFlash: boolean;
  /** Wall-clock seconds (pulses). */
  readonly time: number;
  /** "Reduzir efeitos": no pulses. */
  readonly reduced: boolean;
  readonly dpr: number;
  /** Font of the phrase (at the plate's font size). */
  readonly font: string;
}

function traceHull(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: number): void {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

/** Blades on both sides, pointing down. */
function drawFins(ctx: CanvasRenderingContext2D, left: number, top: number, w: number, h: number): void {
  ctx.fillStyle = FIN_FILL;
  ctx.strokeStyle = PANEL_STROKE;
  ctx.lineWidth = 1.5;
  for (const side of [-1, 1]) {
    const edge = side < 0 ? left : left + w;
    ctx.beginPath();
    ctx.moveTo(edge - side * 2, top + h * 0.16);
    ctx.lineTo(edge + side * FIN_WIDTH, top + h * 0.5);
    ctx.lineTo(edge + side * FIN_WIDTH * 0.55, top + h + 10);
    ctx.lineTo(edge - side * 2, top + h * 0.82);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/** The hole left by a destroyed word, with cracks spreading from it (the same every frame). */
function drawHole(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number): void {
  const teeth = Math.max(4, Math.round(w / 16));
  ctx.beginPath();
  for (let i = 0; i <= teeth; i++) {
    const px = x + (w * i) / teeth;
    ctx.lineTo(px, y + h * (0.02 + 0.26 * hashUnit(seed, i)));
  }
  for (let i = teeth; i >= 0; i--) {
    const px = x + (w * i) / teeth;
    ctx.lineTo(px, y + h * (0.98 - 0.26 * hashUnit(seed, i + 40)));
  }
  ctx.closePath();
  ctx.fillStyle = HOLE_FILL;
  ctx.fill();
  ctx.strokeStyle = CRACK_STROKE;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    let px = x + w * (0.2 + 0.3 * i + 0.1 * hashUnit(seed, 80 + i));
    const down = i % 2 === 0;
    let py = down ? y + h * 0.9 : y + h * 0.1;
    ctx.moveTo(px, py);
    for (let k = 0; k < 2; k++) {
      px += (hashUnit(seed, 90 + i * 4 + k) - 0.5) * 14;
      py += (down ? 1 : -1) * (3 + 4 * hashUnit(seed, 110 + i * 4 + k));
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
}

/** Leaves the context as it found it. */
export function drawBoss(ctx: CanvasRenderingContext2D, skin: Skin, boss: BossVisual, plate: BossPlate, view: BossView): void {
  const { width: w, height: h, charWidth } = plate;
  const left = view.x - w / 2;
  const { top } = view;
  const active = view.entrance >= 1;
  const health = boss.words.length > 0 ? 1 - boss.index / boss.words.length : 0;
  const pulse = view.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(view.time * 2.4);

  ctx.save();
  drawFins(ctx, left, top, w, h);

  // Crown: the housing of the core.
  ctx.beginPath();
  ctx.moveTo(view.x - CROWN_HALF, top + 2);
  ctx.lineTo(view.x - CROWN_HALF * 0.62, top - CROWN_HEIGHT);
  ctx.lineTo(view.x + CROWN_HALF * 0.62, top - CROWN_HEIGHT);
  ctx.lineTo(view.x + CROWN_HALF, top + 2);
  ctx.closePath();
  ctx.fillStyle = FIN_FILL;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = HULL_STROKE;
  ctx.stroke();

  const hull = ctx.createLinearGradient(0, top, 0, top + h);
  hull.addColorStop(0, HULL_TOP);
  hull.addColorStop(1, HULL_BOTTOM);
  traceHull(ctx, left, top, w, h, CHAMFER);
  ctx.fillStyle = hull;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = HULL_STROKE;
  ctx.stroke();
  traceHull(ctx, left + 7, top + 7, w - 14, h - 14, CHAMFER - 4);
  ctx.lineWidth = 1;
  ctx.strokeStyle = PANEL_STROKE;
  ctx.stroke();

  ctx.fillStyle = RIVET_FILL;
  ctx.beginPath();
  for (const rx of [left + 14, left + w - 14]) {
    for (const ry of [top + CHAMFER + 4, top + h - CHAMFER - 4]) {
      ctx.moveTo(rx + 2, ry);
      ctx.arc(rx, ry, 2, 0, TAU);
    }
  }
  ctx.fill();

  ctx.font = view.font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const slotH = plate.lineHeight - 10;
  for (const [i, box] of plate.words.entries()) {
    const x = view.x + box.x;
    const y = bossWordY(plate, top, i);
    const slotX = x - SLOT_PAD;
    const slotY = y - slotH / 2;
    const slotW = box.width + SLOT_PAD * 2;

    if (i < boss.index) {
      drawHole(ctx, slotX, slotY, slotW, slotH, i + 1);
      continue;
    }

    const current = active && i === boss.index;
    ctx.beginPath();
    ctx.roundRect(slotX, slotY, slotW, slotH, 4);
    ctx.fillStyle = SLOT_FILL;
    ctx.fill();
    if (current) {
      const color = view.missFlash ? PALETTE.danger : PALETTE.primary;
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = LOCK_GLOW * view.dpr;
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.lineWidth = 1;
      ctx.strokeStyle = SLOT_STROKE;
      ctx.stroke();
    }

    // Arriving: readable, but clearly not a target yet. Later words stay a little dimmer.
    ctx.globalAlpha = active ? (current ? 1 : 0.72) : 0.4;
    ctx.fillStyle = PALETTE.text;
    if (current && boss.typed > 0) {
      ctx.fillStyle = PALETTE.primary;
      ctx.fillText(box.text.slice(0, boss.typed), x, y);
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(box.text.slice(boss.typed), x + boss.typed * charWidth, y);
    } else {
      ctx.fillText(box.text, x, y);
    }
    if (current && boss.typed < box.text.length) {
      ctx.fillStyle = PALETTE.primary;
      ctx.fillRect(x + boss.typed * charWidth + 1, y + plate.fontSize * 0.55, charWidth - 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  if (view.heat > 0) {
    traceHull(ctx, left, top, w, h, CHAMFER);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45 * view.heat;
    ctx.fillStyle = skin.fx.blast;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // Core: brighter and wider with more health; a weak ember at the end.
  const coreY = top - CROWN_HEIGHT * 0.38;
  ctx.globalCompositeOperation = 'lighter';
  const glow = 16 + 26 * health + 5 * pulse;
  ctx.globalAlpha = 0.45 + 0.45 * health;
  ctx.drawImage(skin.glow.danger, view.x - glow, coreY - glow, glow * 2, glow * 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  ctx.arc(view.x, coreY, 4 + 3 * health, 0, TAU);
  ctx.fillStyle = PALETTE.text;
  ctx.fill();
  ctx.restore();
}
