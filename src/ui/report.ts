// Mission Report: grade S–D, score and statistics at the end of a match.
// Keyboard (via the game input): Enter/Tab play again, Esc goes to the menu.
import type { MatchReport } from '../game/report.ts';
import type { EndReason } from '../game/types.ts';
import { formatPercent, formatTime } from '../utils/format.ts';
import { button, el } from './dom.ts';
import { DIFFICULTY_LABEL, GRADE_LABEL, MODE_LABEL, type StringKey, type Translate } from './i18n.ts';

export interface ReportCallbacks {
  onPlayAgain(): void;
  onMenu(): void;
}

const END_TITLE: Readonly<Record<EndReason, StringKey>> = {
  shield: 'endShield',
  time: 'endTime',
  quit: 'endQuit',
};

const STAT_KEYS = ['destroyed', 'lost', 'accuracy', 'wpm', 'maxCombo', 'wave', 'time', 'letters', 'errors', 'emp'] as const;
type StatKey = (typeof STAT_KEYS)[number];

const STAT_LABEL: Readonly<Record<StatKey, StringKey>> = {
  destroyed: 'statDestroyed',
  lost: 'statLost',
  accuracy: 'statAccuracy',
  wpm: 'statWpm',
  maxCombo: 'statMaxCombo',
  wave: 'statWave',
  time: 'statTime',
  letters: 'statLetters',
  errors: 'statErrors',
  emp: 'statEmp',
};

export class ReportScreen {
  readonly root: HTMLElement;
  private readonly t: Translate;
  private readonly formatScore: (value: number) => string;
  private readonly subtitle: HTMLElement;
  private readonly gradeValue: HTMLElement;
  private readonly scoreValue: HTMLElement;
  private readonly stats: Record<StatKey, HTMLElement>;

  constructor(t: Translate, formatScore: (value: number) => string, callbacks: ReportCallbacks) {
    this.t = t;
    this.formatScore = formatScore;
    this.root = el('div', 'overlay overlay--report');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-labelledby', 'report-title');

    const panel = el('div', 'panel report');
    const title = el('h1', 'panel__title', t('reportTitle'));
    title.id = 'report-title';
    this.subtitle = el('p', 'report__subtitle');

    const summary = el('div', 'report__summary');
    const grade = el('div', 'report__grade');
    this.gradeValue = el('span', 'report__grade-value', 'D');
    grade.append(el('span', 'report__caption', t('grade')), this.gradeValue);
    const score = el('div', 'report__score');
    this.scoreValue = el('span', 'report__score-value', '0');
    score.append(el('span', 'report__caption', t('statScore')), this.scoreValue);
    summary.append(grade, score);

    const list = el('dl', 'report__stats');
    const row = (key: StatKey): HTMLElement => {
      const value = el('dd');
      const item = el('div', 'report__stat');
      item.append(el('dt', undefined, t(STAT_LABEL[key])), value);
      list.append(item);
      return value;
    };
    // Object literal order = display order.
    this.stats = {
      destroyed: row('destroyed'),
      lost: row('lost'),
      accuracy: row('accuracy'),
      wpm: row('wpm'),
      maxCombo: row('maxCombo'),
      wave: row('wave'),
      time: row('time'),
      letters: row('letters'),
      errors: row('errors'),
      emp: row('emp'),
    };

    const actions = el('div', 'panel__actions panel__actions--row');
    actions.append(
      button('btn btn--primary', t('playAgain'), () => callbacks.onPlayAgain(), 'Enter'),
      button('btn', t('toMenu'), () => callbacks.onMenu(), 'Esc'),
    );

    panel.append(title, this.subtitle, summary, list, actions);
    this.root.append(panel);
  }

  show(report: MatchReport): void {
    const t = this.t;
    this.subtitle.textContent = `${t(END_TITLE[report.endReason])} · ${t(MODE_LABEL[report.mode])} · ${t(DIFFICULTY_LABEL[report.difficulty])}`;
    this.gradeValue.textContent = GRADE_LABEL[report.grade];
    this.gradeValue.dataset.grade = report.grade;
    this.scoreValue.textContent = this.formatScore(report.score);

    const values: Record<StatKey, string> = {
      destroyed: String(report.destroyed),
      lost: String(report.lost),
      accuracy: report.letters + report.errors === 0 ? '—' : formatPercent(report.accuracy),
      wpm: String(Math.round(report.wpm)),
      maxCombo: String(report.maxCombo),
      wave: String(report.wave),
      time: formatTime(report.elapsed),
      letters: String(report.letters),
      errors: String(report.errors),
      emp: String(report.empUses),
    };
    for (const key of STAT_KEYS) this.stats[key].textContent = values[key];
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
