// Global ranking: tabs per mode, difficulty and language filters, top 50 with the player's
// own row highlighted (or shown below the table when outside the top). Esc returns.
// The "Diário" tab shows today's challenge only (no difficulty filter): countdown to the next
// one, the player's place and the coin bonus. It reloads by itself when the day turns.
// Boards come from a cache (firebase/leaderboard.ts): "Atualizar" reads the one shown again.
import { CONFIG } from '../config.ts';
import { dailyPrizes } from '../economy/dailyBonus.ts';
import { boardAt, type BoardView, type Leaderboard } from '../firebase/leaderboard.ts';
import { placesOf } from '../firebase/rankRows.ts';
import { RANKED_MODES, type AccountState, type Board, type RankedMode, type RankRow } from '../firebase/types.ts';
import { GAME_DIFFICULTIES, type GameDifficulty } from '../game/types.ts';
import { dayIndex, msUntilNextDay } from '../utils/day.ts';
import { formatCountdown, formatGameDay } from '../utils/format.ts';
import { LANGUAGES, type Language } from '../words/types.ts';
import type { AccountBadge } from './account.ts';
import { dailyPlaceText } from './dailyText.ts';
import { button, el, radioGroup } from './dom.ts';
import { DIFFICULTY_LABEL, LANGUAGE_NAME, MODE_LABEL, type Translate } from './i18n.ts';

/** What the player picked in the tabs and filters (the board also depends on the day). */
export interface RankingChoice {
  readonly mode: RankedMode;
  readonly diff: GameDifficulty;
  readonly lang: Language;
}

export interface RankingOptions {
  readonly t: Translate;
  /** Interface language (dates). */
  readonly language: Language;
  readonly formatNumber: (value: number) => string;
  readonly leaderboard: Leaderboard;
  readonly account: () => AccountState;
  readonly accountBadge: AccountBadge;
  /** Opened first (the menu's mode, difficulty and language). */
  readonly initial: RankingChoice;
  readonly onBack: () => void;
}

type View = 'loading' | 'rows' | 'empty' | 'error' | 'unavailable';

/** Countdowns (also notices when the day turns). */
const TICK_MS = 1000;

/** The signed-in player on the board shown. */
interface OwnPlace {
  readonly row: RankRow;
  readonly place: number;
}

export class RankingScreen {
  readonly root: HTMLElement;
  private readonly o: RankingOptions;
  private readonly tabs: Record<RankedMode, HTMLButtonElement>;
  private readonly difficulty: HTMLFieldSetElement;
  private readonly daily: HTMLElement;
  private readonly dailyTitle: HTMLElement;
  private readonly dailyCountdown: HTMLElement;
  private readonly dailyOwn: HTMLElement;
  private readonly dailyPrizes: HTMLElement;
  private readonly updateBar: HTMLElement;
  private readonly updateAge: HTMLElement;
  private readonly updateButton: HTMLButtonElement;
  private readonly table: HTMLTableElement;
  private readonly body: HTMLTableSectionElement;
  private readonly ownBody: HTMLTableSectionElement;
  private readonly status: HTMLElement;
  private readonly statusText: HTMLElement;
  private readonly retryButton: HTMLButtonElement;
  private choice: RankingChoice;
  /** Board on screen: today's one in the daily mode. */
  private board: Board;
  /** Player it is shown for (null = not in the ranking). */
  private uid: string | null = null;
  /** When the rows on screen were read (epoch ms); null = none on screen. */
  private shownAt: number | null = null;
  /** "Atualizar" is on its way, or the last one failed. */
  private updating = false;
  private updateFailed = false;
  private tickTimer: number | null = null;
  /** Ignores answers to requests that were superseded (fast tab flipping). */
  private request = 0;

  constructor(options: RankingOptions) {
    this.o = options;
    this.choice = options.initial;
    this.board = this.currentBoard();
    const { t } = options;
    this.root = el('section', 'screen ranking');
    this.root.setAttribute('aria-labelledby', 'ranking-title');
    this.root.hidden = true;

    const panel = el('div', 'panel ranking__panel');
    const header = el('header', 'ranking__header');
    const title = el('h1', 'panel__title', t('rankingTitle'));
    title.id = 'ranking-title';
    header.append(title, options.accountBadge.root);

    // Mode tabs.
    const tabList = el('div', 'tabs');
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-label', t('menuMode'));
    const tab = (mode: RankedMode): HTMLButtonElement => {
      const node = el('button', 'tabs__tab', t(MODE_LABEL[mode]));
      node.type = 'button';
      node.setAttribute('role', 'tab');
      node.setAttribute('aria-controls', 'ranking-table');
      node.addEventListener('click', () => this.setChoice({ mode }));
      return node;
    };
    this.tabs = { survival: tab('survival'), timeAttack: tab('timeAttack'), daily: tab('daily') };
    tabList.append(...RANKED_MODES.map((mode) => this.tabs[mode]));
    tabList.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const index = RANKED_MODES.indexOf(this.choice.mode);
      const step = event.key === 'ArrowRight' ? 1 : -1;
      const next = RANKED_MODES[(index + step + RANKED_MODES.length) % RANKED_MODES.length] ?? 'survival';
      this.setChoice({ mode: next });
      this.tabs[next].focus();
    });

    // Daily Challenge: countdown, the player's place and the coin bonus.
    this.daily = el('div', 'ranking__daily');
    const dailyHead = el('div', 'ranking__daily-head');
    this.dailyTitle = el('span', 'ranking__daily-title');
    this.dailyCountdown = el('span', 'ranking__daily-countdown');
    dailyHead.append(this.dailyTitle, this.dailyCountdown);
    this.dailyOwn = el('p', 'ranking__daily-own');
    this.dailyOwn.setAttribute('aria-live', 'polite');
    this.dailyPrizes = el('div', 'ranking__daily-prizes');
    this.daily.append(dailyHead, this.dailyOwn, this.dailyPrizes);

    // Filters.
    const filters = el('div', 'ranking__filters');
    this.difficulty = radioGroup(
      'choice--segmented',
      t('menuDifficulty'),
      'ranking-diff',
      GAME_DIFFICULTIES.map((id) => ({ value: id, label: t(DIFFICULTY_LABEL[id]) })),
      this.choice.diff,
      (diff) => this.setChoice({ diff }),
    );
    filters.append(
      this.difficulty,
      radioGroup(
        'choice--segmented',
        t('menuLanguage'),
        'ranking-lang',
        LANGUAGES.map((id) => ({ value: id, label: LANGUAGE_NAME[id] })),
        this.choice.lang,
        (lang) => this.setChoice({ lang }),
      ),
    );

    // How old the rows are, and "Atualizar".
    this.updateBar = el('div', 'ranking__update');
    this.updateAge = el('span', 'ranking__update-age');
    this.updateAge.setAttribute('aria-live', 'polite');
    this.updateButton = el('button', 'btn btn--small');
    this.updateButton.type = 'button';
    this.updateButton.addEventListener('click', () => {
      if (this.updateButton.getAttribute('aria-disabled') !== 'true') void this.refresh(true);
    });
    this.updateBar.append(this.updateAge, this.updateButton);

    // Table.
    this.table = el('table', 'ranking__table');
    this.table.id = 'ranking-table';
    const head = el('thead');
    const headRow = el('tr');
    const th = (text: string, className: string): HTMLTableCellElement => {
      const cell = el('th', className, text);
      cell.scope = 'col';
      return cell;
    };
    headRow.append(
      th('#', 'col-rank'),
      th(t('rankingColName'), 'col-name'),
      th(t('rankingColScore'), 'col-num'),
      th(t('rankingColWpm'), 'col-num'),
      th(t('rankingColAccuracy'), 'col-num col-acc'),
    );
    head.append(headRow);
    this.body = el('tbody');
    this.ownBody = el('tbody', 'ranking__own');
    this.table.append(head, this.body, this.ownBody);

    this.status = el('div', 'ranking__status');
    this.statusText = el('p', undefined);
    this.statusText.setAttribute('aria-live', 'polite');
    this.retryButton = button('btn btn--small', t('rankingRetry'), () => {
      this.retryButton.blur();
      void this.refresh();
    });
    this.status.append(this.statusText, this.retryButton);

    const footer = el('div', 'panel__footer');
    footer.append(el('p', 'panel__note', t('rankingHint')), button('btn', t('back'), () => options.onBack(), 'Esc'));

    panel.append(header, tabList, filters, this.daily, this.updateBar, this.table, this.status, footer);
    this.root.append(panel);
    this.syncChoice();
  }

  setVisible(visible: boolean): void {
    if (visible === !this.root.hidden) return;
    this.root.hidden = !visible;
    if (visible) {
      window.addEventListener('keydown', this.onKeyDown);
      this.tickTimer = window.setInterval(this.tick, TICK_MS);
      void this.refresh();
    } else {
      window.removeEventListener('keydown', this.onKeyDown);
      if (this.tickTimer !== null) window.clearInterval(this.tickTimer);
      this.tickTimer = null;
      this.request++;
    }
  }

  focus(): void {
    this.tabs[this.choice.mode].focus({ preventScroll: true });
  }

  /** Account linked or switched: re-highlight the player's row (or try again after an error). */
  onAccountChange(): void {
    if (this.root.hidden) return;
    if (this.playerUid() !== this.uid || this.root.dataset.view === 'error') void this.refresh();
  }

  /** A record was accepted while this screen was open: it is already in the cache. */
  onRecord(): void {
    if (!this.root.hidden) void this.refresh();
  }

  private setChoice(patch: Partial<RankingChoice>): void {
    this.choice = { ...this.choice, ...patch };
    this.syncChoice();
    void this.refresh();
  }

  /** The player, when they are in the ranking (Google accounts only). */
  private playerUid(): string | null {
    const { status, uid } = this.o.account();
    return status === 'google' ? uid : null;
  }

  private currentBoard(): Board {
    const { mode, diff, lang } = this.choice;
    return boardAt(mode, diff, lang, Date.now());
  }

  private syncChoice(): void {
    const { mode, lang } = this.choice;
    for (const id of RANKED_MODES) {
      const active = id === mode;
      this.tabs[id].setAttribute('aria-selected', String(active));
      this.tabs[id].tabIndex = active ? 0 : -1;
    }
    this.difficulty.hidden = mode === 'daily';
    this.daily.hidden = mode !== 'daily';
    this.dailyPrizes.hidden = !this.o.leaderboard.available; // no server, no bonus
    this.dailyPrizes.replaceChildren(...this.prizes(lang));
  }

  /** The bonus table or, on the boards without a bonus, which one pays it. */
  private prizes(lang: Language): HTMLElement[] {
    const { t, formatNumber } = this.o;
    const { lang: paid, minScore } = CONFIG.dailyBonus;
    if (lang !== paid) return [el('p', undefined, t('dailyPrizeLang', { lang: LANGUAGE_NAME[paid] }))];
    const list = el('ul', 'ranking__prizes');
    for (const { from, to, coins } of dailyPrizes()) {
      const item = el('li', undefined, from === to ? t('dailyPrizeRank', { n: from }) : t('dailyPrizeRange', { from, to }));
      item.append(' ', el('span', 'ranking__prize-coins', formatNumber(coins)));
      list.append(item);
    }
    return [el('p', undefined, t('dailyPrizes', { min: formatNumber(minScore) })), list];
  }

  private readonly tick = (): void => {
    this.syncUpdate();
    if (this.choice.mode !== 'daily') return;
    this.syncCountdown();
    // The day turned: today's challenge is another board now.
    if (this.board.day !== dayIndex(Date.now())) void this.refresh();
  };

  private syncCountdown(): void {
    this.dailyCountdown.textContent = this.o.t('dailyCountdown', { time: formatCountdown(msUntilNextDay(Date.now())) });
  }

  /** The player's place and bonus forecast (hidden when not on the board). */
  private syncOwn(own: OwnPlace | null): void {
    const { t, formatNumber } = this.o;
    this.dailyOwn.hidden = own === null;
    this.dailyOwn.textContent = own ? dailyPlaceText(t, formatNumber, own.place, own.row.score, this.board.lang) : '';
  }

  /** How old the rows are, and whether "Atualizar" can be used. Only writes what changed. */
  private syncUpdate(): void {
    this.updateBar.hidden = this.shownAt === null;
    if (this.shownAt === null) return;
    const { t, leaderboard } = this.o;
    const minutes = Math.floor((Date.now() - this.shownAt) / 60_000);
    const age = minutes < 1 ? t('rankingUpdatedNow') : t('rankingUpdatedAgo', { n: minutes });
    const wait = Math.ceil(leaderboard.refreshWait(this.board) / 1000);
    const label = wait > 0 ? t('rankingUpdateWait', { n: wait }) : t('rankingUpdate');
    const set = (node: HTMLElement, text: string): void => {
      if (node.textContent !== text) node.textContent = text;
    };
    set(this.updateAge, this.updateFailed ? t('rankingUpdateError') : age);
    set(this.updateButton, this.updating ? t('rankingUpdating') : label);
    this.updateButton.setAttribute('aria-disabled', String(this.updating || wait > 0));
  }

  /** Shows the board chosen: from the cache or, when it expired or with `update`, read again. */
  private async refresh(update = false): Promise<void> {
    const { leaderboard, language } = this.o;
    const board = this.currentBoard();
    // "Atualizar" keeps the rows in sight, unless the day turned: that is another board.
    const keep = update && board.day === this.board.day;
    const uid = this.playerUid();
    this.board = board;
    this.uid = uid;
    this.dailyTitle.textContent = this.o.t('dailyTitle', { date: formatGameDay(board.day, language) });
    this.syncCountdown();
    if (!leaderboard.available) {
      this.syncOwn(null);
      this.show('unavailable');
      return;
    }
    const request = ++this.request;
    this.updating = keep;
    this.updateFailed = false;
    if (keep) {
      this.syncUpdate();
    } else {
      this.syncOwn(null);
      this.show('loading');
    }
    try {
      const view = await leaderboard.view(board, uid, update);
      if (request !== this.request) return;
      this.updating = false;
      this.render(view, uid);
    } catch {
      if (request !== this.request) return;
      this.updating = false;
      this.updateFailed = keep;
      if (keep) this.syncUpdate();
      else this.show('error');
    }
  }

  private render({ at, rows, own, ownPlace }: BoardView, uid: string | null): void {
    const places = placesOf(rows);
    this.body.replaceChildren(...rows.map((row, i) => this.row(String(places[i] ?? i + 1), row, row.uid === uid)));
    this.ownBody.replaceChildren(...(own ? [this.row(ownPlace === null ? '—' : String(ownPlace), own, true)] : []));
    const index = uid === null ? -1 : rows.findIndex((row) => row.uid === uid);
    const inTop = rows[index];
    if (inTop) this.syncOwn({ row: inTop, place: places[index] ?? index + 1 });
    else this.syncOwn(own && ownPlace !== null ? { row: own, place: ownPlace } : null);
    this.show(rows.length === 0 && !own ? 'empty' : 'rows', at);
  }

  private row(rank: string, data: RankRow, you: boolean): HTMLTableRowElement {
    const { t, formatNumber } = this.o;
    const tr = el('tr', you ? 'is-you' : undefined);
    const name = el('td', 'col-name');
    name.append(el('span', 'ranking__name', data.name));
    if (you) name.append(el('span', 'ranking__you', t('rankingYou')));
    tr.append(
      el('td', 'col-rank', rank),
      name,
      el('td', 'col-num col-score', formatNumber(data.score)),
      el('td', 'col-num', String(Math.round(data.wpm))),
      el('td', 'col-num col-acc', `${Math.round(data.accuracy)}%`),
    );
    if (you) tr.setAttribute('aria-current', 'true');
    return tr;
  }

  /** `at`: when the rows were read (views 'rows' and 'empty'). */
  private show(view: View, at: number | null = null): void {
    const { t } = this.o;
    this.shownAt = at;
    this.syncUpdate();
    this.table.hidden = view !== 'rows';
    this.status.hidden = view === 'rows';
    this.retryButton.hidden = view !== 'error';
    this.root.dataset.view = view;
    const text: Record<Exclude<View, 'rows'>, string> = {
      loading: t('rankingLoading'),
      empty: t('rankingEmpty'),
      error: t('rankingError'),
      unavailable: t('rankingUnavailable'),
    };
    if (view !== 'rows') this.statusText.textContent = text[view];
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.o.onBack();
  };
}
