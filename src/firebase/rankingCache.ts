// The boards of the ranking kept in localStorage, so that flipping tabs, coming back from a match
// or reloading the page does not read them from Firestore again: one entry per board (mode,
// difficulty, language and day), good for `cacheSeconds`. Also remembers when the player last
// pressed "Atualizar" (at most once every `refreshSeconds`). Tolerant: anything invalid, or from
// another clock, is as if it were not there.
import { CONFIG } from '../config.ts';
import { loadJson, saveJson, type KeyValueStore } from '../utils/storage.ts';
import { parseRow } from './rankRows.ts';
import type { RankingConfig, RankRow } from './types.ts';

/** Bump the version when the shape changes incompatibly. */
export const RANKING_CACHE_KEY = 'lasertype.ranking.v1';

/** A player who is not among the rows of a board. */
export interface OwnStanding {
  readonly uid: string;
  /** Their score on this board, null without one. */
  readonly row: RankRow | null;
  /** Its exact place (Daily Challenge only: it decides the bonus). */
  readonly place: number | null;
}

/** A board as last read. */
export interface CachedBoard {
  /** When the rows were read (epoch ms). A new record of the player does not renew it. */
  readonly at: number;
  readonly rows: readonly RankRow[];
  /** Read only when a player outside the rows looked at the board. */
  readonly own: OwnStanding | null;
}

interface CacheData {
  /** Last time "Atualizar" was used (epoch ms). */
  readonly refreshedAt: number;
  readonly boards: Readonly<Record<string, CachedBoard>>;
}

type CacheConfig = Pick<RankingConfig, 'cacheSeconds' | 'refreshSeconds'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseOwn(raw: unknown): OwnStanding | null {
  if (!isRecord(raw) || typeof raw.uid !== 'string') return null;
  return { uid: raw.uid, row: parseRow(raw.row), place: typeof raw.place === 'number' ? raw.place : null };
}

function parseBoard(raw: unknown): CachedBoard | null {
  if (!isRecord(raw) || typeof raw.at !== 'number' || !Array.isArray(raw.rows)) return null;
  const rows = raw.rows.flatMap((row: unknown) => parseRow(row) ?? []);
  return { at: raw.at, rows, own: parseOwn(raw.own) };
}

export class RankingCache {
  private readonly store: KeyValueStore | null;
  private readonly now: () => number;
  private readonly config: CacheConfig;
  /** Used instead of the store while it refuses to save (blocked or full): lasts for the session. */
  private unsaved: CacheData | null = null;

  constructor(store: KeyValueStore | null, now: () => number, config: CacheConfig = CONFIG.ranking) {
    this.store = store;
    this.now = now;
    this.config = config;
  }

  /** A board still good to show, or null. */
  get(key: string): CachedBoard | null {
    return this.read().boards[key] ?? null;
  }

  put(key: string, board: CachedBoard): void {
    const data = this.read();
    this.write({ ...data, boards: { ...data.boards, [key]: board } });
  }

  /** Changes a board still good to show; nothing to do for the others (they will be read again). */
  update(key: string, change: (board: CachedBoard) => CachedBoard): void {
    const board = this.get(key);
    if (board) this.put(key, change(board));
  }

  /** "Atualizar" was used now. */
  markRefresh(): void {
    this.write({ ...this.read(), refreshedAt: this.now() });
  }

  /** Milliseconds until "Atualizar" can be used on a board (0 = now): not again so soon, nor on rows just read. */
  refreshWait(key: string): number {
    const data = this.read();
    const limit = this.config.refreshSeconds * 1000;
    const left = (since: number | undefined) => (this.isRecent(since, limit) ? since + limit - this.now() : 0);
    return Math.max(left(data.refreshedAt), left(data.boards[key]?.at));
  }

  private isRecent(since: number | undefined, limit: number): since is number {
    if (since === undefined) return false;
    const age = this.now() - since;
    return age >= 0 && age < limit;
  }

  /** What is stored (other tabs write it too), without the boards that expired. */
  private read(): CacheData {
    const raw: unknown = this.unsaved ?? loadJson(this.store, RANKING_CACHE_KEY);
    const data = isRecord(raw) ? raw : {};
    const boards: Record<string, CachedBoard> = {};
    if (isRecord(data.boards)) {
      for (const [key, value] of Object.entries(data.boards)) {
        const board = parseBoard(value);
        if (board && this.isRecent(board.at, this.config.cacheSeconds * 1000)) boards[key] = board;
      }
    }
    return { refreshedAt: typeof data.refreshedAt === 'number' ? data.refreshedAt : 0, boards };
  }

  private write(data: CacheData): void {
    this.unsaved = saveJson(this.store, RANKING_CACHE_KEY, data) ? null : data;
  }
}
