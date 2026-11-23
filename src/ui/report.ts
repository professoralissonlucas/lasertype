// Mission Report: grade S–D, score, what the match earned (coins, XP, chests, missions,
// achievements) and statistics.
// Keyboard (via the game input): Enter/Tab play again, Esc goes to the menu.
import { CONFIG } from '../config.ts';
import type { MatchOutcome } from '../economy/types.ts';
import type { MatchReport } from '../game/report.ts';
import type { EndReason } from '../game/types.ts';
import { formatPercent, formatTime } from '../utils/format.ts';
import type { Language } from '../words/types.ts';
import { button, el, ProgressBar } from './dom.ts';
import { DIFFICULTY_LABEL, GRADE_LABEL, MODE_LABEL, type StringKey, type Translate } from './i18n.ts';
import { achievementName, itemFullName, missionText } from './progressText.ts';

export interface ReportCallbacks {
  onPlayAgain(): void;
  onMenu(): void;
  /** Must call AuthService.linkGoogle() synchronously (the popup opens in the click). */
  onSignIn(): void;
}

/** What the player has after the match was credited. */
export interface ReportPlayer {
  /** Coin balance. */
  readonly coins: number;
  /** Title being worn, null without one. */
  readonly title: string | null;
}

/** The ranking line under the coins: what happened to this match in the global ranking. */
export interface RankingLine {
  readonly text: string;
  readonly tone: 'record' | 'info' | 'error';
  /** Show "Entrar com Google" (anonymous player). */
  readonly signIn: boolean;
}

const END_TITLE: Readonly<Record<EndReason, StringKey>> = {
  shield: 'endShield',
  time: 'endTime',
  quit: 'endQuit',
};

const STAT_KEYS = ['destroyed', 'lost', 'accuracy', 'wpm', 'burst', 'maxCombo', 'wave', 'time', 'letters', 'errors', 'emp', 'bosses'] as const;
type StatKey = (typeof STAT_KEYS)[number];

const STAT_LABEL: Readonly<Record<StatKey, StringKey>> = {
  destroyed: 'statDestroyed',
  lost: 'statLost',
  accuracy: 'statAccuracy',
  wpm: 'statWpm',
  burst: 'statBurst',
  maxCombo: 'statMaxCombo',
  wave: 'statWave',
  time: 'statTime',
  letters: 'statLetters',
  errors: 'statErrors',
  emp: 'statEmp',
  bosses: 'statBosses',
};

export class ReportScreen {
  readonly root: HTMLElement;
  private readonly t: Translate;
  private readonly language: Language;
  private readonly formatScore: (value: number) => string;
  private readonly subtitle: HTMLElement;
  private readonly gradeValue: HTMLElement;
  private readonly scoreValue: HTMLElement;
  private readonly coinsValue: HTMLElement;
  private readonly coinsDetail: HTMLElement;
  private readonly balance: HTMLElement;
  private readonly xpValue: HTMLElement;
  private readonly xpDetail: HTMLElement;
  private readonly levelName: HTMLElement;
  private readonly titleBadge: HTMLElement;
  private readonly levelXp: HTMLElement;
  private readonly levelBar = new ProgressBar('bar--level');
  private readonly feats: HTMLElement;
  private readonly rankLine: HTMLElement;
  private readonly rankText: HTMLElement;
  private readonly rankSignIn: HTMLButtonElement;
  private readonly stats: Record<StatKey, HTMLElement>;

  constructor(t: Translate, language: Language, formatScore: (value: number) => string, callbacks: ReportCallbacks) {
    this.t = t;
    this.language = language;
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

    // Coins earned, with how they were computed, and the new balance.
    const coins = el('div', 'report__coins');
    const earned = el('div', 'report__coins-earned');
    this.coinsValue = el('span', 'coins__value', '+0');
    const amount = el('span', 'coins coins--large');
    amount.append(el('span', 'coin'), this.coinsValue);
    earned.append(el('span', 'report__caption', t('reportCoins')), amount);
    const info = el('div', 'report__coins-info');
    this.coinsDetail = el('span', 'report__coins-detail');
    this.balance = el('span', 'report__balance');
    info.append(this.coinsDetail, this.balance);
    coins.append(earned, info);

    // XP earned and the level bar, then what the match completed (chests, missions, achievements).
    const progress = el('div', 'report__progress');
    this.xpValue = el('span', 'report__xp-value', '+0');
    this.xpDetail = el('span', 'report__coins-detail');
    this.levelName = el('span', 'report__level');
    this.titleBadge = el('span', 'title-badge');
    this.levelXp = el('span', 'report__level-xp');
    const xpRow = el('div', 'report__progress-row');
    xpRow.append(el('span', 'report__caption', t('reportXp')), this.xpValue, this.xpDetail);
    const levelRow = el('div', 'report__progress-row');
    levelRow.append(this.levelName, this.titleBadge, this.levelXp);
    this.feats = el('ul', 'report__feats');
    progress.append(xpRow, levelRow, this.levelBar.root, this.feats);

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
      burst: row('burst'),
      maxCombo: row('maxCombo'),
      wave: row('wave'),
      time: row('time'),
      letters: row('letters'),
      errors: row('errors'),
      emp: row('emp'),
      bosses: row('bosses'),
    };

    const actions = el('div', 'panel__actions panel__actions--row');
    actions.append(
      button('btn btn--primary', t('playAgain'), () => callbacks.onPlayAgain(), 'Enter'),
      button('btn', t('toMenu'), () => callbacks.onMenu(), 'Esc'),
    );

    // Global ranking status (filled in when the submission finishes).
    this.rankLine = el('div', 'report__rank');
    this.rankLine.hidden = true;
    this.rankText = el('span', 'report__rank-text');
    this.rankText.setAttribute('aria-live', 'polite');
    this.rankSignIn = button('btn btn--small', t('accountSignIn'), () => callbacks.onSignIn());
    this.rankLine.append(this.rankText, this.rankSignIn);

    panel.append(title, this.subtitle, summary, coins, progress, this.rankLine, list, actions);
    this.root.append(panel);
  }

  /** `outcome` = what this match earned, already credited to `player`. */
  show(report: MatchReport, outcome: MatchOutcome, player: ReportPlayer): void {
    const t = this.t;
    const reward = outcome.coins;
    this.coinsValue.textContent = `+${this.formatScore(reward.total)}`;
    const parts = [t('reportCoinsScore', { n: reward.fromScore })];
    if (reward.gradeBonus > 0) parts.push(t('reportCoinsGrade', { n: reward.gradeBonus, grade: GRADE_LABEL[report.grade] }));
    if (reward.factor !== 1) {
      parts.push(t('reportCoinsMode', { pct: Math.round(reward.factor * 100), mode: t(MODE_LABEL[report.mode]) }));
    }
    this.coinsDetail.textContent = parts.join(' · ');
    this.balance.textContent = t('reportBalance', { n: this.formatScore(player.coins) });
    this.showProgress(report, outcome, player);

    this.subtitle.textContent = `${t(END_TITLE[report.endReason])} · ${t(MODE_LABEL[report.mode])} · ${t(DIFFICULTY_LABEL[report.difficulty])}`;
    this.gradeValue.textContent = GRADE_LABEL[report.grade];
    this.gradeValue.dataset.grade = report.grade;
    this.scoreValue.textContent = this.formatScore(report.score);

    const values: Record<StatKey, string> = {
      destroyed: String(report.destroyed),
      lost: String(report.lost),
      accuracy: report.letters + report.errors === 0 ? '—' : formatPercent(report.accuracy),
      wpm: String(Math.round(report.wpm)),
      burst: report.burst > 0 ? String(Math.floor(report.burst)) : '—',
      maxCombo: String(report.maxCombo),
      wave: String(report.wave),
      time: formatTime(report.elapsed),
      letters: String(report.letters),
      errors: String(report.errors),
      emp: String(report.empUses),
      bosses: String(report.bosses),
    };
    for (const key of STAT_KEYS) this.stats[key].textContent = values[key];
    // Only matches that beat one show the row.
    this.stats.bosses.parentElement?.toggleAttribute('hidden', report.bosses === 0);
    this.root.hidden = false;
  }

  private showProgress(report: MatchReport, outcome: MatchOutcome, player: ReportPlayer): void {
    const { t, formatScore: n } = this;
    const { xp, after, chests, missions, completed, achievements } = outcome;
    this.xpValue.textContent = `+${n(xp.total)}`;
    const parts = [t('reportXpLetters', { n: n(xp.fromLetters) })];
    if (xp.fromWords > 0) parts.push(t('reportXpWords', { n: n(xp.fromWords) }));
    if (xp.fromBosses > 0) parts.push(t('reportXpBosses', { n: n(xp.fromBosses) }));
    const { maxPerMatch } = CONFIG.progression.xp;
    if (xp.fromLetters + xp.fromWords + xp.fromBosses > maxPerMatch) parts.push(t('reportXpMax', { n: n(maxPerMatch) }));
    if (xp.factor !== 1) parts.push(t('reportCoinsMode', { pct: Math.round(xp.factor * 100), mode: t(MODE_LABEL[report.mode]) }));
    this.xpDetail.textContent = parts.join(' · ');

    const bar = t('levelXp', { into: n(after.into), cost: n(after.cost) });
    this.levelName.textContent = t('level', { n: after.level });
    this.levelXp.textContent = bar;
    this.levelBar.set(after.into, after.cost, bar);
    this.titleBadge.hidden = player.title === null;
    this.titleBadge.textContent = player.title ?? '';

    const feat = (kind: string, text: string): HTMLElement => {
      const node = el('li', 'report__feat', text);
      node.dataset.kind = kind;
      return node;
    };
    // Several levels at once: one line with everything the chests held.
    const chestCoins = chests.reduce((sum, chest) => sum + chest.coins, 0);
    this.feats.replaceChildren(
      ...(chests.length > 0 ? [feat('chest', t('reportLevelUp', { n: after.level, coins: n(chestCoins) }))] : []),
      ...missions
        .filter(({ slot }) => completed.includes(slot))
        .map((view) => feat('mission', t('reportMission', { mission: missionText(t, n, view), coins: view.coins }))),
      ...achievements.map((entry) => {
        const item = itemFullName(t, this.language, entry.itemId);
        return feat('achievement', t('reportAchievement', { name: achievementName(t, entry), item }));
      }),
    );
    this.feats.hidden = this.feats.childElementCount === 0;
  }

  /** null hides the line (offline build). */
  setRanking(line: RankingLine | null): void {
    this.rankLine.hidden = line === null;
    if (!line) return;
    this.rankLine.dataset.tone = line.tone;
    this.rankText.textContent = line.text;
    this.rankSignIn.hidden = !line.signIn;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
