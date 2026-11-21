// Minimal Phase 1 HUD: shield pips and destroyed-word count. The full HUD is Phase 4.
import { el } from './dom.ts';
import type { Translate } from './i18n.ts';

export class Hud {
  readonly root: HTMLElement;
  private readonly pipsWrap: HTMLElement;
  private readonly destroyedValue: HTMLElement;
  private readonly shieldGroup: HTMLElement;
  private pips: HTMLElement[] = [];
  private readonly t: Translate;

  constructor(t: Translate) {
    this.t = t;
    this.root = el('div', 'hud');

    const top = el('div', 'hud__top');

    this.shieldGroup = el('div', 'hud__group');
    this.shieldGroup.setAttribute('role', 'status');
    this.pipsWrap = el('span', 'hud__pips');
    this.shieldGroup.append(el('span', 'hud__label', t('shield')), this.pipsWrap);

    const destroyedGroup = el('div', 'hud__group');
    this.destroyedValue = el('span', 'hud__value', '0');
    destroyedGroup.append(el('span', 'hud__label', t('destroyed')), this.destroyedValue);

    top.append(this.shieldGroup, destroyedGroup);
    this.root.append(top, el('div', 'hud__hint', t('controlsHint')));
  }

  update(shield: number, maxShield: number, destroyed: number): void {
    if (this.pips.length !== maxShield) {
      this.pips = Array.from({ length: maxShield }, () => el('span', 'hud__pip'));
      this.pipsWrap.replaceChildren(...this.pips);
    }
    this.pips.forEach((pip, i) => pip.classList.toggle('hud__pip--empty', i >= shield));
    this.shieldGroup.classList.toggle('hud__group--danger', shield <= 1);
    this.shieldGroup.setAttribute('aria-label', `${this.t('shield')}: ${shield}/${maxShield}`);
    this.destroyedValue.textContent = String(destroyed);
  }
}
