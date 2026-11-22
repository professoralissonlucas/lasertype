// A Skin = the equipped cosmetics plus everything derived from them that drawing needs
// (particle colors, glow sprites, nebula texture, precomputed rgba strings). Built once
// per equip change, never per frame. The game renderer and the shop preview each hold one.
import type { ResolvedCosmetics } from '../../cosmetics/types.ts';
import { FX_COLORS, type FxColor } from '../effects/particles.ts';
import { fxPalette, withAlpha } from './palette.ts';
import { glowSprite, nebulaTexture } from './sprites.ts';

export class Skin {
  readonly cosmetics: ResolvedCosmetics;
  /** Color of each particle slot. */
  readonly fx: Readonly<Record<FxColor, string>>;
  readonly glow: Readonly<Record<FxColor, HTMLCanvasElement>>;
  readonly nebula: HTMLCanvasElement;
  /** Stroke of normal (unlocked, not special) word plates. */
  readonly plateStroke: string;
  /** Theme grid stroke, or null without a grid. */
  readonly gridStroke: string | null;

  constructor(cosmetics: ResolvedCosmetics) {
    this.cosmetics = cosmetics;
    this.fx = fxPalette(cosmetics);
    const glow = {} as Record<FxColor, HTMLCanvasElement>;
    for (const slot of FX_COLORS) glow[slot] = glowSprite(this.fx[slot]);
    this.glow = glow;
    this.nebula = nebulaTexture(cosmetics.theme);
    const border = cosmetics.wordBorder;
    this.plateStroke = withAlpha(border.color, border.alpha);
    const grid = cosmetics.theme.grid;
    this.gridStroke = grid ? withAlpha(grid.color, grid.alpha) : null;
  }
}
