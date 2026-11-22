// Contact sheets of every cannon in the catalog, drawn with the game's renderer, for
// reviewing the art (`npm run share:images -- --cannons [folder]`, scripts/share-images.ts):
//   cannons-1x.png / cannons-2x.png  real size (screen at 1× and 2× pixel ratio): idle, firing
//   cannons-zoom.png                  4×: idle, firing, firing with "Reduzir efeitos"
//   cannons-sequence.png              3×: frames after a shot (recoil, flash, sparks, smoke)
//   cannons-energy.png                3×: energy core from idle to EMP ready
import { itemsOfType } from '../../src/cosmetics/catalog.ts';
import { DEFAULT_COSMETICS } from '../../src/cosmetics/equip.ts';
import type { CannonParams } from '../../src/cosmetics/types.ts';
import { Cannon } from '../../src/game/entities/Cannon.ts';
import { BackgroundState } from '../../src/game/render/background.ts';
import { drawBackground } from '../../src/game/render/drawBackground.ts';
import { LaserPool } from '../../src/game/entities/Laser.ts';
import {
  barrelOf,
  createCannonPose,
  drawCannon,
  TWIN_BARREL_OFFSET,
  type CannonPose,
} from '../../src/game/render/drawCannon.ts';
import { drawBeams } from '../../src/game/render/drawFx.ts';
import { LAYOUT } from '../../src/game/render/layout.ts';
import { PALETTE } from '../../src/game/render/palette.ts';
import { Skin } from '../../src/game/render/skin.ts';
import { createRng } from '../../src/utils/rng.ts';

const CELL_W = 150;
const CELL_H = 132;
const LABEL_H = 18;
/** Pivot like in the game: LAYOUT.cannonOffset above the bottom of the cell. */
const PIVOT_Y = CELL_H - LAYOUT.cannonOffset;
const PERIMETER_Y = PIVOT_Y - (LAYOUT.perimeterOffset - LAYOUT.cannonOffset);
const STEP = 1 / 60;
const FIRE_ANGLE = 0.5;
/** Beam lifetime in the game (Game.ts LASER_LIFETIME). */
const BEAM_LIFE = 0.12;
const lasers = new LaserPool(1);

const CANNONS = itemsOfType('cannon');

interface Cell {
  readonly title: string;
  /** Fills the pose for this cell. */
  readonly pose: (params: CannonParams) => CannonPose;
}

const background = new BackgroundState(createRng('cannon-sheet'));

function skinFor(params: CannonParams): Skin {
  return new Skin({ ...DEFAULT_COSMETICS, cannon: params });
}

function idle(time = 1.3): CannonPose {
  const pose = createCannonPose();
  pose.time = time;
  return pose;
}

/** The pose `seconds` after firing at FIRE_ANGLE, simulated with the game's Cannon. */
function afterShot(params: CannonParams, seconds: number, reduced = false, energy = 0.7): CannonPose {
  const cannon = new Cannon();
  // The twin's other barrel fired one shot earlier (they alternate).
  const shots = params.barrel === 'twin' ? 2 : 1;
  for (let shot = 0; shot < shots; shot++) {
    cannon.snapTo(FIRE_ANGLE);
    cannon.kick(barrelOf(params, shot));
    if (shot < shots - 1) for (let t = 0; t < 0.11; t += STEP) {
      cannon.beginStep();
      cannon.recover(STEP);
    }
  }
  for (let t = 0; t < seconds - 1e-9; t += STEP) {
    cannon.beginStep();
    cannon.recover(STEP);
  }
  const pose = createCannonPose();
  cannon.writeMotion(1, pose);
  pose.energy = energy;
  pose.time = 1.3 + seconds;
  pose.reduced = reduced;
  return pose;
}

/** The beam of the latest shot, drawn under the cannon like in the game. */
function drawShot(ctx: CanvasRenderingContext2D, skin: Skin, params: CannonParams, pose: CannonPose, scale: number): void {
  const last = params.barrel === 'twin' ? 1 : 0;
  const age = pose.shotAge[last];
  if (age >= BEAM_LIFE) return;
  const side = params.barrel === 'twin' ? TWIN_BARREL_OFFSET : 0;
  const a = pose.angle;
  const mx = CELL_W / 2 + Math.cos(a) * side + Math.sin(a) * LAYOUT.barrelLength;
  const my = PIVOT_Y + Math.sin(a) * side - Math.cos(a) * LAYOUT.barrelLength;
  lasers.clear();
  lasers.fire(mx, my, mx + Math.sin(a) * 160, my - Math.cos(a) * 160, BEAM_LIFE);
  lasers.update(age);
  drawBeams(ctx, lasers, skin, scale);
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D canvas');
  return ctx;
}

/** A grid: one row per cannon, one column per cell kind, at `scale` device pixels per px. */
function sheet(cells: readonly Cell[], scale: number, transpose = false): HTMLCanvasElement {
  const cols = transpose ? CANNONS.length : cells.length;
  const rows = transpose ? cells.length : CANNONS.length;
  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL_W * scale;
  canvas.height = rows * (CELL_H + LABEL_H) * scale;
  const ctx = context(canvas);
  ctx.fillStyle = '#0B1220';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  CANNONS.forEach((item, c) => {
    const params = item.params;
    const skin = skinFor(params);
    const nebula = ctx.createPattern(skin.nebula, 'repeat');
    cells.forEach((cell, k) => {
      const col = transpose ? c : k;
      const row = transpose ? k : c;
      const x = col * CELL_W;
      const y = row * (CELL_H + LABEL_H);
      ctx.setTransform(scale, 0, 0, scale, x * scale, y * scale);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, CELL_W, CELL_H);
      ctx.clip();
      drawBackground(ctx, skin, nebula, new DOMMatrix(), background, 1, CELL_W, CELL_H);
      ctx.strokeStyle = PALETTE.danger;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.moveTo(0, PERIMETER_Y);
      ctx.lineTo(CELL_W, PERIMETER_Y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      const pose = cell.pose(params);
      drawShot(ctx, skin, params, pose, scale);
      drawCannon(ctx, skin, CELL_W / 2, PIVOT_Y, pose);
      ctx.restore();
      ctx.fillStyle = PALETTE.text;
      ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${item.name['pt-BR']} · ${cell.title}`, 6, CELL_H + LABEL_H / 2);
    });
  });
  return canvas;
}

const BASIC: readonly Cell[] = [
  { title: 'parado', pose: () => idle() },
  { title: 'disparando', pose: (params) => afterShot(params, 0.025) },
];

const ZOOM: readonly Cell[] = [
  ...BASIC,
  { title: 'disparando (reduzir efeitos)', pose: (params) => afterShot(params, 0.025, true) },
];

const SEQUENCE: readonly Cell[] = [0, 0.02, 0.05, 0.09, 0.14, 0.22, 0.32, 0.44].map((seconds) => ({
  title: `${Math.round(seconds * 1000)} ms`,
  pose: (params: CannonParams) => afterShot(params, seconds),
}));

const ENERGY: readonly Cell[] = [
  { title: 'energia 0,2', energy: 0.2 },
  { title: '0,5', energy: 0.5 },
  { title: '0,8', energy: 0.8 },
  { title: 'EMP pronto', energy: 1 },
].map(({ title, energy }) => ({
  title,
  pose: () => {
    const pose = idle(2);
    pose.angle = -0.35;
    pose.energy = energy;
    return pose;
  },
}));

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

async function send(file: string, canvas: HTMLCanvasElement): Promise<void> {
  const response = await fetch(`/__share?file=${encodeURIComponent(file)}`, { method: 'POST', body: await toBlob(canvas) });
  if (!response.ok) throw new Error(`saving ${file}: HTTP ${response.status}`);
}

async function run(): Promise<void> {
  await document.fonts.ready;
  await send('cannons-1x.png', sheet(BASIC, 1));
  await send('cannons-2x.png', sheet(BASIC, 2));
  await send('cannons-zoom.png', sheet(ZOOM, 4));
  await send('cannons-sequence.png', sheet(SEQUENCE, 3));
  await send('cannons-energy.png', sheet(ENERGY, 3));
}

run().catch((error: unknown) => {
  void fetch(`/__share?error=${encodeURIComponent(String(error))}`, { method: 'POST' });
});
