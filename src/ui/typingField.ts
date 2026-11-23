// The invisible text field that brings up the on-screen keyboard and receives what is typed on
// it (the letters come from how its text changed: game/touchInput.ts). Keys of a physical
// keyboard never get here: the game's keydown handler takes them and cancels their edit.
import type { InputAction } from '../game/input.ts';
import { editAction, IDLE_TEXT } from '../game/touchInput.ts';
import { el } from './dom.ts';

export class TypingField {
  readonly root: HTMLInputElement;
  private readonly onAction: (action: InputAction) => void;
  private text = IDLE_TEXT;

  constructor(onAction: (action: InputAction) => void) {
    this.onAction = onAction;
    const field = el('input', 'typing-field');
    field.type = 'text';
    field.tabIndex = -1;
    field.spellcheck = false;
    // No suggestions, corrections or capitals: each key press should be one plain letter.
    field.autocomplete = 'off';
    field.setAttribute('autocorrect', 'off');
    field.setAttribute('autocapitalize', 'none');
    field.setAttribute('inputmode', 'text');
    field.setAttribute('enterkeyhint', 'enter');
    field.addEventListener('input', (event) => this.onInput(event instanceof InputEvent && event.isComposing));
    field.addEventListener('compositionend', () => this.reset());
    this.root = field;
    this.reset();
  }

  setLabel(text: string): void {
    this.root.setAttribute('aria-label', text);
  }

  get focused(): boolean {
    return document.activeElement === this.root;
  }

  /** Opens the keyboard. Call it straight from a tap: browsers refuse it anywhere else. */
  focus(): void {
    // Focused, but the player hid the keyboard: only a new focus brings it back.
    if (this.focused) this.root.blur();
    this.reset();
    this.root.focus({ preventScroll: true });
    this.toEnd();
  }

  /** Closes the keyboard. */
  blur(): void {
    if (this.focused) this.root.blur();
  }

  private onInput(composing: boolean): void {
    const next = this.root.value;
    const action = editAction(this.text, next);
    this.text = next;
    // A keyboard still composing owns the text: changing it would make it send the word again.
    if (!composing) this.reset();
    if (action) this.onAction(action);
  }

  private reset(): void {
    this.text = IDLE_TEXT;
    if (this.root.value !== IDLE_TEXT) this.root.value = IDLE_TEXT;
    if (this.focused) this.toEnd();
  }

  private toEnd(): void {
    this.root.setSelectionRange(IDLE_TEXT.length, IDLE_TEXT.length);
  }
}
