// Maps normalized field coordinates to screen (CSS pixel) coordinates. Pure.
// Words fall in field heights per second, so whatever the screen does here (phone, keyboard
// up) they take the same time to reach the perimeter: only their speed in pixels changes.
import { clamp } from '../../utils/math.ts';

export const LAYOUT = {
  sidePadding: 16,
  /** On very wide screens the play field stays centered at this width. */
  maxFieldWidth: 1100,
  /** From this width on, the HUD side panels get their own columns outside the field. */
  sideReserveMinWidth: 1000,
  /** Width kept free on each side for the HUD panels (panel 230 px + margins). */
  sideReserve: 262,
  /** Screen y of normalized y = 0 (leaves room for the score at the top). */
  fieldTop: 96,
  /** Perimeter distance from the bottom edge. */
  perimeterOffset: 104,
  /** Cannon pivot distance from the bottom edge. */
  cannonOffset: 30,
  /** Word font size as a fraction of the viewport height, clamped. */
  fontScale: 0.03,
  fontMin: 16,
  fontMax: 26,
  /** Horizontal padding inside a word plate. */
  wordPadX: 8,
  barrelLength: 52,
  barrelWidth: 8,
  /** How far the barrel slides back when firing. */
  recoilDistance: 7,
  baseRadius: 30,
} as const;

/**
 * Phones: a narrow screen, or a short one (the height left by the on-screen keyboard counts).
 * Everything around the field shrinks, so a 440 px tall area still has a 318 px field.
 */
export const COMPACT = {
  maxWidth: 720,
  maxHeight: 480,
  sidePadding: 8,
  fieldTop: 60,
  perimeterOffset: 62,
  cannonOffset: 15,
  /** The whole cannon, the same for every model. */
  cannonScale: 0.72,
  /** Word font size: the smaller of these fractions of the width and height, clamped. */
  fontWidthScale: 0.044,
  fontHeightScale: 0.036,
  fontMin: 14,
  fontMax: 22,
} as const;

export interface Layout {
  readonly width: number;
  readonly height: number;
  readonly compact: boolean;
  readonly fieldLeft: number;
  readonly fieldWidth: number;
  readonly fieldTop: number;
  readonly perimeterY: number;
  readonly cannonX: number;
  readonly cannonY: number;
  /** Size of the cannon (1 = LAYOUT's barrel and base). */
  readonly cannonScale: number;
  readonly fontSize: number;
}

export function isCompact(width: number, height: number): boolean {
  return width <= COMPACT.maxWidth || height <= COMPACT.maxHeight;
}

export function computeLayout(width: number, height: number): Layout {
  const compact = isCompact(width, height);
  const sizes = compact ? COMPACT : LAYOUT;
  const { fieldTop } = sizes;
  const side = !compact && width >= LAYOUT.sideReserveMinWidth ? LAYOUT.sideReserve : sizes.sidePadding;
  const fieldWidth = Math.max(1, Math.min(width - side * 2, LAYOUT.maxFieldWidth));
  const font = compact
    ? Math.min(width * COMPACT.fontWidthScale, height * COMPACT.fontHeightScale)
    : height * LAYOUT.fontScale;
  return {
    width,
    height,
    compact,
    fieldLeft: (width - fieldWidth) / 2,
    fieldWidth,
    fieldTop,
    perimeterY: Math.max(height - sizes.perimeterOffset, fieldTop + 1),
    cannonX: width / 2,
    cannonY: height - sizes.cannonOffset,
    cannonScale: compact ? COMPACT.cannonScale : 1,
    fontSize: Math.round(clamp(font, sizes.fontMin, sizes.fontMax)),
  };
}

export function toScreenX(layout: Layout, x: number): number {
  return layout.fieldLeft + x * layout.fieldWidth;
}

export function toScreenY(layout: Layout, y: number): number {
  return layout.fieldTop + y * (layout.perimeterY - layout.fieldTop);
}

/** Left edge of a word's text, centered on x and kept fully inside the play field. */
export function wordStartX(layout: Layout, x: number, length: number, charWidth: number): number {
  const width = length * charWidth;
  const min = layout.fieldLeft + LAYOUT.wordPadX;
  const max = layout.fieldLeft + layout.fieldWidth - LAYOUT.wordPadX - width;
  const centered = toScreenX(layout, x) - width / 2;
  return Math.max(min, Math.min(centered, max));
}

/** Screen x of the center of letter `index` (monospace font). */
export function letterCenterX(
  layout: Layout,
  x: number,
  length: number,
  index: number,
  charWidth: number,
): number {
  return wordStartX(layout, x, length, charWidth) + (index + 0.5) * charWidth;
}

/** Tip of the barrel for a given angle. */
export function muzzlePosition(layout: Layout, angle: number): { x: number; y: number } {
  const length = LAYOUT.barrelLength * layout.cannonScale;
  return {
    x: layout.cannonX + Math.sin(angle) * length,
    y: layout.cannonY - Math.cos(angle) * length,
  };
}
