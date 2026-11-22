// The cannon, drawn from its cosmetic parameters. Every style keeps the same size, so
// the muzzle stays at LAYOUT.barrelLength from the pivot whatever is equipped.
import type { CannonParams } from '../../cosmetics/types.ts';
import { LAYOUT } from './layout.ts';
import { PALETTE } from './palette.ts';
import type { Skin } from './skin.ts';

const TAU = Math.PI * 2;
/** Twin barrels: half-distance between the two barrels (px). Shots alternate sides. */
export const TWIN_BARREL_OFFSET = 4.5;
/** Ring base: orbiting nodes and their speed (turns per second along the arc). */
const RING_NODES = 3;
const RING_NODE_SPEED = 0.22;

/** Sideways muzzle offset for shot number `shot` (twin barrels alternate; others 0). */
export function muzzleSideOffset(params: CannonParams, shot: number): number {
  if (params.barrel !== 'twin') return 0;
  return shot % 2 === 0 ? -TWIN_BARREL_OFFSET : TWIN_BARREL_OFFSET;
}

function drawBase(ctx: CanvasRenderingContext2D, skin: Skin, cx: number, cy: number, time: number): void {
  const params = skin.cosmetics.cannon;
  const r = LAYOUT.baseRadius;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = params.baseStroke;
  ctx.fillStyle = skin.cannonFill;

  switch (params.base) {
    case 'dome':
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case 'prism': {
      // Half hexagon with facets running to the pivot.
      const top = cy - r * 0.87;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx - r * 0.5, top);
      ctx.lineTo(cx + r * 0.5, top);
      ctx.lineTo(cx + r, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.5, top);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + r * 0.5, top);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case 'ring': {
      // Small inner dome inside an open outer ring with nodes gliding along it.
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.62, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = params.hubColor;
      for (let i = 0; i < RING_NODES; i++) {
        const phase = (time * RING_NODE_SPEED + i / RING_NODES) % 1;
        const angle = Math.PI + phase * Math.PI;
        ctx.globalAlpha = Math.sin(phase * Math.PI);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, 3, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
  }
}

/** Barrel in the rotated frame: pivot at the origin, pointing up (−y); `kick` = recoil in px. */
function drawBarrel(ctx: CanvasRenderingContext2D, params: CannonParams, color: string, kick: number): void {
  const length = LAYOUT.barrelLength;
  const width = LAYOUT.barrelWidth;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  switch (params.barrel) {
    case 'single':
      ctx.fillRect(-width / 2, -length + kick, width, length);
      break;
    case 'twin': {
      const w = width * 0.7;
      ctx.fillRect(-TWIN_BARREL_OFFSET - w / 2, -length + kick, w, length);
      ctx.fillRect(TWIN_BARREL_OFFSET - w / 2, -length + kick, w, length);
      // A brace holding the pair together.
      ctx.fillRect(-TWIN_BARREL_OFFSET - w / 2, -length * 0.45 + kick, TWIN_BARREL_OFFSET * 2 + w, 3);
      break;
    }
    case 'tapered':
      ctx.beginPath();
      ctx.moveTo(-width * 0.8, kick);
      ctx.lineTo(-width * 0.25, -length + kick);
      ctx.lineTo(width * 0.25, -length + kick);
      ctx.lineTo(width * 0.8, kick);
      ctx.closePath();
      ctx.fill();
      break;
    case 'rail': {
      const rail = 2.5;
      ctx.fillRect(-width / 2, -length + kick, rail, length);
      ctx.fillRect(width / 2 - rail, -length + kick, rail, length);
      ctx.fillRect(-width / 2, -length * 0.6 + kick, width, 2);
      // Energy core between the rails.
      ctx.globalAlpha = 0.55;
      ctx.fillRect(-0.75, -length * 0.92 + kick, 1.5, length * 0.75);
      ctx.globalAlpha = 1;
      break;
    }
  }
}

/** Base, then the barrel on top, then the pivot hub. `missFlash` turns the barrel red. */
export function drawCannon(
  ctx: CanvasRenderingContext2D,
  skin: Skin,
  cx: number,
  cy: number,
  angle: number,
  recoil: number,
  missFlash: boolean,
  time: number,
): void {
  const params = skin.cosmetics.cannon;
  drawBase(ctx, skin, cx, cy, time);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  drawBarrel(ctx, params, missFlash ? PALETTE.danger : params.barrelColor, recoil * LAYOUT.recoilDistance);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, params.base === 'ring' ? 6 : 7, 0, TAU);
  ctx.fillStyle = params.hubColor;
  ctx.fill();
}
