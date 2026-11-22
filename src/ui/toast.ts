// Short notices over every screen (account linked, popup blocked…), read by screen readers.
import { el } from './dom.ts';

const SHOW_MS = 7000;

export type ToastTone = 'info' | 'warn';

export class Toasts {
  readonly root: HTMLElement;

  constructor() {
    this.root = el('div', 'toasts');
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
  }

  show(message: string, tone: ToastTone = 'info'): void {
    const toast = el('div', `toast toast--${tone}`, message);
    this.root.append(toast);
    window.setTimeout(() => toast.remove(), SHOW_MS);
  }
}
