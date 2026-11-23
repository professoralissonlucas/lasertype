// Progress screen: level and XP on top, then three tabs — missions and login streak,
// achievements, collections (and their titles). Esc or "Voltar" returns to the menu.
import { CONFIG } from '../config.ts';
import { COLLECTIONS, isComplete, type Collection } from '../cosmetics/collections.ts';
import { getItem } from '../cosmetics/catalog.ts';
import type { Economy } from '../economy/Economy.ts';
import type { SoundPlayer } from '../audio/types.ts';
import { ACHIEVEMENTS, isAchieved, type Achievement } from '../progression/achievements.ts';
import { streakSlot } from '../progression/streak.ts';
import { chestCoins } from '../progression/xp.ts';
import { formatCountdown } from '../utils/format.ts';
import type { Language } from '../words/types.ts';
import { button, el, ProgressBar } from './dom.ts';
import type { StringKey, Translate } from './i18n.ts';
import { achievementDescription, achievementName, itemFullName, missionText, titleText } from './progressText.ts';
import { itemSwatch } from './shopModel.ts';

export interface ProgressOptions {
  readonly t: Translate;
  readonly language: Language;
  readonly formatNumber: (value: number) => string;
  readonly economy: Economy;
  readonly sound: SoundPlayer;
  readonly onBack: () => void;
}

const TABS = ['missions', 'achievements', 'collections'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Readonly<Record<Tab, StringKey>> = {
  missions: 'progressMissions',
  achievements: 'progressAchievements',
  collections: 'progressCollections',
};

const TAB_HINT: Readonly<Record<Tab, StringKey>> = {
  missions: 'missionsHint',
  achievements: 'achHint',
  collections: 'collectionsHint',
};

/** Countdown refresh (also notices when the day turns). */
const TICK_MS = 1000;

interface MissionRow {
  readonly root: HTMLElement;
  readonly text: HTMLElement;
  readonly value: HTMLElement;
  readonly coins: HTMLElement;
  readonly bar: ProgressBar;
}

interface AchievementRow {
  readonly achievement: Achievement;
  readonly root: HTMLElement;
  readonly value: HTMLElement;
  readonly status: HTMLElement;
  readonly bar: ProgressBar;
}

interface CollectionRow {
  readonly collection: Collection;
  readonly root: HTMLElement;
  readonly count: HTMLElement;
  readonly chips: readonly { readonly itemId: string; readonly root: HTMLElement }[];
  readonly action: HTMLButtonElement;
}

/** "◉ +30" — a coin icon and an amount. */
function coins(text: string): HTMLElement {
  const node = el('span', 'coins');
  node.append(el('span', 'coin'), el('span', 'coins__value', text));
  return node;
}

export class ProgressScreen {
  readonly root: HTMLElement;
  private readonly o: ProgressOptions;
  private readonly levelName: HTMLElement;
  private readonly levelXp: HTMLElement;
  private readonly levelTitle: HTMLElement;
  private readonly levelChest: HTMLElement;
  private readonly levelBar = new ProgressBar('bar--level');
  private readonly tabButtons: Record<Tab, HTMLButtonElement>;
  private readonly panels: Record<Tab, HTMLElement>;
  private readonly hint: HTMLElement;
  private readonly missionRows: readonly MissionRow[];
  private readonly reset: HTMLElement;
  private readonly streakNow: HTMLElement;
  private readonly streakCells: readonly HTMLElement[];
  private readonly achievementRows: readonly AchievementRow[];
  private readonly collectionRows: readonly CollectionRow[];
  private tab: Tab = 'missions';
  private tickTimer: number | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(options: ProgressOptions) {
    this.o = options;
    const { t } = options;
    this.root = el('section', 'screen progress');
    this.root.setAttribute('aria-labelledby', 'progress-title');
    this.root.hidden = true;

    const panel = el('div', 'panel progress__panel');
    const title = el('h1', 'panel__title', t('progressTitle'));
    title.id = 'progress-title';

    // Level.
    const level = el('div', 'progress__level');
    this.levelName = el('span', 'progress__level-name');
    this.levelTitle = el('span', 'title-badge');
    this.levelXp = el('span', 'progress__level-xp');
    this.levelChest = el('span', 'progress__level-chest');
    const top = el('div', 'progress__level-row');
    top.append(this.levelName, this.levelTitle, this.levelXp);
    level.append(top, this.levelBar.root, this.levelChest);

    // Tabs.
    const tabs = el('div', 'tabs');
    tabs.setAttribute('role', 'tablist');
    const tab = (id: Tab): HTMLButtonElement => {
      const node = el('button', 'tabs__tab', t(TAB_LABEL[id]));
      node.type = 'button';
      node.id = `progress-tab-${id}`;
      node.setAttribute('role', 'tab');
      node.setAttribute('aria-controls', `progress-panel-${id}`);
      node.addEventListener('click', () => this.switchTab(id));
      return node;
    };
    this.tabButtons = { missions: tab('missions'), achievements: tab('achievements'), collections: tab('collections') };
    tabs.append(...TABS.map((id) => this.tabButtons[id]));
    tabs.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      const next = TABS[(TABS.indexOf(this.tab) + step + TABS.length) % TABS.length] ?? 'missions';
      this.switchTab(next);
      this.tabButtons[next].focus();
    });
    const tabPanel = (id: Tab): HTMLElement => {
      const node = el('div', 'progress__tabpanel');
      node.id = `progress-panel-${id}`;
      node.setAttribute('role', 'tabpanel');
      node.setAttribute('aria-labelledby', `progress-tab-${id}`);
      return node;
    };
    this.panels = {
      missions: tabPanel('missions'),
      achievements: tabPanel('achievements'),
      collections: tabPanel('collections'),
    };

    // Missions and streak.
    const missionHead = el('div', 'progress__head');
    this.reset = el('span', 'progress__countdown');
    missionHead.append(el('h2', 'progress__subtitle', t('missionsToday')), this.reset);
    const missionList = el('ul', 'progress__list');
    this.missionRows = CONFIG.progression.missions.slots.map(() => this.buildMission(missionList));
    const streakHead = el('div', 'progress__head');
    this.streakNow = el('span', 'progress__countdown');
    streakHead.append(el('h2', 'progress__subtitle', t('streakTitle')), this.streakNow);
    const streak = el('ol', 'streak');
    this.streakCells = CONFIG.progression.streakCoins.map((amount, i) => {
      const cell = el('li', 'streak__day');
      cell.append(el('span', 'streak__label', t('streakDay', { n: i + 1 })), coins(String(amount)));
      streak.append(cell);
      return cell;
    });
    const streakHint = el('p', 'panel__note', t('streakHint', { n: this.streakCells.length }));
    this.panels.missions.append(missionHead, missionList, streakHead, streak, streakHint);

    // Achievements.
    const achievementList = el('ul', 'progress__list');
    this.achievementRows = ACHIEVEMENTS.map((entry) => this.buildAchievement(entry, achievementList));
    this.panels.achievements.append(achievementList);

    // Collections.
    const collectionList = el('ul', 'progress__list');
    this.collectionRows = COLLECTIONS.map((entry) => this.buildCollection(entry, collectionList));
    this.panels.collections.append(collectionList);

    const footer = el('div', 'panel__footer');
    this.hint = el('p', 'panel__note');
    footer.append(this.hint, button('btn', t('back'), () => options.onBack(), 'Esc'));

    panel.append(title, level, tabs, ...TABS.map((id) => this.panels[id]), footer);
    this.root.append(panel);
    this.switchTab('missions');
  }

  setVisible(visible: boolean): void {
    if (visible === !this.root.hidden) return;
    this.root.hidden = !visible;
    if (visible) {
      window.addEventListener('keydown', this.onKeyDown);
      this.unsubscribe = this.o.economy.subscribe(() => this.refresh());
      this.tickTimer = window.setInterval(this.tick, TICK_MS);
      this.refresh();
    } else {
      window.removeEventListener('keydown', this.onKeyDown);
      this.unsubscribe?.();
      this.unsubscribe = null;
      if (this.tickTimer !== null) window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  focus(): void {
    this.tabButtons[this.tab].focus({ preventScroll: true });
  }

  // ---------- Building ----------

  private buildMission(list: HTMLElement): MissionRow {
    const root = el('li', 'progress__row');
    const text = el('span', 'progress__row-title');
    const coinsSlot = el('span', 'progress__row-reward');
    const value = el('span', 'progress__row-value');
    const bar = new ProgressBar();
    const head = el('div', 'progress__row-head');
    head.append(text, coinsSlot);
    const foot = el('div', 'progress__row-foot');
    foot.append(bar.root, value);
    root.append(head, foot);
    list.append(root);
    return { root, text, value, coins: coinsSlot, bar };
  }

  private buildAchievement(achievement: Achievement, list: HTMLElement): AchievementRow {
    const { t, language } = this.o;
    const root = el('li', 'progress__row');
    const head = el('div', 'progress__row-head');
    const status = el('span', 'progress__row-reward');
    head.append(el('span', 'progress__row-title', achievementName(t, achievement)), status);
    const description = el('p', 'progress__row-text', achievementDescription(t, achievement));
    const reward = el('p', 'progress__item');
    const item = getItem(achievement.itemId);
    if (item) {
      reward.dataset.rarity = item.rarity;
      reward.append(this.swatch(item.id), el('span', undefined, itemFullName(t, language, item.id)));
    }
    const value = el('span', 'progress__row-value');
    const bar = new ProgressBar();
    const foot = el('div', 'progress__row-foot');
    foot.append(bar.root, value);
    root.append(head, description, reward, foot);
    list.append(root);
    return { achievement, root, value, status, bar };
  }

  private buildCollection(collection: Collection, list: HTMLElement): CollectionRow {
    const { t, language } = this.o;
    const root = el('li', 'progress__row');
    const head = el('div', 'progress__row-head');
    const count = el('span', 'progress__row-value');
    head.append(el('span', 'progress__row-title', collection.name[language]), count);
    const items = el('div', 'progress__chips');
    const chips = collection.items.map((item) => {
      const chip = el('span', 'progress__chip');
      chip.append(this.swatch(item.id), el('span', undefined, itemFullName(t, language, item.id)));
      items.append(chip);
      return { itemId: item.id, root: chip };
    });
    const foot = el('div', 'progress__row-foot');
    const action = button('btn btn--small', '', () => this.toggleTitle(collection));
    foot.append(el('span', 'progress__row-text', t('collectionTitle', { title: collection.title[language] })), action);
    root.append(head, items, foot);
    list.append(root);
    return { collection, root, count, chips, action };
  }

  /** Two-color swatch of an item, like on its shop card. */
  private swatch(itemId: string): HTMLElement {
    const node = el('span', 'item-card__swatch');
    const item = getItem(itemId);
    if (item) {
      const [a, b] = itemSwatch(item);
      node.style.setProperty('--swatch-a', a);
      node.style.setProperty('--swatch-b', b);
    }
    return node;
  }

  // ---------- State ----------

  private switchTab(tab: Tab): void {
    this.tab = tab;
    for (const id of TABS) {
      const active = id === tab;
      this.tabButtons[id].setAttribute('aria-selected', String(active));
      this.tabButtons[id].tabIndex = active ? 0 : -1;
      this.panels[id].hidden = !active;
    }
    this.hint.textContent = this.o.t(TAB_HINT[tab]);
  }

  private toggleTitle(collection: Collection): void {
    const { economy, sound } = this.o;
    const wearing = economy.inventory.equipped.title === collection.titleId;
    if (economy.equipTitle(wearing ? null : collection.titleId).ok) sound.play('equip');
  }

  private readonly tick = (): void => {
    this.refreshMissions();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.o.onBack();
  };

  // ---------- Rendering ----------

  private refresh(): void {
    this.refreshLevel();
    this.refreshMissions();
    for (const row of this.achievementRows) this.refreshAchievement(row);
    for (const row of this.collectionRows) this.refreshCollection(row);
  }

  private refreshLevel(): void {
    const { economy, t, formatNumber, language } = this.o;
    const { level, into, cost } = economy.level;
    const xp = t('levelXp', { into: formatNumber(into), cost: formatNumber(cost) });
    this.levelName.textContent = t('level', { n: level });
    this.levelXp.textContent = xp;
    this.levelBar.set(into, cost, xp);
    this.levelChest.textContent = t('progressNextChest', { n: level + 1, coins: chestCoins(level + 1) });
    const title = titleText(language, economy.inventory.equipped);
    this.levelTitle.hidden = title === null;
    this.levelTitle.textContent = title ?? '';
  }

  private refreshMissions(): void {
    const { economy, t, formatNumber } = this.o;
    this.reset.textContent = t('missionsReset', { time: formatCountdown(economy.msUntilRotation()) });
    for (const [i, view] of economy.missions().entries()) {
      const row = this.missionRows[i];
      if (!row) continue;
      const value = `${formatNumber(view.progress)} / ${formatNumber(view.target)}`;
      row.text.textContent = missionText(t, formatNumber, view);
      row.value.textContent = view.done ? t('missionDone') : value;
      row.coins.replaceChildren(coins(`+${view.coins}`));
      row.bar.set(view.progress, view.target, value);
      row.root.classList.toggle('is-done', view.done);
    }

    const { streak, day, progress } = economy;
    this.streakNow.textContent = t('streakNow', { n: streak, best: progress.stats.bestStreak });
    // Today's cell: the login just counted, or the one waiting (not counted yet, e.g. no network).
    const counted = progress.lastLogin !== null && progress.lastLogin >= day;
    const today = streakSlot(counted ? streak : streak + 1);
    for (const [i, cell] of this.streakCells.entries()) {
      cell.classList.toggle('is-done', i < today || (i === today && counted));
      cell.classList.toggle('is-today', i === today);
      if (i === today) cell.setAttribute('aria-current', 'date');
      else cell.removeAttribute('aria-current');
    }
  }

  private refreshAchievement({ achievement, root, value, status, bar }: AchievementRow): void {
    const { economy, t, formatNumber } = this.o;
    const { stats } = economy.progress;
    const owned = economy.owns(achievement.itemId);
    const reached = owned ? achievement.target : Math.min(achievement.target, Math.floor(stats[achievement.stat]));
    const text = `${formatNumber(reached)} / ${formatNumber(achievement.target)}`;
    value.textContent = text;
    bar.set(reached, achievement.target, text);
    status.textContent = owned ? t('achUnlocked') : isAchieved(achievement, stats) ? t('achUnlocking') : '';
    root.classList.toggle('is-done', owned);
  }

  private refreshCollection({ collection, root, count, chips, action }: CollectionRow): void {
    const { economy, t } = this.o;
    const owns = (id: string) => economy.owns(id);
    const complete = isComplete(collection, owns);
    const wearing = complete && economy.inventory.equipped.title === collection.titleId;
    count.textContent = `${collection.items.filter((item) => owns(item.id)).length} / ${collection.items.length}`;
    for (const chip of chips) chip.root.classList.toggle('is-owned', owns(chip.itemId));
    root.classList.toggle('is-done', complete);
    const label = complete ? (wearing ? 'collectionRemove' : 'collectionWear') : 'collectionLocked';
    action.replaceChildren(t(label));
    action.disabled = !complete;
  }
}
