// Platforms (static, under the turret), the energy ring around the turret and the orbital
// ring of the halo. Local coordinates: pivot at the origin, y down.
import type { CannonParams } from '../../../cosmetics/types.ts';
import { lerp } from '../../../utils/math.ts';
import { glowSprite } from '../sprites.ts';
import { engrave, frame, glint, lamp, lampIntensity, line, poly, rivet, SIDES, TAU, type Paint } from './kit.ts';

/** Orbital ring nodes: turns per second. */
const ORBIT_SPEED = 0.22;
const ORBIT_NODES = 3;

// Outlines as flat [x0, y0, x1, y1, ...] lists (module constants: no allocation).
const ARMORED_HULL = [-30, 13, -30, 5, -20, -6, 20, -6, 30, 5, 30, 13];
const HEAVY_HULL = [-30, 13, -30, 2, -24, -5, 24, -5, 30, 2, 30, 13];
const FOOT = [-30, 13, 30, 13, 28, 16, -28, 16];
const CRYSTAL_HULL = [-28, 15, -30, 6, -20, -6, 20, -6, 30, 6, 28, 15];
const CRYSTAL_FACETS = [
  [-30, 6, -20, -6, -10, 15, -28, 15],
  [-20, -6, 20, -6, 10, 15, -10, 15],
  [20, -6, 30, 6, 28, 15, 10, 15],
] as const;
const ORBITAL_HULL = [-24, 13, -26, 9, -15, -1, 15, -1, 26, 9, 24, 13];

// ---------- Platforms ----------

export function hullOutline(ctx: CanvasRenderingContext2D, p: CannonParams, paint: Paint, points: readonly number[]): void {
  poly(ctx, points);
  ctx.globalAlpha = p.opacity;
  ctx.fillStyle = paint.plate;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.strokeStyle = p.edge;
  ctx.stroke();
}

/** Lit top edges (inset), from the left shoulder to the right one. */
export function topEdge(ctx: CanvasRenderingContext2D, p: CannonParams, xa: number, ya: number, xb: number, yb: number): void {
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = p.highlight;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-xa + 0.9, ya);
  ctx.lineTo(-xb + 0.5, yb + 0.9);
  ctx.lineTo(xb - 0.5, yb + 0.9);
  ctx.lineTo(xa - 0.9, ya);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function foot(ctx: CanvasRenderingContext2D, p: CannonParams): void {
  poly(ctx, FOOT);
  ctx.fillStyle = p.hull[0];
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = p.edge;
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = p.highlight;
  line(ctx, -29, 13.9, 29, 13.9);
  ctx.globalAlpha = 1;
}

export function vents(ctx: CanvasRenderingContext2D, p: CannonParams, x: number, y: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const vy = y + i * 2.1;
    ctx.fillStyle = p.edge;
    ctx.fillRect(x, vy, 5, 1.1);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = p.highlight;
    ctx.fillRect(x, vy + 1.1, 5, 0.5);
    ctx.globalAlpha = 1;
  }
}

export function drawArmoredPlatform(ctx: CanvasRenderingContext2D, p: CannonParams, paint: Paint): void {
  foot(ctx, p);
  hullOutline(ctx, p, paint, ARMORED_HULL);
  topEdge(ctx, p, 30, 5, 20, -6);
  for (const s of SIDES) {
    engrave(ctx, p, s * 21, -4.9, s * 21, 13, 1, 0);
    engrave(ctx, p, s * 30, 6, s * 14, 6, 0, 1);
    vents(ctx, p, s === -1 ? -28.2 : 23.2, 8.2, 2);
    rivet(ctx, p, s * 17.5, -2.5);
    rivet(ctx, p, s * 17.5, 10.3);
    lamp(ctx, frame.energyColor, s * 25.2, 1.6, lampIntensity(s));
  }
}

export function drawHeavyPlatform(ctx: CanvasRenderingContext2D, p: CannonParams, paint: Paint, energy: number): void {
  foot(ctx, p);
  hullOutline(ctx, p, paint, HEAVY_HULL);
  topEdge(ctx, p, 30, 2, 24, -5);
  for (const s of SIDES) {
    // Power cell: a recessed box whose bars light up with the energy.
    const x = s === -1 ? -29 : 21.5;
    ctx.fillStyle = p.edge;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.roundRect(x, 1.2, 7.5, 10, 1.2);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = p.highlight;
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (let i = 0; i < 3; i++) {
      const lit = energy > i / 3 ? 1 : 0.25;
      ctx.globalAlpha = lit * (0.75 + 0.25 * frame.breath);
      ctx.fillStyle = p.trim;
      ctx.fillRect(x + 1.4, 8.6 - i * 2.9, 4.7, 1.4);
    }
    ctx.globalAlpha = 1;
    rivet(ctx, p, s * 18, 9.8);
    rivet(ctx, p, s * 18, -1.8);
  }
}

export function drawCrystalPlatform(ctx: CanvasRenderingContext2D, p: CannonParams): void {
  // Three facets, lit left to right, translucent.
  const shades = [p.hull[2], p.hull[1], p.hull[0]] as const;
  const alphas = [0.85, 0.8, 0.95] as const;
  for (let i = 0; i < 3; i++) {
    poly(ctx, CRYSTAL_FACETS[i] ?? CRYSTAL_FACETS[0]);
    ctx.globalAlpha = p.opacity * (alphas[i] ?? 1);
    ctx.fillStyle = shades[i] ?? p.hull[1];
    ctx.fill();
  }
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = p.edge;
  ctx.lineWidth = 0.7;
  line(ctx, -20, -6, -10, 15);
  line(ctx, 20, -6, 10, 15);
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 1;
  poly(ctx, CRYSTAL_HULL);
  ctx.stroke();
  // Reflections.
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = p.highlight;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1.3;
  line(ctx, -26.5, 12, -21, 1);
  ctx.globalAlpha = 0.22;
  line(ctx, -23, 13.5, -19.5, 6.5);
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 0.9;
  line(ctx, 14, 13.5, 22.5, 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // A sparkle sliding along the top edge now and then.
  if (frame.time !== 0) {
    const u = (frame.time * 0.3) % 1.6;
    if (u < 1) glint(ctx, p.highlight, lerp(-20, 20, u), -6, 2.6, Math.sin(u * Math.PI) * 0.9);
  }
}

export function drawOrbitalPlatform(ctx: CanvasRenderingContext2D, p: CannonParams, paint: Paint): void {
  // Hover thrusters under the plinth.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.3 + 0.2 * frame.pulse;
  ctx.drawImage(glowSprite(frame.energyColor), -22, 9, 44, 11);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  hullOutline(ctx, p, paint, ORBITAL_HULL);
  topEdge(ctx, p, 26, 9, 15, -1);
  for (const s of SIDES) {
    // Trim line along each slope, inset.
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = p.trim;
    ctx.lineWidth = 1;
    line(ctx, s * 23.2, 9.6, s * 15.4, 1.6);
    ctx.globalAlpha = 1;
    engrave(ctx, p, s * 19.5, 5, s * 19.5, 12.6, 1, 0);
    lamp(ctx, frame.energyColor, s * 15.5, 13.6, 0.9);
  }
}

// ---------- Energy ring (around the turret, laser color) ----------

export function drawEnergyRing(ctx: CanvasRenderingContext2D, radius: number, energy: number): void {
  const boost = 0.45 + 0.8 * energy;
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = frame.energyColor;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, radius, Math.PI - 0.3, TAU + 0.3);
  ctx.globalAlpha = (0.1 + 0.16 * frame.pulse) * boost;
  ctx.lineWidth = 4.2;
  ctx.stroke();
  ctx.globalAlpha = Math.min(1, (0.5 + 0.3 * frame.pulse) * boost);
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.globalAlpha = 0.45 * frame.pulse * boost;
  ctx.strokeStyle = frame.coreColor;
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
  ctx.globalCompositeOperation = 'source-over';
}

// ---------- Orbital ring (halo) ----------

const ORBIT_RX = 27.5;
const ORBIT_RY = 7.2;
const ORBIT_Y = -1;
const ORBIT_TILT = -0.16;

/** Back half (behind the turret) or front half, with the nodes on that side. */
export function drawOrbit(ctx: CanvasRenderingContext2D, p: CannonParams, front: boolean): void {
  const from = front ? 0 : Math.PI;
  ctx.beginPath();
  ctx.ellipse(0, ORBIT_Y, ORBIT_RX, ORBIT_RY, ORBIT_TILT, from, from + Math.PI);
  ctx.strokeStyle = p.edge;
  ctx.globalAlpha = front ? 0.7 : 0.45;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = frame.energyColor;
  const depth = front ? 1 : 0.5;
  ctx.globalAlpha = (0.1 + 0.12 * frame.pulse) * depth;
  ctx.lineWidth = 4.5;
  ctx.stroke();
  ctx.globalAlpha = (0.55 + 0.3 * frame.pulse) * depth;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  const cosT = Math.cos(ORBIT_TILT);
  const sinT = Math.sin(ORBIT_TILT);
  for (let i = 0; i < ORBIT_NODES; i++) {
    const theta = (frame.time * ORBIT_SPEED + i / ORBIT_NODES) * TAU;
    const near = Math.sin(theta);
    if (front !== near > 0) continue;
    const ex = ORBIT_RX * Math.cos(theta);
    const ey = ORBIT_RY * near;
    const x = ex * cosT - ey * sinT;
    const y = ORBIT_Y + ex * sinT + ey * cosT;
    const d = (near + 1) / 2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45 + 0.45 * d;
    const glow = 8 + 5 * d;
    ctx.drawImage(glowSprite(frame.energyColor), x - glow / 2, y - glow / 2, glow, glow);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = p.edge;
    ctx.beginPath();
    ctx.arc(x, y, 1.9 + 0.7 * d, 0, TAU);
    ctx.fill();
    ctx.fillStyle = p.hull[2];
    ctx.beginPath();
    ctx.arc(x, y, 1.4 + 0.6 * d, 0, TAU);
    ctx.fill();
    ctx.fillStyle = frame.energyColor;
    ctx.globalAlpha = 0.6 + 0.4 * d;
    ctx.beginPath();
    ctx.arc(x - 0.2, y - 0.2, 0.75 + 0.3 * d, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

