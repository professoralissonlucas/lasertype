// Turret heads (path in the rotated frame, shading in the world frame) and the energy core.
import type { CannonParams } from '../../../cosmetics/types.ts';
import { clamp } from '../../../utils/math.ts';
import type { Skin } from '../skin.ts';
import { glowSprite } from '../sprites.ts';
import { across, engrave, frame, glint, lamp, lampIntensity, LIGHT_ANGLE, line, rivet, SIDES, TAU, type Paint } from './kit.ts';
import { TWIN_BARREL_OFFSET } from './model.ts';

/** Rivets around the ball head (degrees, rotated frame; the gun shield is at -90°). */
const HEAD_RIVETS = [-25, 25, 90, 155, 205] as const;


/** Fills the current path with the world-lit sphere gradient, undoing the rotation first. */
export function fillLit(ctx: CanvasRenderingContext2D, p: CannonParams, paint: Paint, angle: number): void {
  ctx.rotate(-angle);
  ctx.globalAlpha = p.opacity;
  ctx.fillStyle = paint.sphere;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.strokeStyle = p.edge;
  ctx.stroke();
  ctx.rotate(angle);
}

/** Lit rim on the upper left of a round head (world frame). */
export function rimLight(ctx: CanvasRenderingContext2D, p: CannonParams, radius: number): void {
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = p.highlight;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(0, 0, radius - 0.9, 1.08 * Math.PI, 1.62 * Math.PI);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Gun shield where the barrel leaves the head (rotated frame). */
export function mantlet(ctx: CanvasRenderingContext2D, skin: Skin, paint: Paint, half: number, top: number, bottom: number): void {
  const p = skin.cosmetics.cannon;
  ctx.fillStyle = across(ctx, skin, paint, -half, half);
  ctx.beginPath();
  ctx.roundRect(-half, top, half * 2, bottom - top, 2.2);
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = p.edge;
  ctx.stroke();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = p.highlight;
  line(ctx, -half + 1.6, top + 0.7, half - 1.6, top + 0.7);
  ctx.globalAlpha = 1;
}

/** Dark window around the energy core. */
export function coreWindow(ctx: CanvasRenderingContext2D, p: CannonParams, radius: number): void {
  ctx.fillStyle = p.edge;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = p.highlight;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(0, 0, radius + 0.4, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawArmoredHead(ctx: CanvasRenderingContext2D, skin: Skin, paint: Paint, angle: number): void {
  const p = skin.cosmetics.cannon;
  ctx.beginPath();
  ctx.arc(0, 0, 14.5, 0, TAU);
  fillLit(ctx, p, paint, angle);
  ctx.rotate(-angle);
  rimLight(ctx, p, 14.5);
  ctx.rotate(angle);
  // Rotating details: seam ring, rivets, side lamps, gun shield.
  ctx.lineWidth = 0.9;
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = p.edge;
  ctx.beginPath();
  ctx.arc(0, 0, 9.6, -0.32 * Math.PI, 1.32 * Math.PI);
  ctx.stroke();
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = p.highlight;
  ctx.beginPath();
  ctx.arc(0, 0, 10.5, -0.3 * Math.PI, 1.3 * Math.PI);
  ctx.stroke();
  ctx.globalAlpha = 1;
  for (const deg of HEAD_RIVETS) {
    const a = (deg * Math.PI) / 180;
    rivet(ctx, p, Math.cos(a) * 12.2, Math.sin(a) * 12.2);
  }
  lamp(ctx, frame.energyColor, -10.4, 3.6, lampIntensity(0));
  lamp(ctx, frame.energyColor, 10.4, 3.6, lampIntensity(Math.PI / 2));
  mantlet(ctx, skin, paint, 6.6, -19.5, -8.5);
  rivet(ctx, p, -4.1, -11.2);
  rivet(ctx, p, 4.1, -11.2);
  coreWindow(ctx, p, 5.9);
}

export function drawHeavyHead(ctx: CanvasRenderingContext2D, skin: Skin, paint: Paint, angle: number): void {
  const p = skin.cosmetics.cannon;
  ctx.beginPath();
  ctx.roundRect(-14.5, -11.5, 29, 23, 6);
  fillLit(ctx, p, paint, angle);
  for (const s of SIDES) {
    engrave(ctx, p, s * 8.6, -9.6, s * 8.6, 9.6, s, 0);
    rivet(ctx, p, s * 11.7, -7.6);
    rivet(ctx, p, s * 11.7, 7.6);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = p.trim;
    ctx.fillRect(s * 12.4 - 0.7, -3.2, 1.4, 6.4);
    ctx.globalAlpha = 1;
    lamp(ctx, p.trim, s * 12.4, 0, 0.35 + 0.25 * frame.breath);
  }
  // Cradle holding both barrels.
  mantlet(ctx, skin, paint, 10, -20.5, -9.5);
  ctx.fillStyle = p.edge;
  for (const s of SIDES) ctx.fillRect(s * TWIN_BARREL_OFFSET - 2.6, -20.6, 5.2, 1.4);
  rivet(ctx, p, 0, -15);
  coreWindow(ctx, p, 5.6);
}

/** Octagonal gem: facets shaded by where they face in the world. */
export function drawCrystalHead(ctx: CanvasRenderingContext2D, skin: Skin, angle: number): void {
  const p = skin.cosmetics.cannon;
  const outer = 14;
  const inner = 6.5;
  for (let k = 0; k < 8; k++) {
    const a0 = (k * Math.PI) / 4 + Math.PI / 8;
    const a1 = a0 + Math.PI / 4;
    const facing = Math.cos(a0 + Math.PI / 8 + angle - LIGHT_ANGLE);
    const light = (facing + 1) / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a0) * outer, Math.sin(a0) * outer);
    ctx.lineTo(Math.cos(a1) * outer, Math.sin(a1) * outer);
    ctx.lineTo(Math.cos(a1) * inner, Math.sin(a1) * inner);
    ctx.lineTo(Math.cos(a0) * inner, Math.sin(a0) * inner);
    ctx.closePath();
    ctx.globalAlpha = p.opacity * (0.7 + 0.3 * light);
    ctx.fillStyle = light > 0.66 ? p.hull[2] : light > 0.33 ? p.hull[1] : p.hull[0];
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = p.edge;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  // Table (center) lets the core show through.
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    if (k === 0) ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    else ctx.lineTo(Math.cos(a) * inner, Math.sin(a) * inner);
  }
  ctx.closePath();
  ctx.globalAlpha = p.opacity * 0.45;
  ctx.fillStyle = p.hull[1];
  ctx.fill();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = p.edge;
  ctx.stroke();
  // Girdle.
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    if (k === 0) ctx.moveTo(Math.cos(a) * outer, Math.sin(a) * outer);
    else ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
  }
  ctx.closePath();
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Fixed specular streak and a twinkle (world frame).
  ctx.rotate(-angle);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = p.highlight;
  ctx.lineWidth = 1.2;
  line(ctx, -10, -6.5, -5.5, -10.5);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (frame.time !== 0) glint(ctx, p.highlight, -8.5, -9, 2.2 + frame.breath, 0.35 + 0.5 * frame.breath);
  ctx.rotate(angle);
}

export function drawOrbitalHead(ctx: CanvasRenderingContext2D, skin: Skin, paint: Paint, angle: number): void {
  const p = skin.cosmetics.cannon;
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, TAU);
  fillLit(ctx, p, paint, angle);
  ctx.rotate(-angle);
  rimLight(ctx, p, 13);
  ctx.rotate(angle);
  // Visor band across the front.
  const from = -0.5 * Math.PI - 0.78;
  const to = -0.5 * Math.PI + 0.78;
  ctx.lineCap = 'round';
  ctx.strokeStyle = p.edge;
  ctx.lineWidth = 3.8;
  ctx.beginPath();
  ctx.arc(0, 0, 9.6, from, to);
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = p.trim;
  ctx.globalAlpha = 0.25 * (0.7 + 0.3 * frame.breath);
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'butt';
  for (const s of SIDES) lamp(ctx, p.trim, s * 8.2, 6.2, 0.55 + 0.25 * frame.breath);
  // Rail breech.
  mantlet(ctx, skin, paint, 6, -17.5, -10);
  coreWindow(ctx, p, 5);
}

// ---------- Energy core ----------

export function drawCoreGlow(ctx: CanvasRenderingContext2D, energy: number): void {
  // Wide range on purpose: a dim ember at rest, a flare when the EMP is ready.
  const size = 10 + 36 * energy + 4 * frame.breath;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp((0.12 + 0.85 * energy) * (0.88 + 0.24 * frame.breath), 0, 1);
  ctx.drawImage(glowSprite(frame.energyColor), -size / 2, -size / 2, size, size);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

export function drawCore(ctx: CanvasRenderingContext2D, energy: number, ready: boolean, radius: number): void {
  ctx.fillStyle = frame.energyColor;
  ctx.globalAlpha = 0.3 + 0.7 * energy;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.35 + 0.65 * energy;
  ctx.fillStyle = frame.coreColor;
  ctx.beginPath();
  ctx.arc(0, 0, 0.9 + (radius - 1.6) * energy, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (ready) {
    // EMP ready: a ripple keeps leaving the core.
    const u = frame.time === 0 ? 0.35 : (frame.time * 1.4) % 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = frame.energyColor;
    ctx.globalAlpha = 0.85 * (1 - u);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 1.5 + 7 * u, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

