// Main menu: mode, difficulty and language, then Play. Enter anywhere in the form plays.
// Also shows the coin balance and leads to the shop and the settings.
import { GAME_DIFFICULTIES, type GameDifficulty } from '../game/types.ts';
import { MODE_IDS, type ModeId } from '../modes/types.ts';
import { LANGUAGES, type Language } from '../words/types.ts';
import { button, el, radioGroup } from './dom.ts';
import { DIFFICULTY_LABEL, LANGUAGE_NAME, MODE_DESCRIPTION, MODE_LABEL, type Translate } from './i18n.ts';

export interface MenuChoice {
  readonly mode: ModeId;
  readonly difficulty: GameDifficulty;
  readonly language: Language;
}

export interface MenuCallbacks {
  onPlay(choice: MenuChoice): void;
  onChange(choice: MenuChoice): void;
  onSettings(): void;
  onShop(): void;
}

export class MenuScreen {
  readonly root: HTMLElement;
  private choice: MenuChoice;
  private readonly form: HTMLFormElement;
  private readonly playButton: HTMLButtonElement;
  private readonly t: Translate;
  private readonly formatNumber: (value: number) => string;
  private readonly wallet: HTMLElement;
  private readonly walletValue: HTMLElement;

  constructor(
    t: Translate,
    formatNumber: (value: number) => string,
    initial: MenuChoice,
    coins: number,
    callbacks: MenuCallbacks,
  ) {
    this.t = t;
    this.formatNumber = formatNumber;
    this.choice = initial;
    this.root = el('section', 'screen menu');
    this.root.setAttribute('aria-labelledby', 'menu-title');

    this.wallet = el('div', 'wallet menu__wallet');
    this.wallet.setAttribute('role', 'status');
    this.walletValue = el('span', 'coins__value');
    const amount = el('span', 'coins');
    amount.append(el('span', 'coin'), this.walletValue);
    this.wallet.append(amount);
    this.setCoins(coins);

    const header = el('header', 'menu__header');
    const title = el('h1', 'menu__title', 'Laser Type');
    title.id = 'menu-title';
    header.append(title, el('p', 'menu__tagline', t('tagline')));

    const form = el('form', 'menu__form');
    this.form = form;
    const update = (patch: Partial<MenuChoice>): void => {
      this.choice = { ...this.choice, ...patch };
      callbacks.onChange(this.choice);
    };

    const modes = radioGroup(
      'choice--cards',
      t('menuMode'),
      'mode',
      MODE_IDS.map((id) => ({ value: id, label: t(MODE_LABEL[id]), description: t(MODE_DESCRIPTION[id]) })),
      initial.mode,
      (mode) => update({ mode }),
    );
    const difficulty = radioGroup(
      'choice--segmented',
      t('menuDifficulty'),
      'difficulty',
      GAME_DIFFICULTIES.map((id) => ({ value: id, label: t(DIFFICULTY_LABEL[id]) })),
      initial.difficulty,
      (value) => update({ difficulty: value }),
    );
    const language = radioGroup(
      'choice--segmented',
      t('menuLanguage'),
      'language',
      LANGUAGES.map((id) => ({ value: id, label: LANGUAGE_NAME[id] })),
      initial.language,
      (value) => update({ language: value }),
    );
    const row = el('div', 'menu__row');
    row.append(difficulty, language);

    this.playButton = el('button', 'btn btn--primary btn--large');
    this.playButton.type = 'submit';
    this.playButton.append(el('span', undefined, t('play')), el('kbd', undefined, 'Enter'));
    const actions = el('div', 'menu__actions');
    actions.append(
      this.playButton,
      button('btn', t('shop'), () => callbacks.onShop()),
      button('btn', t('settings'), () => callbacks.onSettings()),
    );

    form.append(modes, row, actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      callbacks.onPlay(this.choice);
    });

    this.root.append(this.wallet, header, form);
  }

  setCoins(coins: number): void {
    const text = this.formatNumber(coins);
    this.walletValue.textContent = text;
    this.wallet.setAttribute('aria-label', `${this.t('coins')}: ${text}`);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (visible) window.addEventListener('keydown', this.onKeyDown);
    else window.removeEventListener('keydown', this.onKeyDown);
  }

  /**
   * Enter plays from anywhere on the menu — even after a mouse click took focus off
   * the form. Buttons (Play, Settings) keep handling Enter themselves.
   */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' || event.repeat || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    this.form.requestSubmit();
  };

  /** Puts keyboard focus on Play (Enter starts right away). */
  focus(): void {
    this.playButton.focus({ preventScroll: true });
  }

  /** Focus a control by radio group name (keeps focus after a language rebuild). */
  focusGroup(name: 'mode' | 'difficulty' | 'language'): void {
    this.root.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.focus({ preventScroll: true });
  }
}
