// Pause overlay. Keyboard: Esc resumes, Tab restarts, Enter ends the mission
// (handled by the game input); the buttons do the same with the mouse.
import { button, el } from './dom.ts';
import type { Translate } from './i18n.ts';

export interface PauseCallbacks {
  onResume(): void;
  onRestart(): void;
  onQuit(): void;
}

export class PauseScreen {
  readonly root: HTMLElement;

  constructor(t: Translate, callbacks: PauseCallbacks) {
    this.root = el('div', 'overlay overlay--pause');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-labelledby', 'pause-title');

    const panel = el('div', 'panel panel--narrow');
    const title = el('h1', 'panel__title', t('pauseTitle'));
    title.id = 'pause-title';
    const actions = el('div', 'panel__actions');
    actions.append(
      button('btn btn--primary', t('resume'), () => callbacks.onResume(), 'Esc'),
      button('btn', t('restart'), () => callbacks.onRestart(), 'Tab'),
      button('btn btn--danger', t('quit'), () => callbacks.onQuit(), 'Enter'),
    );
    panel.append(title, actions);
    this.root.append(panel);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }
}
