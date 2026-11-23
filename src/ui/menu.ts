// Main menu: mode, difficulty and language, then Play. Enter anywhere in the form plays.
// The Daily Challenge card counts down to the next one and locks the difficulty (the player's
// own choice comes back with the other modes).
// Also shows the coin balance, the level, today's missions and the account, and leads to the
// shop, progress, ranking and settings.
import { GAME_DIFFICULTIES, type GameDifficulty } from '../game/types.ts';
import { MODES } from '../modes/index.ts';
import { MODE_IDS, type ModeId } from '../modes/types.ts';
import type { LevelProgress } from '../progression/xp.ts';
import { dayIndex, msUntilNextDay } from '../utils/day.ts';
import { formatCountdown } from '../utils/format.ts';
import { LANGUAGES, type Language } from '../words/types.ts';
import { button, el, externalLink, ProgressBar, radioGroup } from './dom.ts';
import { DIFFICULTY_LABEL, LANGUAGE_NAME, MODE_DESCRIPTION, MODE_LABEL, type Translate } from './i18n.ts';

export interface MenuChoice {
  readonly mode: ModeId;
  readonly difficulty: GameDifficulty;
  readonly language: Language;
}

/** The line under the title. */
export interface MenuProgress {
  readonly level: LevelProgress;
  /** Title being worn, null without one. */
  readonly title: string | null;
  readonly missionsDone: number;
  readonly missions: number;
}

export interface MenuCallbacks {
  onPlay(choice: MenuChoice): void;
  onChange(choice: MenuChoice): void;
  onSettings(): void;
  onShop(): void;
  onProgress(): void;
  onRanking(): void;
  /** The game day turned while the menu was open. */
  onDayChange(): void;
}

/** Countdown refresh. */
const TICK_MS = 1000;

const GOOGLE_PRIVACY = 'https://policies.google.com/privacy';
const GOOGLE_TERMS = 'https://policies.google.com/terms';

/**
 * App Check renders reCAPTCHA without its badge; Google then asks for this credit in the
 * page: "protected by reCAPTCHA" plus links to its Privacy Policy and Terms of Service.
 */
function recaptchaCredit(t: Translate): HTMLElement {
  const note = el('p', 'menu__legal', `${t('recaptchaCredit')} `);
  note.append(externalLink(GOOGLE_PRIVACY, t('recaptchaPrivacy')), ' · ', externalLink(GOOGLE_TERMS, t('recaptchaTerms')));
  return note;
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
  private readonly difficulty: HTMLFieldSetElement;
  private readonly countdown = el('span', 'choice__note');
  private readonly progress: () => MenuProgress;
  private readonly callbacks: MenuCallbacks;
  private readonly levelName = el('span', 'menu__level');
  private readonly titleBadge = el('span', 'title-badge');
  private readonly levelBar = new ProgressBar();
  private readonly missions = el('span', 'menu__missions');
  private day = dayIndex(Date.now());
  private tickTimer: number | null = null;

  constructor(
    t: Translate,
    formatNumber: (value: number) => string,
    initial: MenuChoice,
    coins: number,
    account: HTMLElement,
    recaptchaNotice: boolean,
    progress: () => MenuProgress,
    callbacks: MenuCallbacks,
  ) {
    this.t = t;
    this.formatNumber = formatNumber;
    this.choice = initial;
    this.progress = progress;
    this.callbacks = callbacks;
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
    const summary = el('div', 'menu__progress');
    summary.append(this.levelName, this.titleBadge, this.levelBar.root, this.missions);
    header.append(title, el('p', 'menu__tagline', t('tagline')), summary);
    this.refreshProgress();

    const form = el('form', 'menu__form');
    this.form = form;
    const update = (patch: Partial<MenuChoice>): void => {
      this.choice = { ...this.choice, ...patch };
      this.syncDifficulty();
      callbacks.onChange(this.choice);
    };

    const modes = radioGroup(
      'choice--cards',
      t('menuMode'),
      'mode',
      MODE_IDS.map((id) => ({
        value: id,
        label: t(MODE_LABEL[id]),
        description: t(MODE_DESCRIPTION[id]),
        ...(id === 'daily' && { note: this.countdown }),
      })),
      initial.mode,
      (mode) => update({ mode }),
    );
    this.difficulty = radioGroup(
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
    row.append(this.difficulty, language);
    this.syncDifficulty();

    this.playButton = el('button', 'btn btn--primary btn--large');
    this.playButton.type = 'submit';
    this.playButton.append(el('span', undefined, t('play')), el('kbd', undefined, 'Enter'));
    const actions = el('div', 'menu__actions');
    actions.append(
      this.playButton,
      button('btn', t('shop'), () => callbacks.onShop()),
      button('btn', t('progress'), () => callbacks.onProgress()),
      button('btn', t('ranking'), () => callbacks.onRanking()),
      button('btn', t('settings'), () => callbacks.onSettings()),
    );

    form.append(modes, row, actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      callbacks.onPlay(this.choice);
    });

    const top = el('div', 'menu__top');
    top.append(account, this.wallet);
    this.root.append(top, header, form);
    if (recaptchaNotice) this.root.append(recaptchaCredit(t));
  }

  setCoins(coins: number): void {
    const text = this.formatNumber(coins);
    this.walletValue.textContent = text;
    this.wallet.setAttribute('aria-label', `${this.t('coins')}: ${text}`);
  }

  refreshProgress(): void {
    const { level, title, missionsDone, missions } = this.progress();
    const xp = this.t('levelXp', { into: this.formatNumber(level.into), cost: this.formatNumber(level.cost) });
    this.levelName.textContent = this.t('level', { n: level.level });
    this.levelBar.set(level.into, level.cost, xp);
    this.titleBadge.hidden = title === null;
    this.titleBadge.textContent = title ?? '';
    this.missions.textContent = this.t('menuMissions', { n: missionsDone, max: missions });
    this.missions.classList.toggle('is-done', missionsDone === missions);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (this.tickTimer !== null) window.clearInterval(this.tickTimer);
    this.tickTimer = null;
    if (visible) {
      window.addEventListener('keydown', this.onKeyDown);
      this.tickTimer = window.setInterval(this.tick, TICK_MS);
      this.tick();
    } else {
      window.removeEventListener('keydown', this.onKeyDown);
    }
  }

  private readonly tick = (): void => {
    const day = dayIndex(Date.now());
    if (day !== this.day) {
      this.day = day;
      this.refreshProgress(); // new missions
      this.callbacks.onDayChange();
    }
    this.countdown.textContent = this.t('dailyNext', { time: formatCountdown(msUntilNextDay(Date.now())) });
  };

  /** Modes with a fixed difficulty show it, locked; `choice.difficulty` stays as the player left it. */
  private syncDifficulty(): void {
    const fixed = MODES[this.choice.mode].fixedDifficulty;
    const shown = fixed ?? this.choice.difficulty;
    this.difficulty.disabled = fixed !== null;
    for (const input of this.difficulty.querySelectorAll('input')) input.checked = input.value === shown;
    const legend = this.difficulty.querySelector('legend');
    if (legend) legend.textContent = this.t(fixed === null ? 'menuDifficulty' : 'menuDifficultyFixed');
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
