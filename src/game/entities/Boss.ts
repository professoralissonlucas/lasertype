/**
 * The boss: a big phrase that comes down slowly and is typed word by word, in order and
 * without spaces (Space is the EMP). Each word is one segment of its health. Positions are
 * normalized like the words': y = 0 fully on screen under the top, y = 1 = its lower edge
 * reaches the perimeter. How big it looks is the renderer's business (render/bossLayout.ts).
 */
export interface Boss {
  /** 1 for the first boss of the match. */
  readonly number: number;
  readonly words: readonly string[];
  /** Descent in field heights per second (before slow effects). */
  readonly speed: number;
  y: number;
  /** y at the start of the current update, for render interpolation. */
  prevY: number;
  /** Seconds of entrance alert left: until then it neither descends nor can be typed. */
  alert: number;
  /** Words destroyed so far (the current one is `words[index]`). */
  index: number;
  /** Letters typed in the current word. */
  typed: number;
  /** A wrong key was pressed during the current word: no combo for it. */
  flawed: boolean;
}

/** Health left, in words. */
export function bossHealth(boss: Pick<Boss, 'words' | 'index'>): number {
  return Math.max(0, boss.words.length - boss.index);
}
