// Global ranking (firestore.rules is the contract):
// - one document per player/mode/difficulty/language/day:
//     scores/{uid}_{mode}_{diff}_{lang}_{day}   (day = dayIndex() in the daily mode, 0 otherwise)
// - only Google-linked accounts submit; Zen never does;
// - a match is sent only when it beats the player's record on that board;
// - a Daily Challenge result belongs to the day the match started: once that day is over it
//   is not sent (the rules only accept the current day, and the next day's board is another game);
// - createdAt = serverTimestamp(); duration in seconds (pauses excluded).
// The client checks the same limits as the rules first, so it never sends a doomed write.
// Boards are cached (rankingCache.ts): the screen reads them again only when they expire or the
// player asks, and a new record only changes the player's own row in the cache.
import { CONFIG } from '../config.ts';
import { maxPointsPerSecond } from '../game/scoring.ts';
import type { GameDifficulty } from '../game/types.ts';
import { MODES } from '../modes/index.ts';
import type { ModeId } from '../modes/types.ts';
import { isValidNickname } from '../profile/nickname.ts';
import { dayIndex } from '../utils/day.ts';
import type { KeyValueStore } from '../utils/storage.ts';
import { longestWordLength } from '../words/index.ts';
import type { Language } from '../words/types.ts';
import type { FirebaseSdk } from './app.ts';
import { errorCode } from './auth.ts';
import { RankingCache, type CachedBoard, type OwnStanding } from './rankingCache.ts';
import { parseRow, withRecord } from './rankRows.ts';
import { RANKED_MODES, type Board, type RankedMode, type RankingConfig, type RankRow, type ScoreFields } from './types.ts';

export const SCORES = 'scores';

/** The rules' maxPointsPerSecond (rules.test.ts checks that firestore.rules says the same). */
export const MAX_POINTS_PER_SECOND = Math.ceil(maxPointsPerSecond(longestWordLength()));

export function isRankedMode(mode: ModeId): mode is RankedMode {
  return (RANKED_MODES as readonly string[]).includes(mode);
}

/** The board of one Daily Challenge. */
export function dailyBoard(lang: Language, day: number): Board {
  return { mode: 'daily', diff: MODES.daily.fixedDifficulty ?? 'normal', lang, day };
}

/** The board to show now: the daily mode has only today's, on its fixed difficulty. */
export function boardAt(mode: RankedMode, diff: GameDifficulty, lang: Language, epochMs: number): Board {
  return mode === 'daily' ? dailyBoard(lang, dayIndex(epochMs)) : { mode, diff, lang, day: 0 };
}

/** `${uid}_${mode}_${diff}_${lang}_${day}` */
export function scoreDocId(uid: string, board: Board): string {
  return `${uid}_${board.mode}_${board.diff}_${board.lang}_${board.day}`;
}

/** What a finished match contributes (from the Mission Report + the match language). */
export interface MatchResult {
  readonly mode: ModeId;
  readonly difficulty: GameDifficulty;
  readonly lang: Language;
  /** Game day the match started (Daily Challenge), 0 in the other modes. */
  readonly day: number;
  readonly score: number;
  readonly wpm: number;
  /** 0..1 */
  readonly accuracy: number;
  /** Seconds played, pauses excluded. */
  readonly elapsed: number;
}

const round = (value: number, decimals: number): number => {
  const k = 10 ** decimals;
  return Math.round(value * k) / k;
};

/** The score document of a match, or null for modes without a ranking (Zen). */
export function buildScore(match: MatchResult, uid: string, name: string): ScoreFields | null {
  if (!isRankedMode(match.mode)) return null;
  return {
    uid,
    name,
    score: Math.round(match.score),
    wpm: round(match.wpm, 1),
    accuracy: round(match.accuracy * 100, 1),
    mode: match.mode,
    diff: match.difficulty,
    lang: match.lang,
    duration: round(match.elapsed, 2),
    day: match.mode === 'daily' ? match.day : 0,
  };
}

export type ScoreProblem = 'name' | 'score' | 'wpm' | 'accuracy' | 'duration' | 'tooManyPoints';

/** What the rules (validScore) would reject, checked on the client first. */
export function scoreProblems(
  fields: ScoreFields,
  config: RankingConfig = CONFIG.ranking,
  maxPps: number = MAX_POINTS_PER_SECOND,
): ScoreProblem[] {
  const problems: ScoreProblem[] = [];
  if (!isValidNickname(fields.name, config)) problems.push('name');
  if (!Number.isInteger(fields.score) || fields.score < 0) problems.push('score');
  if (!Number.isFinite(fields.wpm) || fields.wpm < 0 || fields.wpm > config.maxWpm) problems.push('wpm');
  if (!Number.isFinite(fields.accuracy) || fields.accuracy < 0 || fields.accuracy > 100) problems.push('accuracy');
  const maxDuration = fields.mode === 'timeAttack' ? config.timeAttackMaxDuration : config.maxDuration;
  if (!(fields.duration > 0) || fields.duration > maxDuration) problems.push('duration');
  else if (fields.score > fields.duration * maxPps) problems.push('tooManyPoints');
  return problems;
}

/** What Leaderboard needs from Firestore (lets tests use a fake). */
export interface LeaderboardBackend {
  /** Score currently saved under `id`, or null. */
  bestScore(id: string): Promise<number | null>;
  /** Writes the document with createdAt = serverTimestamp(). */
  save(id: string, fields: ScoreFields): Promise<void>;
  /** Best `size` rows of a board, best first. */
  top(board: Board, size: number): Promise<RankRow[]>;
  /** How many players scored more than `score` on a board (one aggregate read). */
  countAbove(board: Board, score: number): Promise<number>;
  row(id: string): Promise<RankRow | null>;
}

export function firestoreLeaderboardBackend(sdk: FirebaseSdk): LeaderboardBackend {
  const { db, dbApi } = sdk;
  const scores = dbApi.collection(db, SCORES);
  const onBoard = (board: Board) => [
    dbApi.where('mode', '==', board.mode),
    dbApi.where('diff', '==', board.diff),
    dbApi.where('lang', '==', board.lang),
    dbApi.where('day', '==', board.day),
  ];
  return {
    bestScore: async (id) => {
      const snap = await dbApi.getDoc(dbApi.doc(scores, id));
      const score: unknown = snap.data()?.score;
      return typeof score === 'number' ? score : null;
    },
    save: async (id, fields) => {
      await dbApi.setDoc(dbApi.doc(scores, id), { ...fields, createdAt: dbApi.serverTimestamp() });
    },
    // Needs the composite index scores: mode ↑, diff ↑, lang ↑, day ↑, score ↓.
    top: async (board, size) => {
      const q = dbApi.query(scores, ...onBoard(board), dbApi.orderBy('score', 'desc'), dbApi.limit(size));
      const snap = await dbApi.getDocs(q);
      return snap.docs.flatMap((docSnap) => {
        const row = parseRow(docSnap.data());
        return row ? [row] : [];
      });
    },
    // Same index: the explicit order keeps the count on `score ↓`.
    countAbove: async (board, score) => {
      const q = dbApi.query(scores, ...onBoard(board), dbApi.where('score', '>', score), dbApi.orderBy('score', 'desc'));
      return (await dbApi.getCount(q)).data().count;
    },
    row: async (id) => parseRow((await dbApi.getDoc(dbApi.doc(scores, id))).data()),
  };
}

export type SubmitResult =
  /** No Firebase config: nothing to say. */
  | { readonly kind: 'unavailable' }
  /** Zen (or another mode without a ranking). */
  | { readonly kind: 'notRanked' }
  /** Not a Google account: only Google accounts enter the ranking. */
  | { readonly kind: 'signIn' }
  /** Outside the rules' limits (e.g. Survival over an hour). */
  | { readonly kind: 'invalid'; readonly problems: readonly ScoreProblem[] }
  /** Daily Challenge: its day ended before the result was sent. */
  | { readonly kind: 'dayOver' }
  /** Daily Challenge: the server refused the write (this device's date is not the server's). */
  | { readonly kind: 'refused' }
  /** `position`: the player's place today (Daily Challenge); null in other modes or when unknown. */
  | { readonly kind: 'notRecord'; readonly best: number; readonly position: number | null }
  | { readonly kind: 'record'; readonly previous: number | null; readonly position: number | null }
  | { readonly kind: 'error' };

export interface Submitter {
  readonly uid: string;
  readonly google: boolean;
  readonly name: string;
}

/** A board as the ranking screen shows it. */
export interface BoardView {
  /** When the rows were read (epoch ms). */
  readonly at: number;
  /** Best first, up to the top size. */
  readonly rows: readonly RankRow[];
  /** The player's own row when outside `rows`; null without a score on this board. */
  readonly own: RankRow | null;
  /** Its exact place, only in the Daily Challenge (it decides the bonus). */
  readonly ownPlace: number | null;
}

/** Starts `task`, or joins the one already running under `key`. */
function shared<T>(running: Map<string, Promise<T>>, key: string, task: () => Promise<T>): Promise<T> {
  let run = running.get(key);
  if (!run) {
    run = task().finally(() => running.delete(key));
    running.set(key, run);
  }
  return run;
}

export class Leaderboard {
  private readonly load: (() => Promise<LeaderboardBackend>) | null;
  private readonly now: () => number;
  private readonly cache: RankingCache;
  /** Reads on their way, so that flipping tabs fast never starts the same one twice. */
  private readonly readingRows = new Map<string, Promise<CachedBoard>>();
  private readonly readingView = new Map<string, Promise<BoardView>>();
  /** Records sent this session: rows that were being read meanwhile may still bring the old one. */
  private readonly sent = new Map<string, RankRow>();

  /** `load` = null for an offline build (no Firebase config); `store` keeps the boards read. */
  constructor(
    load: (() => Promise<LeaderboardBackend>) | null,
    store: KeyValueStore | null = null,
    now: () => number = Date.now,
  ) {
    this.load = load;
    this.now = now;
    this.cache = new RankingCache(store, now);
  }

  get available(): boolean {
    return this.load !== null;
  }

  /** Sends the match when it is a new record for this player. Never throws. */
  async submit(match: MatchResult, who: Submitter | null): Promise<SubmitResult> {
    if (!this.load) return { kind: 'unavailable' };
    if (!isRankedMode(match.mode)) return { kind: 'notRanked' };
    if (match.mode === 'daily' && match.day !== dayIndex(this.now())) return { kind: 'dayOver' };
    if (!who?.google) return { kind: 'signIn' };
    const fields = buildScore(match, who.uid, who.name);
    if (!fields) return { kind: 'notRanked' };
    const problems = scoreProblems(fields);
    if (problems.length > 0) return { kind: 'invalid', problems };

    try {
      const backend = await this.load();
      const id = scoreDocId(who.uid, fields);
      const previous = await backend.bestScore(id);
      if (previous !== null && fields.score <= previous) {
        return { kind: 'notRecord', best: previous, position: await placeToday(backend, fields, previous) };
      }
      try {
        await backend.save(id, fields);
      } catch (error) {
        // The read above worked, so this is the rules' answer to the day (d.day == dayIndex()).
        if (fields.mode === 'daily' && errorCode(error) === 'permission-denied') return { kind: 'refused' };
        throw error;
      }
      const position = await placeToday(backend, fields, fields.score);
      this.cacheRecord(fields, position);
      return { kind: 'record', previous, position };
    } catch {
      return { kind: 'error' };
    }
  }

  /**
   * What the ranking screen shows for a player (`uid` null = not in the ranking): from the cache
   * while it is good, else from the server. `refresh` ("Atualizar") reads it again, unless it is
   * too soon (`refreshWait`). Throws when offline or refused: the screen shows the error.
   */
  async view(board: Board, uid: string | null, refresh = false): Promise<BoardView> {
    const load = this.load;
    if (!load) return { at: this.now(), rows: [], own: null, ownPlace: null };
    const again = refresh && this.refreshWait(board) === 0;
    if (again) this.cache.markRefresh();
    return shared(this.readingView, `${boardKey(board)}|${uid ?? ''}|${again}`, async () => {
      const { at, rows, own: cached } = await this.rowsOf(load, board, again);
      if (uid === null || rows.some((row) => row.uid === uid)) return { at, rows, own: null, ownPlace: null };
      const own = cached?.uid === uid ? cached : await this.readOwn(board, uid);
      return { at, rows, own: own.row, ownPlace: own.place };
    });
  }

  /** Milliseconds until "Atualizar" can be used on a board (0 = now). */
  refreshWait(board: Board): number {
    return this.cache.refreshWait(boardKey(board));
  }

  private async rowsOf(load: () => Promise<LeaderboardBackend>, board: Board, again: boolean): Promise<CachedBoard> {
    const key = boardKey(board);
    const cached = again ? null : this.cache.get(key);
    if (cached) return cached;
    return shared(this.readingRows, key, async () => {
      const { topSize } = CONFIG.ranking;
      const backend = await load();
      const read = await backend.top(board, topSize);
      const record = this.sent.get(key);
      const rows = record ? withRecord(read, record, topSize) : read;
      const entry: CachedBoard = { at: this.now(), rows, own: null };
      this.cache.put(key, entry);
      return entry;
    });
  }

  /** A player outside the rows: their score and, in the Daily Challenge, its exact place. */
  private async readOwn(board: Board, uid: string): Promise<OwnStanding> {
    const row = await this.own(board, uid);
    const place = row && board.mode === 'daily' ? await this.position(board, row.score) : null;
    const own: OwnStanding = { uid, row, place };
    this.cache.update(boardKey(board), (entry) => ({ ...entry, own }));
    return own;
  }

  /** A record was accepted: only the player's own row changes in the cache, nothing is read again. */
  private cacheRecord(fields: ScoreFields, place: number | null): void {
    const key = boardKey(fields);
    const { uid, name, score, wpm, accuracy } = fields;
    const row: RankRow = { uid, name, score, wpm, accuracy };
    this.sent.set(key, row);
    this.cache.update(key, (entry) => {
      const rows = withRecord(entry.rows, row, CONFIG.ranking.topSize);
      const inTop = rows.some((other) => other.uid === uid);
      // Outside the top, a Daily Challenge place that could not be counted is asked for again.
      const unknown = fields.mode === 'daily' && place === null;
      return { ...entry, rows, own: inTop || unknown ? null : { uid, row, place } };
    });
  }

  /** The player's own row on a board, straight from the server. */
  async own(board: Board, uid: string): Promise<RankRow | null> {
    if (!this.load) return null;
    const backend = await this.load();
    return backend.row(scoreDocId(uid, board));
  }

  /** The place of `score` on a board (1 + how many scored more), straight from the server; null offline. */
  async position(board: Board, score: number): Promise<number | null> {
    if (!this.load) return null;
    const backend = await this.load();
    return 1 + (await backend.countAbove(board, score));
  }
}

/** The place to show after a Daily Challenge (the submission itself already succeeded). */
async function placeToday(backend: LeaderboardBackend, board: Board, score: number): Promise<number | null> {
  if (board.mode !== 'daily') return null;
  try {
    return 1 + (await backend.countAbove(board, score));
  } catch {
    return null;
  }
}

function boardKey(board: Board): string {
  return `${board.mode}_${board.diff}_${board.lang}_${board.day}`;
}
