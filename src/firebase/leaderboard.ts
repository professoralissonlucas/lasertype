// Global ranking (firestore.rules is the contract):
// - one document per player/mode/difficulty/language/day:
//     scores/{uid}_{mode}_{diff}_{lang}_{day}   (day = dayIndex() in the daily mode, 0 otherwise)
// - only Google-linked accounts submit; Zen never does;
// - a match is sent only when it beats the player's record on that board;
// - a Daily Challenge result belongs to the day the match started: once that day is over it
//   is not sent (the rules only accept the current day, and the next day's board is another game);
// - createdAt = serverTimestamp(); duration in seconds (pauses excluded).
// The client checks the same limits as the rules first, so it never sends a doomed write.
import { CONFIG } from '../config.ts';
import { maxPointsPerSecond } from '../game/scoring.ts';
import type { GameDifficulty } from '../game/types.ts';
import { MODES } from '../modes/index.ts';
import type { ModeId } from '../modes/types.ts';
import { isValidNickname } from '../profile/nickname.ts';
import { dayIndex } from '../utils/day.ts';
import { longestWordLength } from '../words/index.ts';
import type { Language } from '../words/types.ts';
import type { FirebaseSdk } from './app.ts';
import { errorCode } from './auth.ts';
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

/** Places of rows sorted best first: 1 + how many scored more (ties share a place). */
export function placesOf(rows: readonly { readonly score: number }[]): number[] {
  return rows.map((row) => 1 + rows.findIndex((other) => other.score === row.score));
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

/** Firestore data → a row, or null when the document is malformed (it is untrusted input). */
export function parseRow(data: unknown): RankRow | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const { uid, name, score, wpm, accuracy } = d;
  if (typeof uid !== 'string' || typeof name !== 'string' || typeof score !== 'number') return null;
  return {
    uid,
    name,
    score,
    wpm: typeof wpm === 'number' ? wpm : 0,
    accuracy: typeof accuracy === 'number' ? accuracy : 0,
  };
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

/** Rows are cached this long per board (fewer reads when flipping tabs). */
const CACHE_MS = 30_000;

export class Leaderboard {
  private readonly load: (() => Promise<LeaderboardBackend>) | null;
  private readonly now: () => number;
  private readonly cache = new Map<string, { readonly at: number; readonly rows: readonly RankRow[] }>();

  /** `load` = null for an offline build (no Firebase config). */
  constructor(load: (() => Promise<LeaderboardBackend>) | null, now: () => number = Date.now) {
    this.load = load;
    this.now = now;
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
      this.cache.delete(boardKey(fields));
      return { kind: 'record', previous, position: await placeToday(backend, fields, fields.score) };
    } catch {
      return { kind: 'error' };
    }
  }

  /** Best rows of a board (throws when offline or refused: the screen shows the error). */
  async top(board: Board): Promise<readonly RankRow[]> {
    if (!this.load) return [];
    const key = boardKey(board);
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.at < CACHE_MS) return cached.rows;
    const backend = await this.load();
    const rows = await backend.top(board, CONFIG.ranking.topSize);
    this.cache.set(key, { at: this.now(), rows });
    return rows;
  }

  /** The player's own row on a board (for when they are outside the top). */
  async own(board: Board, uid: string): Promise<RankRow | null> {
    if (!this.load) return null;
    const backend = await this.load();
    return backend.row(scoreDocId(uid, board));
  }

  /** The place of `score` on a board: 1 + how many scored more. null in an offline build. */
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
