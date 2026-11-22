// The cannon, drawn in layers from its cosmetic parameters: platform, energy ring,
// barrel(s), turret head, energy core and, after a shot, the muzzle glow, sparks and
// smoke. Every model keeps the same footprint (2 × LAYOUT.baseRadius wide) and the muzzle
// at LAYOUT.barrelLength from the pivot, where the lasers start.
//
// Coordinates are local to the pivot (y grows downward; before rotating, the barrel points
// to −y). Light comes from the top left whatever the aim: rotating parts build their path
// in the rotated frame and are filled with gradients of the world frame. No shadowBlur:
// glows are pre-rendered sprites stamped with 'lighter'.
//
// The layers live in render/cannon/ (model = pose and pure rules, kit = shared pieces,
// platforms, barrels, heads, muzzle); this file puts them together.
import { clamp } from '../../utils/math.ts';
import { drawBarrels } from './cannon/barrels.ts';
import {
  drawArmoredHead,
  drawCore,
  drawCoreGlow,
  drawCrystalHead,
  drawHeavyHead,
  drawOrbitalHead,
} from './cannon/heads.ts';
import { frame, paintFor } from './cannon/kit.ts';
import { drawMuzzleEffects } from './cannon/muzzle.ts';
import {
  drawArmoredPlatform,
  drawCrystalPlatform,
  drawEnergyRing,
  drawHeavyPlatform,
  drawOrbit,
  drawOrbitalPlatform,
} from './cannon/platforms.ts';
import type { CannonPose } from './cannon/model.ts';
import { PALETTE } from './palette.ts';
import type { Skin } from './skin.ts';

export {
  barrelOf,
  coreEnergy,
  createCannonPose,
  IDLE_ENERGY,
  muzzleSideOffset,
  recoilKick,
  TWIN_BARREL_OFFSET,
  type CannonPose,
} from './cannon/model.ts';

/** Idle "breathing" of the lights (rad/s) and the energy ring pulse. */
const BREATH_SPEED = 2.1;
const RING_PULSE_SPEED = 2.6;

/** The whole cannon at its pivot (cx, cy) in the given pose. */
export function drawCannon(ctx: CanvasRenderingContext2D, skin: Skin, cx: number, cy: number, pose: CannonPose): void {
  const p = skin.cosmetics.cannon;
  const paint = paintFor(ctx, skin);
  const laser = skin.cosmetics.laserColor;
  const energy = clamp(pose.energy, 0, 1);
  const ready = energy >= 1;
  frame.energyColor = pose.missFlash ? PALETTE.danger : laser.glow;
  frame.coreColor = pose.missFlash ? PALETTE.danger : laser.core;
  frame.time = pose.reduced ? 0 : pose.time;
  frame.breath = pose.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(pose.time * BREATH_SPEED);
  frame.pulse = pose.reduced ? 0.6 : 0.5 + 0.5 * Math.sin(pose.time * RING_PULSE_SPEED);
  const angle = pose.angle;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = 'round';

  switch (p.body) {
    case 'armored':
      drawArmoredPlatform(ctx, p, paint);
      drawEnergyRing(ctx, 17.5, energy);
      break;
    case 'heavy':
      drawHeavyPlatform(ctx, p, paint, energy);
      drawEnergyRing(ctx, 18.5, energy);
      break;
    case 'crystal':
      drawCrystalPlatform(ctx, p);
      drawEnergyRing(ctx, 17.5, energy);
      break;
    case 'orbital':
      drawOrbitalPlatform(ctx, p, paint);
      drawOrbit(ctx, p, false);
      break;
  }

  ctx.rotate(angle);
  drawBarrels(ctx, skin, paint, pose);
  switch (p.body) {
    case 'armored':
      drawArmoredHead(ctx, skin, paint, angle);
      break;
    case 'heavy':
      drawHeavyHead(ctx, skin, paint, angle);
      break;
    case 'crystal':
      ctx.rotate(-angle);
      drawCoreGlow(ctx, energy);
      ctx.rotate(angle);
      drawCrystalHead(ctx, skin, angle);
      break;
    case 'orbital':
      drawOrbitalHead(ctx, skin, paint, angle);
      break;
  }
  ctx.rotate(-angle);

  if (p.body !== 'crystal') drawCoreGlow(ctx, energy);
  drawCore(ctx, energy, ready, p.body === 'crystal' ? 3.6 : 4.3);
  if (p.body === 'orbital') drawOrbit(ctx, p, true);
  drawMuzzleEffects(ctx, skin, pose);

  ctx.restore();
}
