// Nickname dialog: asked on the first Google link (prefilled "Piloto" + 4 uid characters)
// and editable later. Keys typed here never reach the menu or the game (they stop at the
// dialog), so Enter/Esc/Tab only act on the dialog.
import { isValidNickname, normalizeNickname } from '../profile/nickname.ts';
import { button, el } from './dom.ts';
import type { Translate } from './i18n.ts';

export interface NicknameRequest {
  readonly initial: string;
  /** First link: the hint explains why we ask; cancelling keeps the suggestion. */
  readonly first: boolean;
  onSave(name: string): void;
  onCancel(): void;
}

export class NicknameDialog {
  readonly root: HTMLElement;
  private readonly t: Translate;
  private readonly title: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly error: HTMLElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly cancelButton: HTMLButtonElement;
  private request: NicknameRequest | null = null;
  private returnFocus: HTMLElement | null = null;

  constructor(t: Translate) {
    this.t = t;
    this.root = el('div', 'overlay overlay--dialog');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'nickname-title');

    const panel = el('form', 'panel panel--narrow nickname');
    this.title = el('h1', 'panel__title');
    this.title.id = 'nickname-title';
    this.hint = el('p', 'nickname__hint');
    this.hint.id = 'nickname-hint';

    const label = el('label', 'nickname__field');
    label.append(el('span', 'nickname__label', t('nicknameLabel')));
    this.input = el('input', 'nickname__input');
    this.input.type = 'text';
    this.input.maxLength = 24;
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.setAttribute('aria-describedby', 'nickname-hint nickname-error');
    this.input.addEventListener('input', () => this.validate());
    label.append(this.input);

    this.error = el('p', 'nickname__error');
    this.error.id = 'nickname-error';
    this.error.setAttribute('aria-live', 'polite');

    this.saveButton = button('btn btn--primary', t('nicknameSave'), () => undefined, 'Enter');
    this.saveButton.type = 'submit';
    this.cancelButton = button('btn', t('nicknameCancel'), () => this.cancel(), 'Esc');
    const actions = el('div', 'panel__actions panel__actions--row');
    actions.append(this.saveButton, this.cancelButton);

    panel.append(this.title, this.hint, label, this.error, actions);
    panel.addEventListener('submit', (event) => {
      event.preventDefault();
      this.save();
    });
    this.root.append(panel);
    this.root.addEventListener('keydown', this.onKeyDown);
  }

  get isOpen(): boolean {
    return this.request !== null;
  }

  open(request: NicknameRequest): void {
    this.request = request;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const t = this.t;
    this.title.textContent = t(request.first ? 'nicknameTitleFirst' : 'nicknameTitle');
    this.hint.textContent = t(request.first ? 'nicknameHintFirst' : 'nicknameHint');
    this.cancelButton.querySelector('span')?.replaceChildren(t(request.first ? 'nicknameKeep' : 'nicknameCancel'));
    this.input.value = request.initial;
    this.validate();
    this.root.hidden = false;
    this.input.focus({ preventScroll: true });
    this.input.select();
  }

  private validate(): string | null {
    const name = normalizeNickname(this.input.value);
    const valid = isValidNickname(name);
    this.saveButton.disabled = !valid;
    this.error.textContent = valid || this.input.value === '' ? '' : this.t('nicknameInvalid');
    return valid ? name : null;
  }

  private save(): void {
    const name = this.validate();
    const request = this.request;
    if (!name || !request) return;
    this.close();
    request.onSave(name);
  }

  private cancel(): void {
    const request = this.request;
    if (!request) return;
    this.close();
    request.onCancel();
  }

  private close(): void {
    this.request = null;
    this.root.hidden = true;
    this.returnFocus?.focus({ preventScroll: true });
    this.returnFocus = null;
  }

  /** Keys stay inside the dialog: Esc cancels, Tab cycles through its controls. */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [this.input, this.saveButton, this.cancelButton].filter((node) => !node.disabled);
    const index = focusable.indexOf(document.activeElement as HTMLInputElement & HTMLButtonElement);
    const next = focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length];
    event.preventDefault();
    next?.focus();
  };
}
