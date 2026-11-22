// Barrels, drawn in the rotated frame (pointing to -y); kick = recoil slide in px.
import { clamp, lerp } from '../../../utils/math.ts';
import { PALETTE } from '../palette.ts';
import type { Skin } from '../skin.ts';
import { glowSprite } from '../sprites.ts';
import { across, frame, HEAT_TIME, line, MUZZLE, SIDES, type Paint } from './kit.ts';
import { recoilKick, TWIN_BARREL_OFFSET, type CannonPose } from './model.ts';

/** Crystal barrel shards: side, height (rotated frame, at rest) and size. */
const SHARDS = [
  [-1, -21, 1.3],
  [1, -27.5, 1.1],
  [-1, -34.5, 0.8],
] as const;


/** Chamfered muzzle tip centered on x = c, from y = -45 to the muzzle. */
export function tipPath(ctx: CanvasRenderingContext2D, c: number, half: number, kick: number): void {
  const top = -MUZZLE + kick;
  ctx.beginPath();
  ctx.moveTo(c - half, -45 + kick);
  ctx.lineTo(c - half, top + 1.7);
  ctx.lineTo(c - half + 1, top);
  ctx.lineTo(c + half - 1, top);
  ctx.lineTo(c + half, top + 1.7);
  ctx.lineTo(c + half, -45 + kick);
  ctx.closePath();
}

/**
 * Tube centered on x = c: a heat-sink jacket of fins by the breech, a band, and a muzzle
 * brake (wider tip with side vents) at the end.
 */
export function drawTube(
  ctx: CanvasRenderingContext2D,
  skin: Skin,
  paint: Paint,
  c: number,
  scale: number,
  fins: number,
  kick: number,
  age: number,
): void {
  const p = skin.cosmetics.cannon;
  const tube = 4 * scale;
  const fin = 6.2 * scale;
  const tip = 5.2 * scale;
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = p.edge;

  ctx.fillStyle = across(ctx, skin, paint, c - tube, c + tube);
  ctx.beginPath();
  ctx.rect(c - tube, -45 + kick, tube * 2, 31);
  ctx.fill();
  ctx.stroke();

  // Fins: chunky plates with a lit top and a dark gap below.
  for (let i = 0; i < fins; i++) {
    const y = -31 + i * 4.2 + kick;
    ctx.fillStyle = across(ctx, skin, paint, c - fin, c + fin);
    ctx.beginPath();
    ctx.roundRect(c - fin, y, fin * 2, 2.8, 0.7);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = p.highlight;
    line(ctx, c - fin + 0.8, y + 0.55, c + fin - 0.8, y + 0.55);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = p.edge;
  }

  // Band.
  const band = tube + 0.9;
  ctx.fillStyle = p.trim;
  ctx.fillRect(c - band, -40 + kick, band * 2, 2.8);
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = p.highlight;
  ctx.fillRect(c - band, -40 + kick, band * 2, 0.6);
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = p.edge;
  ctx.fillRect(c - band, -37.6 + kick, band * 2, 0.5);
  ctx.globalAlpha = 1;

  // Muzzle brake: wider tip with two vents on each side, then the bore.
  ctx.fillStyle = across(ctx, skin, paint, c - tip, c + tip);
  tipPath(ctx, c, tip, kick);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = p.edge;
  for (let v = 0; v < 2; v++) {
    const vy = -49.2 + v * 2.4 + kick;
    ctx.fillRect(c - tip, vy, 1.6 * scale, 1.1);
    ctx.fillRect(c + tip - 1.6 * scale, vy, 1.6 * scale, 1.1);
  }
  const bore = 1.9 * scale;
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(c - bore, -MUZZLE + kick, bore * 2, 1.3);

  if (age < HEAT_TIME) {
    const heat = 1 - age / HEAT_TIME;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.75 * heat;
    ctx.fillStyle = frame.energyColor;
    tipPath(ctx, c, tip, kick);
    ctx.fill();
    ctx.globalAlpha = heat;
    ctx.fillStyle = frame.coreColor;
    ctx.fillRect(c - bore, -MUZZLE + kick, bore * 2, 1.3);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** Half width of the prism barrel at height y. */
export function prismHalf(y: number): number {
  return 5.6 - 2.9 * clamp((-12 - y) / 40, 0, 1);
}

export function drawPrismBarrel(ctx: CanvasRenderingContext2D, skin: Skin, energy: number, kick: number, age: number): void {
  const p = skin.cosmetics.cannon;
  const top = -MUZZLE + kick;
  const base = -12 + kick;
  const tip = prismHalf(-MUZZLE);
  // Two facets: lit left, shaded right.
  ctx.globalAlpha = p.opacity * 0.85;
  ctx.fillStyle = p.hull[2];
  ctx.beginPath();
  ctx.moveTo(-5.6, base);
  ctx.lineTo(-tip, top);
  ctx.lineTo(0, top);
  ctx.lineTo(0, base);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = p.opacity;
  ctx.fillStyle = p.hull[0];
  ctx.beginPath();
  ctx.moveTo(0, base);
  ctx.lineTo(0, top);
  ctx.lineTo(tip, top);
  ctx.lineTo(5.6, base);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // Energy running up inside.
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = frame.energyColor;
  ctx.globalAlpha = (0.3 + 0.5 * energy) * (0.8 + 0.2 * frame.breath);
  ctx.lineWidth = 1.6;
  line(ctx, 0, base - 2, 0, top + 2);
  if (frame.time !== 0) {
    const u = (frame.time * 1.4) % 1;
    const y = lerp(base - 2, top + 8, u);
    ctx.globalAlpha = 0.85 * Math.sin(u * Math.PI);
    ctx.strokeStyle = frame.coreColor;
    ctx.lineWidth = 1.1;
    line(ctx, 0, y, 0, y - 6);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // Shards growing out of the prism, staggered like a crystal cluster (not a pattern).
  ctx.lineWidth = 0.6;
  for (const [s, at, size] of SHARDS) {
    const y = at + kick;
    const h = prismHalf(at);
    ctx.beginPath();
    ctx.moveTo(s * (h - 0.3), y + 1.6 * size);
    ctx.lineTo(s * (h + 3.2 * size), y - 2.6 * size);
    ctx.lineTo(s * (h - 0.3), y - 2 * size);
    ctx.closePath();
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = s === -1 ? p.hull[2] : p.hull[1];
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = p.edge;
    ctx.stroke();
  }

  // Outline, ridge, band.
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = p.edge;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-5.6, base);
  ctx.lineTo(-tip, top);
  ctx.lineTo(tip, top);
  ctx.lineTo(5.6, base);
  ctx.stroke();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = p.highlight;
  ctx.lineWidth = 0.7;
  line(ctx, -0.3, base, -0.3, top);
  const bandY = -41 + kick;
  const band = prismHalf(-41);
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = p.trim;
  ctx.lineWidth = 1.6;
  line(ctx, -band, bandY, band, bandY);
  ctx.globalAlpha = 1;

  // A reflection sliding up the lit facet.
  if (frame.time !== 0) {
    const u = (frame.time * 0.45) % 1.5;
    if (u < 1) {
      const y = lerp(base - 3, top + 4, u);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.7 * Math.sin(u * Math.PI);
      ctx.strokeStyle = p.highlight;
      ctx.lineWidth = 1;
      const h = prismHalf(y - kick);
      line(ctx, -h + 1, y + 2, -1.2, y - 2.5);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  if (age < HEAT_TIME) {
    const heat = 1 - age / HEAT_TIME;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.8 * heat;
    ctx.fillStyle = frame.energyColor;
    ctx.beginPath();
    ctx.moveTo(-prismHalf(-45), -45 + kick);
    ctx.lineTo(-tip, top);
    ctx.lineTo(tip, top);
    ctx.lineTo(prismHalf(-45), -45 + kick);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

export function drawRailBarrel(ctx: CanvasRenderingContext2D, skin: Skin, paint: Paint, energy: number, kick: number, age: number): void {
  const p = skin.cosmetics.cannon;
  const top = -MUZZLE + kick;
  const base = -15 + kick;

  // Energy line between the rails, with pulses travelling to the muzzle.
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = frame.energyColor;
  ctx.globalAlpha = (0.25 + 0.45 * energy) * (0.8 + 0.2 * frame.breath);
  ctx.lineWidth = 2.4;
  line(ctx, 0, base - 1, 0, top + 1);
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = frame.coreColor;
  ctx.lineWidth = 0.7;
  line(ctx, 0, base - 1, 0, top + 1);
  if (frame.time !== 0) {
    for (let j = 0; j < 2; j++) {
      const u = (frame.time * 1.6 + j * 0.5) % 1;
      const y = lerp(base, top + 2, u);
      ctx.globalAlpha = 0.5 + 0.5 * energy;
      ctx.drawImage(glowSprite(frame.energyColor), -3.5, y - 3.5, 7, 7);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // Rails (outer top corner chamfered).
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = p.edge;
  for (const s of SIDES) {
    const inner = s * 2.25;
    const outer = s * 4.75;
    ctx.fillStyle = across(ctx, skin, paint, Math.min(inner, outer), Math.max(inner, outer));
    ctx.beginPath();
    ctx.moveTo(inner, base);
    ctx.lineTo(inner, top);
    ctx.lineTo(outer - s * 1, top);
    ctx.lineTo(outer, top + 1.6);
    ctx.lineTo(outer, base);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (age < HEAT_TIME) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.8 * (1 - age / HEAT_TIME);
      ctx.fillStyle = frame.energyColor;
      ctx.fillRect(Math.min(inner, outer), top, 2.5, 5);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // Coils holding the rails.
  for (let i = 0; i < 3; i++) {
    const y = -24.5 - i * 9 + kick;
    ctx.fillStyle = p.trim;
    ctx.beginPath();
    ctx.roundRect(-5.6, y, 11.2, 2.3, 0.8);
    ctx.fill();
    ctx.strokeStyle = p.edge;
    ctx.stroke();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = p.highlight;
    line(ctx, -4.8, y + 0.5, 4.8, y + 0.5);
    ctx.globalAlpha = 1;
  }
}

export function drawBarrels(ctx: CanvasRenderingContext2D, skin: Skin, paint: Paint, pose: CannonPose): void {
  const p = skin.cosmetics.cannon;
  const kick0 = recoilKick(pose.recoil[0]);
  switch (p.barrel) {
    case 'single':
      drawTube(ctx, skin, paint, 0, 1, 3, kick0, pose.shotAge[0]);
      break;
    case 'twin':
      drawTube(ctx, skin, paint, -TWIN_BARREL_OFFSET, 0.66, 3, kick0, pose.shotAge[0]);
      drawTube(ctx, skin, paint, TWIN_BARREL_OFFSET, 0.66, 3, recoilKick(pose.recoil[1]), pose.shotAge[1]);
      break;
    case 'prism':
      drawPrismBarrel(ctx, skin, pose.energy, kick0, pose.shotAge[0]);
      break;
    case 'rail':
      drawRailBarrel(ctx, skin, paint, pose.energy, kick0, pose.shotAge[0]);
      break;
  }
}

