// Simple game over overlay. The full Mission Report arrives in Phase 4.
import { matchAccuracy, type MatchState } from '../game/state.ts';
import { formatPercent, formatTime } from '../utils/format.ts';
import { el } from './dom.ts';
import type { Translate } from './i18n.ts';

export class GameOverScreen {
  readonly root: HTMLElement;
  private readonly wordsValue: HTMLElement;
  private readonly accuracyValue: HTMLElement;
  private readonly timeValue: HTMLElement;

  constructor(t: Translate) {
    this.root = el('div', 'overlay');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-labelledby', 'gameover-title');

    const panel = el('div', 'overlay__panel');
    const title = el('h1', 'overlay__title', t('gameOverTitle'));
    title.id = 'gameover-title';

    const stats = el('dl', 'overlay__stats');
    this.wordsValue = el('dd');
    this.accuracyValue = el('dd');
    this.timeValue = el('dd');
    stats.append(
      el('dt', undefined, t('statWords')),
      this.wordsValue,
      el('dt', undefined, t('statAccuracy')),
      this.accuracyValue,
      el('dt', undefined, t('statTime')),
      this.timeValue,
    );

    panel.append(title, stats, el('p', 'overlay__hint', t('restartHint')));
    this.root.append(panel);
  }

  show(state: Readonly<MatchState>): void {
    this.wordsValue.textContent = String(state.stats.destroyed);
    this.accuracyValue.textContent = formatPercent(matchAccuracy(state.stats));
    this.timeValue.textContent = formatTime(state.elapsed);
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
