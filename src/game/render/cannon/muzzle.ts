// After a shot: flash, sparks and smoke at the muzzle (world frame, pivot at the origin).
import { hashUnit } from '../../../utils/rng.ts';
import type { BarrelIndex } from '../../entities/Cannon.ts';
import type { Skin } from '../skin.ts';
import { glowSprite, puffSprite } from '../sprites.ts';
import { frame, line, MUZZLE, TAU } from './kit.ts';
import { recoilKick, TWIN_BARREL_OFFSET, type CannonPose } from './model.ts';

/** Seconds after a shot: flash, sparks, smoke. */
const FLASH_TIME = 0.06;
const SPARK_TIME = 0.2;
const SMOKE_TIME = 0.45;
const SPARKS = 6;
const PUFFS = 3;
const SMOKE_COLOR = '#D5DEEA';


export function drawMuzzleEffects(ctx: CanvasRenderingContext2D, skin: Skin, pose: CannonPose): void {
  const p = skin.cosmetics.cannon;
  const barrels = p.barrel === 'twin' ? 2 : 1;
  const a = pose.angle;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  for (let b = 0; b < barrels; b++) {
    const index: BarrelIndex = b === 0 ? 0 : 1;
    const age = pose.shotAge[index];
    if (age >= SMOKE_TIME) continue;
    const side = p.barrel === 'twin' ? (index === 0 ? -TWIN_BARREL_OFFSET : TWIN_BARREL_OFFSET) : 0;
    const reach = MUZZLE - recoilKick(pose.recoil[index]);
    const mx = Math.cos(a) * side + dx * reach;
    const my = Math.sin(a) * side + dy * reach;
    const seed = pose.shotSeed[index];

    if (!pose.reduced) {
      // Smoke: pale, wide wisps pushed out of the muzzle, slowing, spreading and rising.
      for (let j = 0; j < PUFFS; j++) {
        const t = age - j * 0.04;
        if (t <= 0) continue;
        const u = t / SMOKE_TIME;
        if (u >= 1) continue;
        const sway = (hashUnit(seed, 20 + j) - 0.5) * 10;
        const along = 3 + 14 * Math.sqrt(u) + j * 2.5;
        const x = mx + dx * along - dy * sway * u;
        const y = my + dy * along + dx * sway * u - 12 * u * u;
        const r = 4 + 12 * u + j * 1.5;
        ctx.globalAlpha = 0.2 * Math.sin(Math.min(1, u * 5) * Math.PI * 0.5) * (1 - u);
        ctx.drawImage(puffSprite(SMOKE_COLOR), x - r, y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    }

    ctx.globalCompositeOperation = 'lighter';
    if (age < FLASH_TIME) {
      // Flash: a glow plus a short flame along the barrel.
      const f = 1 - age / FLASH_TIME;
      const size = 12 + 18 * f;
      ctx.globalAlpha = f;
      ctx.drawImage(glowSprite(frame.energyColor), mx - size / 2, my - size / 2, size, size);
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(a);
      const flame = 3 + 9 * f;
      ctx.fillStyle = frame.coreColor;
      ctx.beginPath();
      ctx.ellipse(0, -flame / 2, 1.1 + 1.2 * f, flame / 2, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    if (!pose.reduced && age < SPARK_TIME) {
      // Sparks: each leaves a little later, in its own direction (a wide fan) and speed,
      // and burns out on its own, so they scatter instead of forming a pattern.
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      for (let i = 0; i < SPARKS; i++) {
        const t = age - hashUnit(seed, i * 3) * 0.04;
        const life = 0.07 + 0.09 * hashUnit(seed, i * 3 + 2);
        if (t <= 0 || t >= life) continue;
        const spread = (hashUnit(seed, i * 3 + 1) - 0.5) * 2.6;
        const speed = 60 + 190 * hashUnit(seed, i * 3 + 2);
        const sx = Math.sin(a + spread);
        const sy = -Math.cos(a + spread);
        const d = 2 + speed * t;
        const tail = Math.min(d - 1, 1.5 + 2.5 * (1 - t / life));
        ctx.globalAlpha = 1 - t / life;
        ctx.strokeStyle = i % 2 === 0 ? frame.coreColor : frame.energyColor;
        line(ctx, mx + sx * d, my + sy * d, mx + sx * (d - tail), my + sy * (d - tail));
      }
      ctx.lineCap = 'butt';
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

