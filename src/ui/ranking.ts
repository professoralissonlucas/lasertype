// Global ranking: tabs per mode, difficulty and language filters, top 50 with the player's
// own row highlighted (or shown below the table when outside the top). Esc returns.
import type { Leaderboard } from '../firebase/leaderboard.ts';
import { RANKED_MODES, type AccountState, type Board, type RankedMode, type RankRow } from '../firebase/types.ts';
import { GAME_DIFFICULTIES } from '../game/types.ts';
import { LANGUAGES } from '../words/types.ts';
import type { AccountBadge } from './account.ts';
import { button, el, radioGroup } from './dom.ts';
import { DIFFICULTY_LABEL, LANGUAGE_NAME, MODE_LABEL, type Translate } from './i18n.ts';

export interface RankingOptions {
  readonly t: Translate;
  readonly formatNumber: (value: number) => string;
  readonly leaderboard: Leaderboard;
  readonly account: () => AccountState;
  readonly accountBadge: AccountBadge;
  /** Board opened first (the menu's mode, difficulty and language). */
  readonly initial: Board;
  readonly onBack: () => void;
}

type View = 'loading' | 'rows' | 'empty' | 'error' | 'unavailable';

export class RankingScreen {
  readonly root: HTMLElement;
  private readonly o: RankingOptions;
  private readonly tabs: Record<RankedMode, HTMLButtonElement>;
  private readonly table: HTMLTableElement;
  private readonly body: HTMLTableSectionElement;
  private readonly ownBody: HTMLTableSectionElement;
  private readonly status: HTMLElement;
  private readonly statusText: HTMLElement;
  private readonly retryButton: HTMLButtonElement;
  private board: Board;
  /** Ignores answers to requests that were superseded (fast tab flipping). */
  private request = 0;

  constructor(options: RankingOptions) {
    this.o = options;
    this.board = options.initial;
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
      node.addEventListener('click', () => this.setBoard({ mode }));
      return node;
    };
    this.tabs = { survival: tab('survival'), timeAttack: tab('timeAttack') };
    tabList.append(...RANKED_MODES.map((mode) => this.tabs[mode]));
    tabList.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const index = RANKED_MODES.indexOf(this.board.mode);
      const step = event.key === 'ArrowRight' ? 1 : -1;
      const next = RANKED_MODES[(index + step + RANKED_MODES.length) % RANKED_MODES.length] ?? 'survival';
      this.setBoard({ mode: next });
      this.tabs[next].focus();
    });

    // Filters.
    const filters = el('div', 'ranking__filters');
    filters.append(
      radioGroup(
        'choice--segmented',
        t('menuDifficulty'),
        'ranking-diff',
        GAME_DIFFICULTIES.map((id) => ({ value: id, label: t(DIFFICULTY_LABEL[id]) })),
        this.board.diff,
        (diff) => this.setBoard({ diff }),
      ),
      radioGroup(
        'choice--segmented',
        t('menuLanguage'),
        'ranking-lang',
        LANGUAGES.map((id) => ({ value: id, label: LANGUAGE_NAME[id] })),
        this.board.lang,
        (lang) => this.setBoard({ lang }),
      ),
    );

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
    this.retryButton = button('btn btn--small', t('rankingRetry'), () => void this.refresh(true));
    this.status.append(this.statusText, this.retryButton);

    const footer = el('div', 'panel__footer');
    footer.append(el('p', 'panel__note', t('rankingHint')), button('btn', t('back'), () => options.onBack(), 'Esc'));

    panel.append(header, tabList, filters, this.table, this.status, footer);
    this.root.append(panel);
    this.syncTabs();
  }

  setVisible(visible: boolean): void {
    if (visible === !this.root.hidden) return;
    this.root.hidden = !visible;
    if (visible) {
      window.addEventListener('keydown', this.onKeyDown);
      void this.refresh();
    } else {
      window.removeEventListener('keydown', this.onKeyDown);
      this.request++;
    }
  }

  focus(): void {
    this.tabs[this.board.mode].focus({ preventScroll: true });
  }

  /** Account changed (linked, switched): re-highlight the player's row. */
  onAccountChange(): void {
    if (!this.root.hidden) void this.refresh();
  }

  private setBoard(patch: Partial<Board>): void {
    this.board = { ...this.board, ...patch };
    this.syncTabs();
    void this.refresh();
  }

  private syncTabs(): void {
    for (const mode of RANKED_MODES) {
      const active = mode === this.board.mode;
      this.tabs[mode].setAttribute('aria-selected', String(active));
      this.tabs[mode].tabIndex = active ? 0 : -1;
    }
  }

  private async refresh(retry = false): Promise<void> {
    const { leaderboard, account } = this.o;
    if (!leaderboard.available) {
      this.show('unavailable');
      return;
    }
    const request = ++this.request;
    const board = this.board;
    this.show('loading');
    if (retry) this.retryButton.blur();
    try {
      const rows = await leaderboard.top(board);
      const me = account();
      const uid = me.status === 'google' ? me.uid : null;
      const inTop = uid !== null && rows.some((row) => row.uid === uid);
      const own = uid !== null && !inTop ? await leaderboard.own(board, uid) : null;
      if (request !== this.request) return;
      this.render(rows, own, uid);
      this.show(rows.length === 0 && !own ? 'empty' : 'rows');
    } catch {
      if (request !== this.request) return;
      this.show('error');
    }
  }

  private render(rows: readonly RankRow[], own: RankRow | null, uid: string | null): void {
    this.body.replaceChildren(...rows.map((row, i) => this.row(String(i + 1), row, row.uid === uid)));
    this.ownBody.replaceChildren(...(own ? [this.row('—', own, true)] : []));
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

  private show(view: View): void {
    const { t } = this.o;
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
