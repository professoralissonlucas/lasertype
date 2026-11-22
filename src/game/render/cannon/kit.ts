// Toolkit shared by the cannon layers: constants, gradients cached per skin, small shapes
// (rivets, lamps, grooves, glints) and the per-frame state every layer reads.
import type { CannonParams } from '../../../cosmetics/types.ts';
import { LAYOUT } from '../layout.ts';
import type { Skin } from '../skin.ts';
import { glowSprite } from '../sprites.ts';

export const TAU = Math.PI * 2;
/** Muzzle distance from the pivot (the lasers start there). */
export const MUZZLE = LAYOUT.barrelLength;
/** Seconds the muzzle stays hot after a shot. */
export const HEAT_TIME = 0.12;
/** Light direction for faceted shading (top left). */
export const LIGHT_ANGLE = -0.75 * Math.PI;
export const SIDES = [-1, 1] as const;

// ---------- Paint: gradients built once per skin (local coordinates) ----------

export interface Paint {
  /** Platforms: light top → dark bottom. */
  readonly plate: CanvasGradient;
  /** Heads: lit from the top left (world frame). */
  readonly sphere: CanvasGradient;
  /** Cylinders across x0..x1 (rotated frame), keyed by both ends. */
  readonly across: Map<number, CanvasGradient>;
}

const paints = new WeakMap<Skin, Paint>();

export function paintFor(ctx: CanvasRenderingContext2D, skin: Skin): Paint {
  const cached = paints.get(skin);
  if (cached) return cached;
  const [dark, mid, light] = skin.cosmetics.cannon.hull;
  const plate = ctx.createLinearGradient(0, -8, 0, 16);
  plate.addColorStop(0, light);
  plate.addColorStop(0.45, mid);
  plate.addColorStop(1, dark);
  const sphere = ctx.createRadialGradient(-5.5, -6.5, 0.5, 0, 0, 16.5);
  sphere.addColorStop(0, light);
  sphere.addColorStop(0.5, mid);
  sphere.addColorStop(1, dark);
  const paint: Paint = { plate, sphere, across: new Map() };
  paints.set(skin, paint);
  return paint;
}

/** Cylinder shading across x0..x1: dark rim, highlight, body, dark rim. */
export function across(ctx: CanvasRenderingContext2D, skin: Skin, paint: Paint, x0: number, x1: number): CanvasGradient {
  const key = Math.round(x0 * 100) * 100_000 + Math.round(x1 * 100);
  const cached = paint.across.get(key);
  if (cached) return cached;
  const [dark, mid, light] = skin.cosmetics.cannon.hull;
  const gradient = ctx.createLinearGradient(x0, 0, x1, 0);
  gradient.addColorStop(0, dark);
  gradient.addColorStop(0.3, light);
  gradient.addColorStop(0.6, mid);
  gradient.addColorStop(1, dark);
  paint.across.set(key, gradient);
  return gradient;
}

// ---------- Shapes ----------

export function poly(ctx: CanvasRenderingContext2D, points: readonly number[], dy = 0): void {
  ctx.beginPath();
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i] ?? 0;
    const y = (points[i + 1] ?? 0) + dy;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** A groove: dark line with a faint lit lip beside it (dx, dy). */
export function engrave(
  ctx: CanvasRenderingContext2D,
  p: CannonParams,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  dx: number,
  dy: number,
): void {
  ctx.lineWidth = 0.9;
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = p.edge;
  line(ctx, x0, y0, x1, y1);
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = p.highlight;
  line(ctx, x0 + dx, y0 + dy, x1 + dx, y1 + dy);
  ctx.globalAlpha = 1;
}

export function rivet(ctx: CanvasRenderingContext2D, p: CannonParams, x: number, y: number): void {
  ctx.fillStyle = p.edge;
  ctx.beginPath();
  ctx.arc(x + 0.25, y + 0.3, 1.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = p.hull[2];
  ctx.beginPath();
  ctx.arc(x, y, 1.05, 0, TAU);
  ctx.fill();
  ctx.fillStyle = p.highlight;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(x - 0.35, y - 0.35, 0.45, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** A small status light: glow + bright dot. */
export function lamp(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, intensity: number): void {
  if (intensity <= 0) return;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.7 * intensity;
  ctx.drawImage(glowSprite(color), x - 4, y - 4, 8, 8);
  ctx.globalAlpha = intensity;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 0.85, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** Four-point sparkle (reflections). */
export function glint(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, size: number, alpha: number): void {
  if (alpha <= 0) return;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.7;
  line(ctx, x - size, y, x + size, y);
  line(ctx, x, y - size, x, y + size);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ---------- Frame state shared by the layers ----------

/** Per-frame values derived once from the pose (module scratch: no allocation). */
export const frame = {
  /** Laser-colored parts (ring, core, lamps); red on a miss. */
  energyColor: '',
  coreColor: '',
  /** 0..1, slow sine (0.5 when reduced). */
  breath: 0.5,
  /** 0..1, energy ring pulse (0.6 when reduced). */
  pulse: 0.6,
  time: 0,
};

export function lampIntensity(phase: number): number {
  return frame.time === 0 ? 0.8 : 0.55 + 0.45 * Math.sin(frame.time * 3.2 + phase) ** 2;
}

