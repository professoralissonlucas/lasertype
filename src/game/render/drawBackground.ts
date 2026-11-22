// Theme background: base color, scrolling nebula, optional grid and parallax stars.
// Shared by the game renderer and the shop preview.
import type { BackgroundState } from './background.ts';
import { NEBULA_SIZE } from './background.ts';
import type { Skin } from './skin.ts';

/** The grid drifts with the middle star layer (offset index 2). */
const GRID_LAYER = 2;

/**
 * `nebula` is the skin's texture as a repeating pattern of this context (patterns
 * belong to a context); `matrix` is reused every frame to position it.
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  skin: Skin,
  nebula: CanvasPattern | null,
  matrix: DOMMatrix,
  background: BackgroundState,
  alpha: number,
  width: number,
  height: number,
): void {
  const theme = skin.cosmetics.theme;
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  // Nebula: the tileable texture stretched to the screen and scrolled as a repeating pattern.
  if (nebula) {
    matrix.a = width / NEBULA_SIZE;
    matrix.d = height / NEBULA_SIZE;
    matrix.e = 0;
    matrix.f = background.offset(0, alpha) * height;
    nebula.setTransform(matrix);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, width, height);
  }

  if (theme.grid && skin.gridStroke) {
    const spacing = theme.grid.spacing;
    const drift = (background.offset(GRID_LAYER, alpha) * height) % spacing;
    ctx.strokeStyle = skin.gridStroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = (width / 2) % spacing; x < width; x += spacing) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = drift; y < height; y += spacing) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }

  ctx.fillStyle = theme.starColor;
  for (let i = 0; i < background.layers.length; i++) {
    const layer = background.layers[i];
    if (!layer) continue;
    const offset = background.offset(i + 1, alpha);
    for (const star of layer.stars) {
      let y = star.y + offset;
      if (y >= 1) y -= 1;
      ctx.globalAlpha = star.alpha;
      ctx.fillRect(star.x * width, y * height, star.size, star.size);
    }
  }
  ctx.globalAlpha = 1;
}
