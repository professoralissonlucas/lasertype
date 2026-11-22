// Cosmetic items: pure data read by the parametrized renderers (game/render/).
// Rule of gold: cosmetics never change gameplay — only how things look.
import type { Language } from '../words/types.ts';

/** Categories implemented so far (CLAUDE.md §8 lists the ones still to come). */
export const COSMETIC_TYPES = ['cannon', 'theme', 'laserColor', 'explosion', 'wordBorder'] as const;
export type CosmeticType = (typeof COSMETIC_TYPES)[number];

export const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

/** Item names are part of the data (adding an item never touches ui/i18n.ts). */
export type LocalizedText = Readonly<Record<Language, string>>;

/** Colors are `#RRGGBB`. */
export type Hex = string;

// ---------- Parameters per category ----------

/** The size of the cannon never changes (the muzzle stays where the gameplay expects it). */
/**
 * The cannon is drawn in layers (render/drawCannon.ts): platform, energy ring, barrel,
 * turret head, energy core. The energy ring and core always take the laser color.
 */
export interface CannonParams {
  /**
   * Platform + turret head. armored = steel bunker with a ball turret · heavy = wide mount
   * with power cells and a boxy head · crystal = translucent faceted prism and gem head ·
   * orbital = sleek hover plinth with an orbital ring of nodes around the turret.
   */
  readonly body: 'armored' | 'heavy' | 'crystal' | 'orbital';
  /**
   * single = tube with cooling fins, band and muzzle tip · twin = two tubes firing in turns ·
   * prism = faceted tapering crystal · rail = two rails with coils around an energy line.
   */
  readonly barrel: 'single' | 'twin' | 'prism' | 'rail';
  /** Hull shades, dark → mid → light (plates, head and barrel gradients). */
  readonly hull: readonly [Hex, Hex, Hex];
  /** Thin outline. */
  readonly edge: Hex;
  /** Lit edges, rivets and reflections. */
  readonly highlight: Hex;
  /** Trim: barrel bands, coils, power cells, visor. */
  readonly trim: Hex;
  /** Body opacity: 1 = solid metal; below 1 the core shows through (crystal). */
  readonly opacity: number;
}

export interface GridParams {
  readonly color: Hex;
  readonly alpha: number;
  /** Cell size in CSS pixels. */
  readonly spacing: number;
}

/** The theme only changes the canvas background (the HUD keeps the UI palette). */
export interface ThemeParams {
  readonly background: Hex;
  /** The two nebula cloud colors. */
  readonly nebula: readonly [Hex, Hex];
  readonly nebulaAlpha: number;
  /** Seed of the procedural nebula (another seed = other cloud shapes). */
  readonly nebulaSeed: string;
  readonly starColor: Hex;
  /** Optional sci-fi grid drifting with the nearest star layer. */
  readonly grid: GridParams | null;
}

export interface LaserParams {
  /** Bright inner line. */
  readonly core: Hex;
  /** Halo, muzzle flash and impact sparks. */
  readonly glow: Hex;
  /** Beam thickness multiplier. */
  readonly width: number;
}

export interface ExplosionParams {
  /** Sparks and shockwaves. */
  readonly main: Hex;
  /** Embers. */
  readonly accent: Hex;
  /** scatter = letters fly apart · dissolve = letters crumble into pixels · collapse = letters are sucked in */
  readonly letters: 'scatter' | 'dissolve' | 'collapse';
  /** Debris drawn as streaks or as square pixels. */
  readonly debris: 'spark' | 'square';
  /** Multipliers of the base debris count and speed. */
  readonly debrisCount: number;
  readonly debrisSpeed: number;
  /** Gravity multiplier (negative = debris floats up). */
  readonly gravity: number;
  /** Debris converges on the word instead of bursting out. */
  readonly inward: boolean;
  /** Embers count multiplier. */
  readonly embers: number;
  /** Shockwave rings (0–2) and their size multiplier. */
  readonly rings: number;
  readonly ringScale: number;
}

/**
 * Shape and color of normal word plates. Locked and special words keep their gameplay
 * colors (primary glow, bomb amber, ice cyan…); only the shape follows the cosmetic.
 */
export interface WordBorderParams {
  /** rounded · chamfer = cut corners · brackets = corner brackets only · circuit = double line with pins */
  readonly shape: 'rounded' | 'chamfer' | 'brackets' | 'circuit';
  readonly color: Hex;
  readonly alpha: number;
  readonly width: number;
}

export interface CosmeticParams {
  readonly cannon: CannonParams;
  readonly theme: ThemeParams;
  readonly laserColor: LaserParams;
  readonly explosion: ExplosionParams;
  readonly wordBorder: WordBorderParams;
}

// ---------- Items ----------

interface CatalogEntry<T extends CosmeticType> {
  /** Stable id, e.g. "cannon_crystal" (stored in inventories and Firestore). */
  readonly id: string;
  readonly type: T;
  readonly name: LocalizedText;
  readonly rarity: Rarity;
  /** 0 = default item, owned by everyone · null = only through an achievement. */
  readonly price: number | null;
  /** Achievement id, when applicable. */
  readonly unlock?: string;
  /** Collection. */
  readonly set?: string;
  readonly params: CosmeticParams[T];
}

export type CosmeticItem = { [T in CosmeticType]: CatalogEntry<T> }[CosmeticType];

/** What the renderers draw with: one parameter set per category. */
export type ResolvedCosmetics = CosmeticParams;
