// Geometry of the boss's plate (pure): the phrase wrapped in balanced lines, where each word
// goes and where the plate is for a given descent. All in CSS pixels.
import { lerp } from '../../utils/math.ts';
import type { Layout } from './layout.ts';

export const BOSS_LAYOUT = {
  /** Text size relative to the falling words (the same as them on narrow fields: phones). */
  fontScale: 1.25,
  narrowField: 520,
  /** Widest line of text. */
  maxTextWidth: 640,
  /** Space between words, in characters. */
  wordGap: 1.5,
  /** Line height, in font sizes. */
  lineHeight: 1.95,
  padX: 24,
  padY: 20,
  /** Room kept for the plate's borders on each side of the play field. */
  sideGap: 14,
  /** Below the top of the field once it arrived (its crown sticks out above the plate). */
  topGap: 34,
  /** How far above the screen it starts. */
  hidden: 40,
} as const;

/** Phones: a tighter plate, so the boss still has a descent to make on a short field. */
export const BOSS_COMPACT = {
  fontScale: 1,
  lineHeight: 1.75,
  padX: 14,
  padY: 12,
  sideGap: 6,
  topGap: 26,
} as const;

export interface BossWordBox {
  readonly text: string;
  readonly line: number;
  /** Left edge of the text, from the plate's center. */
  readonly x: number;
  readonly width: number;
}

export interface BossPlate {
  readonly fontSize: number;
  readonly charWidth: number;
  readonly lineHeight: number;
  readonly width: number;
  readonly height: number;
  readonly lines: number;
  /** Above the first line. */
  readonly padY: number;
  readonly words: readonly BossWordBox[];
}

/** Line of each word (by length, in characters), filling lines up to `maxChars`. */
export function wrapWords(lengths: readonly number[], gap: number, maxChars: number): number[] {
  let line = 0;
  let used = 0;
  return lengths.map((length) => {
    if (used > 0 && used + gap + length > maxChars) {
      line++;
      used = 0;
    }
    used += (used > 0 ? gap : 0) + length;
    return line;
  });
}

/** Same number of lines as `wrapWords`, as even as possible (no short last line). */
export function wrapBalanced(lengths: readonly number[], gap: number, maxChars: number): number[] {
  let best = wrapWords(lengths, gap, maxChars);
  const lines = best.at(-1);
  for (let width = maxChars - 1; width >= Math.max(...lengths); width--) {
    const next = wrapWords(lengths, gap, width);
    if (next.at(-1) !== lines) break;
    best = next;
  }
  return best;
}

/** `charWidth` = one character of the falling words' font. */
export function computeBossPlate(layout: Layout, charWidth: number, texts: readonly string[]): BossPlate {
  const { wordGap, maxTextWidth, narrowField } = BOSS_LAYOUT;
  const sizes = layout.compact ? BOSS_COMPACT : BOSS_LAYOUT;
  const { padX, padY, sideGap } = sizes;
  const fontScale = layout.fieldWidth < narrowField ? 1 : sizes.fontScale;
  const fontSize = layout.fontSize * fontScale;
  const bossChar = charWidth * fontScale;
  const lineHeight = fontSize * sizes.lineHeight;
  const available = Math.min(maxTextWidth, layout.fieldWidth - 2 * (padX + sideGap));
  const maxChars = Math.max(1, Math.floor(available / bossChar));

  const lengths = texts.map((text) => text.length);
  const lineOf = wrapBalanced(lengths, wordGap, maxChars);
  const lines = (lineOf.at(-1) ?? 0) + 1;

  // Width of each line in characters, then each word from the left of its centered line.
  const lineChars = new Array<number>(lines).fill(0);
  const offsets = lengths.map((length, i) => {
    const line = lineOf[i] ?? 0;
    const used = lineChars[line] ?? 0;
    const start = used > 0 ? used + wordGap : 0;
    lineChars[line] = start + length;
    return start;
  });
  const words = texts.map((text, i): BossWordBox => {
    const line = lineOf[i] ?? 0;
    const start = (offsets[i] ?? 0) - (lineChars[line] ?? 0) / 2;
    return { text, line, x: start * bossChar, width: text.length * bossChar };
  });

  return {
    fontSize,
    charWidth: bossChar,
    lineHeight,
    width: Math.max(...lineChars) * bossChar + padX * 2,
    height: lines * lineHeight + padY * 2,
    lines,
    padY,
    words,
  };
}

/** Center of the play field: the boss comes straight down. */
export function bossCenterX(layout: Layout): number {
  return layout.fieldLeft + layout.fieldWidth / 2;
}

/**
 * Top edge of the plate. `entrance` 0..1 slides it in from above the screen; then `y` 0..1
 * takes its LOWER edge down to the perimeter.
 */
export function bossTop(layout: Layout, plate: BossPlate, y: number, entrance: number): number {
  const { topGap } = layout.compact ? BOSS_COMPACT : BOSS_LAYOUT;
  const restBottom = Math.min(layout.fieldTop + topGap + plate.height, layout.perimeterY);
  const restTop = restBottom - plate.height;
  if (entrance < 1) {
    const eased = 1 - (1 - Math.max(0, entrance)) ** 3;
    return lerp(-plate.height - BOSS_LAYOUT.hidden, restTop, eased);
  }
  return lerp(restBottom, layout.perimeterY, y) - plate.height;
}

/** Vertical center of a word's line. */
export function bossWordY(plate: BossPlate, top: number, word: number): number {
  const line = plate.words[word]?.line ?? 0;
  return top + plate.padY + (line + 0.5) * plate.lineHeight;
}

/** Left edge of a word's text. */
export function bossWordX(layout: Layout, plate: BossPlate, word: number): number {
  return bossCenterX(layout) + (plate.words[word]?.x ?? 0);
}

/** Center x of letter `index` of a word. */
export function bossLetterX(layout: Layout, plate: BossPlate, word: number, index: number): number {
  return bossWordX(layout, plate, word) + (index + 0.5) * plate.charWidth;
}
