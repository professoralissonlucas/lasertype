// Combat log: a short feed of the latest destroyed words (a boss's too) and boss bonuses.
import type { DestroyCause, GameEvent, WordKind } from '../game/types.ts';
import { el, replayAnimation } from './dom.ts';
import type { Translate } from './i18n.ts';

/** How the points were earned: `bonus` = a boss was defeated. */
export type LogCause = DestroyCause | 'bonus';

export interface CombatLogEntry {
  readonly id: number;
  readonly text: string;
  readonly kind: WordKind | 'boss';
  readonly cause: LogCause;
  readonly points: number;
  readonly multiplier: number;
}

type LogInput = Omit<CombatLogEntry, 'id'>;

/** The log entry of a game event, or null when the log does not show it. */
export function logEntryOf(event: GameEvent, bossName: (n: number) => string): LogInput | null {
  switch (event.type) {
    case 'destroy':
      return { text: event.text, kind: event.kind, cause: event.cause, points: event.points, multiplier: event.multiplier };
    case 'bossWord':
      return { text: event.text, kind: 'boss', cause: event.cause, points: event.points, multiplier: event.multiplier };
    case 'bossDefeated':
      return { text: bossName(event.boss.number), kind: 'boss', cause: 'bonus', points: event.points, multiplier: 1 };
    default:
      return null;
  }
}

/** Pure model: newest entry first, at most `capacity` entries. */
export class CombatLogModel {
  private readonly capacity: number;
  private list: CombatLogEntry[] = [];
  private nextId = 1;

  constructor(capacity: number) {
    this.capacity = Math.max(1, capacity);
  }

  get entries(): readonly CombatLogEntry[] {
    return this.list;
  }

  add(event: LogInput): CombatLogEntry {
    const entry: CombatLogEntry = {
      id: this.nextId++,
      text: event.text,
      kind: event.kind,
      cause: event.cause,
      points: event.points,
      multiplier: event.multiplier,
    };
    this.list = [entry, ...this.list].slice(0, this.capacity);
    return entry;
  }

  clear(): void {
    this.list = [];
  }
}

/** DOM panel: rows slide in at the top; older rows fade (CSS). */
export class CombatLogPanel {
  readonly root: HTMLElement;
  private readonly t: Translate;
  private readonly formatScore: (value: number) => string;
  private readonly model: CombatLogModel;
  private readonly list: HTMLOListElement;

  constructor(t: Translate, formatScore: (value: number) => string, capacity = 7) {
    this.t = t;
    this.formatScore = formatScore;
    this.model = new CombatLogModel(capacity);
    this.root = el('section', 'log');
    this.root.setAttribute('aria-label', t('combatLog'));
    this.list = el('ol', 'log__list');
    this.root.append(el('h2', 'log__title', t('combatLog')), this.list);
  }

  add(event: LogInput): void {
    const entry = this.model.add(event);
    const row = this.renderRow(entry);
    this.list.prepend(row);
    while (this.list.children.length > this.model.entries.length) this.list.lastElementChild?.remove();
    replayAnimation(row, 'is-new');
  }

  clear(): void {
    this.model.clear();
    this.list.replaceChildren();
  }

  private renderRow(entry: CombatLogEntry): HTMLLIElement {
    const row = el('li', `log__row log__row--${entry.cause}`);
    row.dataset.kind = entry.kind;
    const word = el('span', 'log__word', entry.text);
    const tag = this.tag(entry);
    const points = el('span', 'log__points', `+${this.formatScore(entry.points)}`);
    row.append(el('span', 'log__marker'), word, tag, points);
    return row;
  }

  private tag(entry: CombatLogEntry): HTMLElement {
    switch (entry.cause) {
      case 'bomb':
        return el('span', 'log__tag log__tag--bomb', this.t('causeBomb'));
      case 'emp':
        return el('span', 'log__tag log__tag--emp', this.t('causeEmp'));
      case 'bonus':
        return el('span', 'log__tag log__tag--bonus', this.t('causeBonus'));
      case 'typed':
        return el('span', 'log__mult', `×${entry.multiplier}`);
    }
  }
}
