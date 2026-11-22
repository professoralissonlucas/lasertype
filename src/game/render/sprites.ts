// Pre-rendered canvases (glow blobs, bands, nebula textures), cached so the game and the
// shop preview share them and equipping a cosmetic never regenerates what already exists.
import type { ThemeParams } from '../../cosmetics/types.ts';
import { createRng } from '../../utils/rng.ts';
import { generateNebula, NEBULA_SIZE } from './background.ts';
import { hexToRgb, withAlpha } from './palette.ts';

const GLOW_SIZE = 64;

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

const glowCache = new Map<string, HTMLCanvasElement>();

/** Soft radial blob, drawn once per color and stamped with 'lighter' (much cheaper than shadowBlur). */
export function glowSprite(color: string): HTMLCanvasElement {
  const cached = glowCache.get(color);
  if (cached) return cached;
  const canvas = createCanvas(GLOW_SIZE, GLOW_SIZE);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const c = GLOW_SIZE / 2;
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
    gradient.addColorStop(0, withAlpha(color, 1));
    gradient.addColorStop(0.25, withAlpha(color, 0.45));
    gradient.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
  }
  glowCache.set(color, canvas);
  return canvas;
}

/** Vertical soft band (transparent → color → transparent), stretched under the perimeter. */
export function bandSprite(color: string): HTMLCanvasElement {
  const canvas = createCanvas(1, 64);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const gradient = ctx.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, withAlpha(color, 0));
  gradient.addColorStop(0.5, withAlpha(color, 1));
  gradient.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1, 64);
  return canvas;
}

const nebulaCache = new Map<string, HTMLCanvasElement>();

/** The theme's tileable nebula texture (generated once per theme). */
export function nebulaTexture(theme: ThemeParams): HTMLCanvasElement {
  const key = `${theme.nebulaSeed}|${theme.nebula[0]}|${theme.nebula[1]}|${theme.nebulaAlpha}`;
  const cached = nebulaCache.get(key);
  if (cached) return cached;
  const canvas = createCanvas(NEBULA_SIZE, NEBULA_SIZE);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const pixels = generateNebula(
      NEBULA_SIZE,
      createRng(theme.nebulaSeed),
      hexToRgb(theme.nebula[0]),
      hexToRgb(theme.nebula[1]),
      theme.nebulaAlpha,
    );
    const image = ctx.createImageData(NEBULA_SIZE, NEBULA_SIZE);
    image.data.set(pixels);
    ctx.putImageData(image, 0, 0);
  }
  nebulaCache.set(key, canvas);
  return canvas;
}
