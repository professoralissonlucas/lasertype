// Match HUD: shield (HP), EMP charge, score, combo/multiplier, wave, time, kills,
// accuracy, WPM, ice slow, wave banner, boss (health bar and entrance alert) and combat log.
// Only touches the DOM when a displayed value actually changed.
import { isEmpReady } from '../game/combo.ts';
import { bossHealth } from '../game/entities/Boss.ts';
import { accuracyOf, comboMultiplier, wordsPerMinute } from '../game/scoring.ts';
import { timeLeft, type MatchState } from '../game/state.ts';
import type { GameEvent } from '../game/types.ts';
import { formatPercent, formatTime } from '../utils/format.ts';
import { CombatLogPanel, logEntryOf } from './combatLog.ts';
import { el, replayAnimation } from './dom.ts';
import { DIFFICULTY_LABEL, MODE_LABEL, type StringKey, type Translate } from './i18n.ts';

/** A label/value pair in the stats panel. */
function stat(text: string): { row: HTMLElement; label: HTMLElement; value: HTMLElement } {
  const row = el('div', 'stat');
  const label = el('span', 'stat__label', text);
  const value = el('span', 'stat__value', '0');
  row.append(label, value);
  return { row, label, value };
}

export class Hud {
  readonly root: HTMLElement;
  private readonly t: Translate;
  private readonly formatScore: (value: number) => string;
  private readonly log: CombatLogPanel;

  private readonly shieldGroup: HTMLElement;
  private readonly pipsWrap: HTMLElement;
  private pips: HTMLElement[] = [];
  private readonly chargeGroup: HTMLElement;
  private readonly chargeFill: HTMLElement;
  private readonly chargeLabel: HTMLElement;
  private readonly scoreValue: HTMLElement;
  private readonly comboValue: HTMLElement;
  private readonly multiplierValue: HTMLElement;
  private readonly slowChip: HTMLElement;
  private readonly bossGroup: HTMLElement;
  private readonly bossLabel: HTMLElement;
  private readonly bossBar: HTMLElement;
  private bossPips: HTMLElement[] = [];
  private readonly alert: HTMLElement;
  private readonly modeLabel: HTMLElement;
  private readonly timeLabel: HTMLElement;
  private readonly values: Record<'wave' | 'time' | 'kills' | 'accuracy' | 'wpm', HTMLElement>;
  private readonly banner: HTMLElement;

  /** Last rendered strings/numbers, to skip unchanged DOM writes. */
  private readonly last = new Map<string, string | number | boolean>();

  constructor(t: Translate, formatScore: (value: number) => string) {
    this.t = t;
    this.formatScore = formatScore;
    this.root = el('div', 'hud');
    this.root.hidden = true;

    // Left: shield + EMP charge.
    const left = el('div', 'hud__panel hud__panel--left');
    this.shieldGroup = el('div', 'hud__row');
    this.shieldGroup.setAttribute('role', 'status');
    this.pipsWrap = el('span', 'hud__pips');
    this.shieldGroup.append(el('span', 'hud__label', t('shield')), this.pipsWrap);
    this.chargeGroup = el('div', 'hud__charge');
    const bar = el('div', 'hud__bar');
    this.chargeFill = el('div', 'hud__bar-fill');
    bar.append(this.chargeFill);
    this.chargeLabel = el('span', 'hud__label', t('charge'));
    this.chargeGroup.append(this.chargeLabel, bar);
    left.append(this.shieldGroup, this.chargeGroup);

    // Center: score, combo and multiplier.
    const center = el('div', 'hud__center');
    this.scoreValue = el('div', 'hud__score', '0');
    const comboLine = el('div', 'hud__combo');
    this.comboValue = el('span', 'hud__value', '0');
    this.multiplierValue = el('span', 'hud__multiplier', 'x1');
    this.multiplierValue.dataset.tier = '1';
    this.slowChip = el('span', 'hud__chip', t('slow'));
    this.slowChip.hidden = true;
    comboLine.append(el('span', 'hud__label', t('combo')), this.comboValue, this.multiplierValue, this.slowChip);
    this.bossGroup = el('div', 'hud__boss');
    this.bossGroup.setAttribute('role', 'status');
    this.bossGroup.hidden = true;
    this.bossLabel = el('span', 'hud__boss-label');
    this.bossBar = el('div', 'hud__boss-bar');
    this.bossGroup.append(this.bossLabel, this.bossBar);
    center.append(this.scoreValue, comboLine, this.bossGroup);

    // Boss entrance alert.
    this.alert = el('div', 'hud__alert');
    this.alert.setAttribute('role', 'alert');
    this.alert.hidden = true;
    this.alert.append(
      el('span', 'hud__alert-title', t('bossAlertTitle')),
      el('span', 'hud__alert-text', t('bossAlertText')),
      el('span', 'hud__alert-hint', t('bossAlertHint')),
    );

    // Right: mode, stats and the combat log.
    const right = el('div', 'hud__side');
    const stats = el('div', 'hud__panel hud__panel--stats');
    this.modeLabel = el('div', 'hud__mode');
    const wave = stat(t('wave'));
    const time = stat(t('time'));
    this.timeLabel = time.label;
    const kills = stat(t('kills'));
    const accuracy = stat(t('accuracy'));
    const wpm = stat(t('wpm'));
    stats.append(this.modeLabel, wave.row, time.row, kills.row, accuracy.row, wpm.row);
    this.values = { wave: wave.value, time: time.value, kills: kills.value, accuracy: accuracy.value, wpm: wpm.value };
    this.log = new CombatLogPanel(t, formatScore);
    right.append(stats, this.log.root);

    this.banner = el('div', 'hud__banner');
    this.banner.setAttribute('aria-live', 'polite');

    this.root.append(left, center, right, this.banner, this.alert, el('div', 'hud__hint', t('controlsHint')));
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  /** New match: clear the combat log and every cached value. */
  reset(): void {
    this.log.clear();
    this.last.clear();
    this.banner.classList.remove('is-shown');
  }

  /** Feeds the combat log and announces how a boss fight ended. */
  onEvents(events: readonly GameEvent[]): void {
    const { t } = this;
    for (const event of events) {
      const entry = logEntryOf(event, (n) => t('boss', { n }));
      if (entry) this.log.add(entry);
      if (event.type === 'bossDefeated') {
        this.showBanner(t('bossDefeated', { n: this.formatScore(event.points) }), 'good');
      } else if (event.type === 'bossBreach') {
        if (event.lost > 0) this.showBanner(t('bossBreach', { n: event.lost }), 'bad');
        else this.showBanner(t('bossEscaped'), 'bad');
      }
    }
  }

  update(state: Readonly<MatchState>): void {
    const t = this.t;

    if (this.changed('mode', `${state.mode.id}/${state.difficulty}`)) {
      this.modeLabel.textContent = `${t(MODE_LABEL[state.mode.id])} · ${t(DIFFICULTY_LABEL[state.difficulty])}`;
      this.shieldGroup.hidden = !state.mode.damage;
    }

    if (this.changed('shield', `${state.shield}/${state.maxShield}`)) this.updateShield(state);

    const charge = Math.min(1, state.combo.charge);
    if (this.changed('charge', charge)) {
      this.chargeFill.style.transform = `scaleX(${charge})`;
      const ready = isEmpReady(charge);
      this.chargeGroup.classList.toggle('is-ready', ready);
      this.chargeLabel.textContent = t(ready ? 'chargeReady' : 'charge');
    }

    if (this.changed('score', state.score)) this.scoreValue.textContent = this.formatScore(state.score);

    const combo = state.combo.combo;
    if (this.changed('combo', combo)) this.comboValue.textContent = String(combo);
    const multiplier = comboMultiplier(combo);
    const previous = this.last.get('multiplier');
    if (this.changed('multiplier', multiplier)) {
      this.multiplierValue.textContent = `x${multiplier}`;
      this.multiplierValue.dataset.tier = String(multiplier);
      if (typeof previous === 'number' && multiplier > previous) replayAnimation(this.multiplierValue, 'is-bumped');
    }

    if (this.changed('slow', state.slowTimer > 0)) this.slowChip.hidden = state.slowTimer <= 0;

    if (this.changed('wave', state.wave)) {
      this.values.wave.textContent = String(Math.max(1, state.wave));
      if (state.wave > 0) this.showBanner(t('waveBanner', { n: state.wave }), 'wave');
    }

    this.updateBoss(state);

    const remaining = timeLeft(state);
    const timeKey: StringKey = remaining === null ? 'time' : 'timeLeft';
    if (this.changed('timeLabel', timeKey)) this.timeLabel.textContent = t(timeKey);
    const time = formatTime(remaining === null ? state.elapsed : Math.ceil(remaining));
    if (this.changed('time', time)) {
      this.values.time.textContent = time;
      this.values.time.classList.toggle('is-low', remaining !== null && remaining <= 10);
    }

    if (this.changed('kills', state.stats.destroyed)) this.values.kills.textContent = String(state.stats.destroyed);

    const { hits, misses } = state.stats;
    const accuracy = hits + misses === 0 ? '—' : formatPercent(accuracyOf(hits, misses));
    if (this.changed('accuracy', accuracy)) this.values.accuracy.textContent = accuracy;

    const wpm = String(Math.round(wordsPerMinute(hits, state.elapsed)));
    if (this.changed('wpm', wpm)) this.values.wpm.textContent = wpm;
  }

  /** True (and remembers the value) when `value` differs from the last one shown. */
  private changed(key: string, value: string | number | boolean): boolean {
    if (this.last.get(key) === value) return false;
    this.last.set(key, value);
    return true;
  }

  private showBanner(text: string, tone: 'wave' | 'good' | 'bad'): void {
    this.banner.textContent = text;
    this.banner.dataset.tone = tone;
    replayAnimation(this.banner, 'is-shown');
  }

  /** Health bar (one segment per word left) and the entrance alert. */
  private updateBoss(state: Readonly<MatchState>): void {
    const { boss } = state;
    const alerting = boss !== null && boss.alert > 0 && state.status !== 'gameover';
    if (this.changed('bossAlert', alerting)) this.alert.hidden = !alerting;

    // The bar comes up once the boss is in place.
    const fighting = boss !== null && boss.alert <= 0;
    const health = boss ? bossHealth(boss) : 0;
    if (!this.changed('boss', fighting ? `${boss.number}/${health}/${boss.words.length}` : '')) return;
    this.bossGroup.hidden = !fighting;
    if (!fighting) return;
    const max = boss.words.length;
    if (this.bossPips.length !== max) {
      this.bossPips = Array.from({ length: max }, () => el('span', 'hud__boss-pip'));
      this.bossBar.replaceChildren(...this.bossPips);
    }
    // Segments go out from the right, like a bar emptying.
    this.bossPips.forEach((pip, i) => pip.classList.toggle('is-lost', i >= health));
    this.bossLabel.textContent = this.t('boss', { n: boss.number });
    this.bossGroup.setAttribute('aria-label', this.t('bossHealth', { n: health, max }));
  }

  private updateShield(state: Readonly<MatchState>): void {
    if (this.pips.length !== state.maxShield) {
      this.pips = Array.from({ length: state.maxShield }, () => el('span', 'hud__pip'));
      this.pipsWrap.replaceChildren(...this.pips);
    }
    this.pips.forEach((pip, i) => pip.classList.toggle('hud__pip--empty', i >= state.shield));
    this.shieldGroup.classList.toggle('is-danger', state.shield <= 1);
    this.shieldGroup.setAttribute('aria-label', `${this.t('shield')}: ${state.shield}/${state.maxShield}`);
  }
}
