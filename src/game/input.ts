// Keyboard capture and accent normalization.
import type { TypingOptions } from './types.ts';

const COMBINING_MARKS = /\p{M}/gu;
const SINGLE_LETTER = /^\p{L}$/u;

/** Removes diacritics: `ação` → `acao`, `maçã` → `maca`. */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').normalize('NFC');
}

/** Lowercases (and strips accents unless they are required) for comparison. */
export function normalizeText(text: string, options: TypingOptions): string {
  const lower = text.normalize('NFC').toLowerCase();
  return options.requireAccents ? lower : stripAccents(lower);
}

/** True when the typed character counts as the expected letter. */
export function charsMatch(expected: string, typed: string, options: TypingOptions): boolean {
  return normalizeText(expected, options) === normalizeText(typed, options);
}

export type InputAction =
  | { readonly type: 'char'; readonly char: string }
  | { readonly type: 'unlock' }
  | { readonly type: 'restart' }
  | { readonly type: 'confirm' }
  | { readonly type: 'pause' }
  | { readonly type: 'emp' };

/** The subset of KeyboardEvent the mapping needs (keeps it testable without a DOM). */
export interface KeyLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly isComposing: boolean;
}

const UNLOCK: InputAction = { type: 'unlock' };
const RESTART: InputAction = { type: 'restart' };
const CONFIRM: InputAction = { type: 'confirm' };
const PAUSE: InputAction = { type: 'pause' };
const EMP: InputAction = { type: 'emp' };

/** Maps a key press to a game action, or null when the game should ignore it. */
export function keyToAction(event: KeyLike): InputAction | null {
  if (event.isComposing) return null;
  // Leave browser/OS shortcuts alone. Ctrl+Alt is AltGr on Windows layouts, so it still types.
  if (event.metaKey || (event.ctrlKey && !event.altKey)) return null;

  switch (event.key) {
    case 'Backspace':
      return UNLOCK;
    case 'Tab':
      return RESTART;
    case 'Enter':
      return CONFIRM;
    case 'Escape':
      return PAUSE;
    case ' ':
      return EMP;
  }

  const key = event.key.normalize('NFC');
  if (!SINGLE_LETTER.test(key)) return null;
  return { type: 'char', char: key.toLowerCase() };
}

/** Collects key presses as actions; the game drains them once per fixed update. */
export class KeyboardInput {
  private readonly queue: InputAction[] = [];
  private target: Window | null = null;

  attach(target: Window): void {
    this.detach();
    this.target = target;
    target.addEventListener('keydown', this.onKeyDown);
  }

  detach(): void {
    this.target?.removeEventListener('keydown', this.onKeyDown);
    this.target = null;
    this.queue.length = 0;
  }

  drain(handler: (action: InputAction) => void): void {
    for (const action of this.queue) handler(action);
    this.queue.length = 0;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const action = keyToAction(event);
    if (!action) return;
    // Stop Tab from moving focus and Backspace from navigating, even on auto-repeat.
    event.preventDefault();
    // Holding a key must not fire repeatedly.
    if (event.repeat) return;
    this.queue.push(action);
  };
}
