// Particles and laser beams, colored by the skin (equipped laser and explosion).
// Shared by the game renderer and the shop preview.
import { lerp } from '../../utils/math.ts';
import type { ParticlePool } from '../effects/particles.ts';
import type { LaserPool } from '../entities/Laser.ts';
import type { Skin } from './skin.ts';

const TAU = Math.PI * 2;
/** Spark streak length = velocity × this (seconds). */
const SPARK_STREAK = 0.035;
/** Laser glow radius (CSS px; scaled by DPR because shadowBlur ignores the transform). */
const LASER_GLOW = 16;

export function drawParticles(
  ctx: CanvasRenderingContext2D,
  pool: ParticlePool,
  alpha: number,
  skin: Skin,
  font: string,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const p of pool.items) {
    if (!p.active) continue;
    const t = p.life / p.maxLife; // 1 at birth → 0 at death
    const x = lerp(p.prevX, p.x, alpha);
    const y = lerp(p.prevY, p.y, alpha);
    const size = lerp(p.sizeEnd, p.size, t);
    const color = skin.fx[p.color];

    switch (p.kind) {
      case 'spark':
        ctx.globalAlpha = t;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(0.5, size);
        ctx.beginPath();
        ctx.moveTo(x - p.vx * SPARK_STREAK, y - p.vy * SPARK_STREAK);
        ctx.lineTo(x, y);
        ctx.stroke();
        break;
      case 'square':
        if (size <= 0) break;
        ctx.globalAlpha = t;
        ctx.fillStyle = color;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
        break;
      case 'glow':
        if (size <= 0) break;
        ctx.globalAlpha = t;
        ctx.drawImage(skin.glow[p.color], x - size, y - size, size * 2, size * 2);
        break;
      case 'ring':
        ctx.globalAlpha = t;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1 + 2 * t;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0, size), 0, TAU);
        ctx.stroke();
        break;
      case 'glyph':
        ctx.globalAlpha = Math.min(1, t * 1.4);
        ctx.fillStyle = color;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.angle);
        ctx.scale(size, size);
        ctx.fillText(p.glyph, 0, 0);
        ctx.restore();
        break;
    }
  }
  ctx.restore();
}

/** Beams with glow: a blurred additive halo plus a thin bright core, and a muzzle flash. */
export function drawBeams(ctx: CanvasRenderingContext2D, lasers: LaserPool, skin: Skin, dpr: number): void {
  const laserColor = skin.cosmetics.laserColor;
  const width = laserColor.width;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const laser of lasers.items) {
    if (!laser.active) continue;
    const t = Math.max(0, laser.life / laser.maxLife);

    ctx.beginPath();
    ctx.moveTo(laser.x0, laser.y0);
    ctx.lineTo(laser.x1, laser.y1);

    ctx.shadowColor = laserColor.glow;
    ctx.shadowBlur = LASER_GLOW * dpr;
    ctx.globalAlpha = 0.55 * t;
    ctx.strokeStyle = laserColor.glow;
    ctx.lineWidth = (2 + 4 * t) * width;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.globalAlpha = t;
    ctx.strokeStyle = laserColor.core;
    ctx.lineWidth = (1.2 + t) * width;
    ctx.stroke();

    const flash = (8 + 10 * t) * width;
    ctx.drawImage(skin.glow.laser, laser.x0 - flash, laser.y0 - flash, flash * 2, flash * 2);
  }
  ctx.restore();
}
