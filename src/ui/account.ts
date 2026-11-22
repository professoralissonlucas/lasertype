// Account badge (menu and ranking): guest → "Entrar com Google"; linked → nickname + edit.
// The sign-in button calls `onSignIn` straight from the click (the popup must open there).
import type { AccountState } from '../firebase/types.ts';
import { el } from './dom.ts';
import type { Translate } from './i18n.ts';

export interface AccountCallbacks {
  /** Must call AuthService.linkGoogle() synchronously. */
  onSignIn(): void;
  onEditNickname(): void;
  onRetry(): void;
}

export class AccountBadge {
  readonly root: HTMLElement;
  private readonly t: Translate;
  private readonly label: HTMLElement;
  private readonly action: HTMLButtonElement;
  private onAction: () => void = () => undefined;
  private readonly callbacks: AccountCallbacks;

  constructor(t: Translate, callbacks: AccountCallbacks, className = '') {
    this.t = t;
    this.callbacks = callbacks;
    this.root = el('div', `account ${className}`.trim());
    this.label = el('span', 'account__label');
    this.action = el('button', 'btn btn--small account__action');
    this.action.type = 'button';
    this.action.addEventListener('click', () => this.onAction());
    this.root.append(this.label, this.action);
    this.root.hidden = true;
  }

  update(state: AccountState, nickname: string | null): void {
    const t = this.t;
    this.root.hidden = state.status === 'unavailable';
    this.root.dataset.status = state.status;
    this.action.hidden = state.status === 'connecting';
    this.label.title = '';
    switch (state.status) {
      case 'unavailable':
        return;
      case 'connecting':
        this.label.textContent = t('accountConnecting');
        return;
      case 'error':
        this.label.textContent = t('accountOffline');
        this.setAction(t('accountRetry'), () => this.callbacks.onRetry());
        return;
      case 'anonymous':
        this.label.textContent = t('accountGuest');
        this.setAction(t('accountSignIn'), () => this.callbacks.onSignIn());
        return;
      case 'google':
        this.label.textContent = nickname ?? '';
        this.label.title = t('accountLinked');
        this.setAction(t('accountEditNickname'), () => this.callbacks.onEditNickname());
        return;
    }
  }

  private setAction(text: string, handler: () => void): void {
    this.action.textContent = text;
    this.onAction = handler;
  }
}
