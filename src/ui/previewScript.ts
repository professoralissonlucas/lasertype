// The looping script of the shop preview (pure): a word appears, its letters are shot
// one by one, it explodes, a short rest, the next word. The preview turns cues into
// lasers and particles.

export interface PreviewTiming {
  /** Seconds from the word appearing to the first shot. */
  readonly lead: number;
  /** Seconds between shots. */
  readonly letter: number;
  /** Seconds after the explosion before the next word. */
  readonly rest: number;
}

export const PREVIEW_TIMING: PreviewTiming = { lead: 0.45, letter: 0.11, rest: 0.9 };

/** Words that read the same in Portuguese and English. */
export const PREVIEW_WORDS: readonly string[] = ['laser', 'plasma', 'orbital', 'nova', 'radar', 'cosmos'];

export type PreviewCue =
  | { readonly type: 'spawn'; readonly word: string }
  | { readonly type: 'hit'; readonly index: number }
  | { readonly type: 'destroy'; readonly word: string };

export class PreviewScript {
  private readonly words: readonly string[];
  private readonly timing: PreviewTiming;
  private index = -1;
  private phase: 'rest' | 'typing' = 'rest';
  /** Seconds since the current phase started. */
  private t: number;
  /** Letters shot in the current word. */
  typed = 0;

  constructor(words: readonly string[] = PREVIEW_WORDS, timing: PreviewTiming = PREVIEW_TIMING) {
    if (words.length === 0) throw new Error('PreviewScript: no words');
    this.words = words;
    this.timing = timing;
    // The first word appears right away.
    this.t = timing.rest;
  }

  /** The word on screen ('' while resting). */
  get word(): string {
    return this.phase === 'typing' ? (this.words[this.index] ?? '') : '';
  }

  /** Seconds since the current word appeared (0 while resting). */
  get age(): number {
    return this.phase === 'typing' ? this.t : 0;
  }

  /** Advances by `dt` seconds and appends what happened, in order. */
  step(dt: number, cues: PreviewCue[]): void {
    this.t += dt;
    for (;;) {
      if (this.phase === 'rest') {
        if (this.t < this.timing.rest) return;
        this.t -= this.timing.rest;
        this.index = (this.index + 1) % this.words.length;
        this.typed = 0;
        this.phase = 'typing';
        cues.push({ type: 'spawn', word: this.word });
        continue;
      }
      const word = this.word;
      const at = this.timing.lead + this.typed * this.timing.letter;
      if (this.t < at) return;
      this.typed++;
      cues.push({ type: 'hit', index: this.typed - 1 });
      if (this.typed >= word.length) {
        cues.push({ type: 'destroy', word });
        this.t -= at;
        this.phase = 'rest';
      }
    }
  }
}
