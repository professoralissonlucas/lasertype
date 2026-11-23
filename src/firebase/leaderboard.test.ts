import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { dayIndex, dayStart } from '../utils/day.ts';
import { memoryStore, type KeyValueStore } from '../utils/storage.ts';
import {
  boardAt,
  buildScore,
  dailyBoard,
  Leaderboard,
  MAX_POINTS_PER_SECOND,
  scoreDocId,
  scoreProblems,
  type BoardView,
  type LeaderboardBackend,
  type MatchResult,
  type Submitter,
} from './leaderboard.ts';
import { parseRow } from './rankRows.ts';
import type { Board, RankRow, ScoreFields } from './types.ts';

const MATCH: MatchResult = {
  mode: 'survival',
  difficulty: 'normal',
  lang: 'pt-BR',
  day: 0,
  score: 4321,
  wpm: 52.345,
  accuracy: 0.9567,
  elapsed: 95.4321,
};
const GOOGLE: Submitter = { uid: 'u1', google: true, name: 'PilotoAb12' };

const DAY = 20779;
/** Inside game day DAY. */
const DURING_DAY = dayStart(DAY) + 3_600_000;
const DAILY: MatchResult = { ...MATCH, mode: 'daily', day: DAY };

function fields(patch: Partial<ScoreFields> = {}): ScoreFields {
  const base = buildScore(MATCH, 'u1', 'PilotoAb12');
  if (!base) throw new Error('no score');
  return { ...base, ...patch };
}

describe('scoreDocId', () => {
  it('is `${uid}_${mode}_${diff}_${lang}_${day}`', () => {
    expect(scoreDocId('u1', { mode: 'survival', diff: 'easy', lang: 'pt-BR', day: 0 })).toBe('u1_survival_easy_pt-BR_0');
    expect(scoreDocId('u1', { mode: 'timeAttack', diff: 'hard', lang: 'en', day: 20779 })).toBe('u1_timeAttack_hard_en_20779');
  });
});

describe('buildScore', () => {
  it('builds the document the rules expect', () => {
    expect(buildScore(MATCH, 'u1', 'PilotoAb12')).toEqual({
      uid: 'u1',
      name: 'PilotoAb12',
      score: 4321,
      wpm: 52.3,
      accuracy: 95.7, // percent
      mode: 'survival',
      diff: 'normal',
      lang: 'pt-BR',
      duration: 95.43, // seconds
      day: 0,
    });
  });

  it('keeps the day of a Daily Challenge; the other modes always use 0', () => {
    expect(buildScore(DAILY, 'u1', 'PilotoAb12')).toMatchObject({ mode: 'daily', diff: 'normal', day: DAY });
    expect(buildScore({ ...MATCH, day: DAY }, 'u1', 'PilotoAb12')?.day).toBe(0);
  });

  it('Zen has no ranking', () => {
    expect(buildScore({ ...MATCH, mode: 'zen' }, 'u1', 'PilotoAb12')).toBeNull();
  });

  it('sends an integer score', () => {
    expect(Number.isInteger(buildScore({ ...MATCH, score: 10.6 }, 'u', 'Abc')?.score)).toBe(true);
  });
});

describe('scoreProblems (client copy of validScore)', () => {
  it('accepts a normal match', () => {
    expect(scoreProblems(fields())).toEqual([]);
  });

  it('rejects bad nicknames', () => {
    expect(scoreProblems(fields({ name: 'ab' }))).toContain('name');
    expect(scoreProblems(fields({ name: 'abcdefghijklm' }))).toContain('name');
    expect(scoreProblems(fields({ name: 'bad<name>' }))).toContain('name');
  });

  it('rejects WPM over 250 and accuracy outside 0–100', () => {
    expect(scoreProblems(fields({ wpm: 250 }))).toEqual([]);
    expect(scoreProblems(fields({ wpm: 250.1 }))).toContain('wpm');
    expect(scoreProblems(fields({ accuracy: 100.1 }))).toContain('accuracy');
  });

  it('needs 0 < duration ≤ 3600 (Time Attack ≤ 65)', () => {
    expect(scoreProblems(fields({ duration: 0 }))).toContain('duration');
    expect(scoreProblems(fields({ duration: 3600.5 }))).toContain('duration');
    expect(scoreProblems(fields({ mode: 'timeAttack', duration: 60 }))).toEqual([]);
    expect(scoreProblems(fields({ mode: 'timeAttack', duration: 65.5 }))).toContain('duration');
  });

  it('rejects more than maxPointsPerSecond × duration', () => {
    const duration = 10;
    expect(scoreProblems(fields({ duration, score: duration * MAX_POINTS_PER_SECOND }))).toEqual([]);
    expect(scoreProblems(fields({ duration, score: duration * MAX_POINTS_PER_SECOND + 1 }))).toContain('tooManyPoints');
  });

  it('rejects negative or fractional scores', () => {
    expect(scoreProblems(fields({ score: -1 }))).toContain('score');
    expect(scoreProblems(fields({ score: 1.5 }))).toContain('score');
  });
});

/** In-memory Firestore stand-in. */
class FakeBackend implements LeaderboardBackend {
  readonly docs = new Map<string, ScoreFields>();
  saves = 0;
  topCalls = 0;
  countCalls = 0;
  /** Answers to `top` wait for this. */
  gate: Promise<void> | null = null;
  fail = false;
  failCount = false;
  /** The rules refuse every write. */
  refuse = false;
  /** Doc ids asked for (bestScore / row). */
  readonly reads: string[] = [];

  async bestScore(id: string): Promise<number | null> {
    if (this.fail) throw new Error('offline');
    this.reads.push(id);
    return this.docs.get(id)?.score ?? null;
  }

  async save(id: string, data: ScoreFields): Promise<void> {
    if (this.fail) throw new Error('offline');
    if (this.refuse) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
    this.saves++;
    this.docs.set(id, data);
  }

  async top(board: Board, size: number): Promise<RankRow[]> {
    this.topCalls++;
    if (this.fail) throw new Error('offline');
    const rows = this.on(board)
      .sort((a, b) => b.score - a.score)
      .slice(0, size)
      .flatMap((doc) => parseRow(doc) ?? []);
    await this.gate;
    return rows;
  }

  async countAbove(board: Board, score: number): Promise<number> {
    this.countCalls++;
    if (this.fail || this.failCount) throw new Error('offline');
    return this.on(board).filter((d) => d.score > score).length;
  }

  private on(board: Board): ScoreFields[] {
    return [...this.docs.values()].filter(
      (d) => d.mode === board.mode && d.diff === board.diff && d.lang === board.lang && d.day === board.day,
    );
  }

  async row(id: string): Promise<RankRow | null> {
    this.reads.push(id);
    return parseRow(this.docs.get(id));
  }
}

function setup(now = 0, store: KeyValueStore | null = memoryStore()) {
  const backend = new FakeBackend();
  let time = now;
  /** Another tab, or the page reloaded: same storage and server. */
  const open = () => new Leaderboard(async () => backend, store, () => time);
  return { backend, board: open(), open, advance: (ms: number) => (time += ms) };
}

describe('Leaderboard.submit', () => {
  it('does nothing in an offline build', async () => {
    expect(await new Leaderboard(null).submit(MATCH, GOOGLE)).toEqual({ kind: 'unavailable' });
  });

  it('never sends Zen', async () => {
    const { board, backend } = setup();
    expect(await board.submit({ ...MATCH, mode: 'zen' }, GOOGLE)).toEqual({ kind: 'notRanked' });
    expect(backend.saves).toBe(0);
  });

  it('only Google accounts submit', async () => {
    const { board, backend } = setup();
    expect(await board.submit(MATCH, { ...GOOGLE, google: false })).toEqual({ kind: 'signIn' });
    expect(await board.submit(MATCH, null)).toEqual({ kind: 'signIn' });
    expect(backend.saves).toBe(0);
  });

  it('saves the first score under the rules id', async () => {
    const { board, backend } = setup();
    expect(await board.submit(MATCH, GOOGLE)).toEqual({ kind: 'record', previous: null, position: null });
    expect(backend.docs.get('u1_survival_normal_pt-BR_0')?.score).toBe(4321);
  });

  it('only sends when the record is beaten', async () => {
    const { board, backend } = setup();
    await board.submit(MATCH, GOOGLE);
    expect(await board.submit({ ...MATCH, score: 4321 }, GOOGLE)).toEqual({ kind: 'notRecord', best: 4321, position: null });
    expect(await board.submit({ ...MATCH, score: 100 }, GOOGLE)).toEqual({ kind: 'notRecord', best: 4321, position: null });
    expect(backend.saves).toBe(1);
    expect(await board.submit({ ...MATCH, score: 5000 }, GOOGLE)).toEqual({ kind: 'record', previous: 4321, position: null });
    expect(backend.saves).toBe(2);
  });

  it('keeps separate records per difficulty and language', async () => {
    const { board, backend } = setup();
    await board.submit(MATCH, GOOGLE);
    expect((await board.submit({ ...MATCH, difficulty: 'hard', score: 10 }, GOOGLE)).kind).toBe('record');
    expect((await board.submit({ ...MATCH, lang: 'en', score: 10 }, GOOGLE)).kind).toBe('record');
    expect(backend.docs.size).toBe(3);
  });

  it('does not send matches the rules would refuse', async () => {
    const { board, backend } = setup();
    const result = await board.submit({ ...MATCH, elapsed: 4000 }, GOOGLE);
    expect(result).toEqual({ kind: 'invalid', problems: ['duration'] });
    expect(backend.saves).toBe(0);
  });

  it('reports errors instead of throwing', async () => {
    const { board, backend } = setup();
    backend.fail = true;
    expect(await board.submit(MATCH, GOOGLE)).toEqual({ kind: 'error' });
    expect(await new Leaderboard(() => Promise.reject(new Error('no sdk'))).submit(MATCH, GOOGLE)).toEqual({ kind: 'error' });
  });
});

describe('Daily Challenge boards', () => {
  it('boardAt: today, always on Normal; the other modes keep the filters and day 0', () => {
    expect(boardAt('daily', 'hard', 'en', DURING_DAY)).toEqual({ mode: 'daily', diff: 'normal', lang: 'en', day: DAY });
    expect(boardAt('daily', 'hard', 'en', DURING_DAY)).toEqual(dailyBoard('en', dayIndex(DURING_DAY)));
    expect(boardAt('survival', 'hard', 'en', DURING_DAY)).toEqual({ mode: 'survival', diff: 'hard', lang: 'en', day: 0 });
  });

});

describe('Leaderboard.submit — Daily Challenge', () => {
  it('saves under the day the match started and tells the place today', async () => {
    const { board, backend } = setup(DURING_DAY);
    await board.submit({ ...DAILY, score: 9000 }, { ...GOOGLE, uid: 'u2' });
    await board.submit({ ...DAILY, score: 8000 }, { ...GOOGLE, uid: 'u3' });
    expect(await board.submit(DAILY, GOOGLE)).toEqual({ kind: 'record', previous: null, position: 3 });
    expect(backend.docs.get(`u1_daily_normal_pt-BR_${DAY}`)).toMatchObject({ mode: 'daily', diff: 'normal', day: DAY });
  });

  it('a worse attempt keeps the record and tells the place of the record', async () => {
    const { board } = setup(DURING_DAY);
    await board.submit({ ...DAILY, score: 9000 }, { ...GOOGLE, uid: 'u2' });
    await board.submit({ ...DAILY, score: 10_000 }, GOOGLE);
    expect(await board.submit({ ...DAILY, score: 50 }, GOOGLE)).toEqual({ kind: 'notRecord', best: 10_000, position: 1 });
  });

  it('each language is its own board', async () => {
    const { board } = setup(DURING_DAY);
    await board.submit({ ...DAILY, score: 9000 }, { ...GOOGLE, uid: 'u2' });
    expect(await board.submit({ ...DAILY, lang: 'en', score: 10 }, GOOGLE)).toMatchObject({ kind: 'record', position: 1 });
  });

  it('is not sent once its day is over, not even to the new day', async () => {
    const { board, backend, advance } = setup(DURING_DAY);
    advance(24 * 3_600_000);
    expect(await board.submit(DAILY, GOOGLE)).toEqual({ kind: 'dayOver' });
    // Nor does it ask for a sign-in that could no longer help.
    expect(await board.submit(DAILY, null)).toEqual({ kind: 'dayOver' });
    expect(backend.saves).toBe(0);
  });

  it('turns exactly at 03:00 UTC', async () => {
    const { board, advance } = setup(dayStart(DAY + 1) - 1);
    expect((await board.submit(DAILY, GOOGLE)).kind).toBe('record');
    advance(1);
    expect((await board.submit({ ...DAILY, score: 5000 }, GOOGLE)).kind).toBe('dayOver');
  });

  it('a write refused by the rules (wrong device date) is reported as such', async () => {
    const { board, backend } = setup(DURING_DAY);
    backend.refuse = true;
    expect(await board.submit(DAILY, GOOGLE)).toEqual({ kind: 'refused' });
    expect(await board.submit(MATCH, GOOGLE)).toEqual({ kind: 'error' }); // other modes: unchanged
  });

  it('an unknown place does not spoil the record', async () => {
    const { board, backend } = setup(DURING_DAY);
    backend.failCount = true;
    expect(await board.submit(DAILY, GOOGLE)).toEqual({ kind: 'record', previous: null, position: null });
  });
});

describe('Leaderboard.position', () => {
  it('is 1 + how many scored more, beyond the top 50 too', async () => {
    const { board, backend } = setup(DURING_DAY);
    for (let i = 0; i < 60; i++) {
      await board.submit({ ...DAILY, score: 10_000 + i }, { ...GOOGLE, uid: `p${i}` });
    }
    expect(backend.docs.size).toBe(60);
    expect(await board.position(dailyBoard('pt-BR', DAY), 4321)).toBe(61);
    expect(await board.position(dailyBoard('pt-BR', DAY), 10_059)).toBe(1);
  });

  it('is null in an offline build', async () => {
    expect(await new Leaderboard(null).position(dailyBoard('pt-BR', DAY), 1)).toBeNull();
  });
});

const BOARD: Board = { mode: 'survival', diff: 'normal', lang: 'pt-BR', day: 0 };
const CACHE_MS = CONFIG.ranking.cacheSeconds * 1000;
const REFRESH_MS = CONFIG.ranking.refreshSeconds * 1000;

/** Scores of other players (p0, p1…), already on the server. */
function fill(backend: FakeBackend, board: Board, scores: readonly number[]): void {
  scores.forEach((score, i) => {
    const uid = `p${i}`;
    const row: ScoreFields = { ...fields(), ...board, uid, name: `Piloto${i}`, score };
    backend.docs.set(scoreDocId(uid, board), row);
  });
}

/** 50 scores, from 10,000 up to 10,490: a full top. */
const FULL = Array.from({ length: 50 }, (_, i) => 10_000 + i * 10);

const uids = (view: BoardView) => view.rows.map((row) => row.uid);

describe('Leaderboard.view: boards are cached', () => {
  it('reads a board once and then serves it from the cache for 5 minutes', async () => {
    expect(CACHE_MS).toBe(300_000);
    const { board, backend, advance } = setup();
    fill(backend, BOARD, [100, 300, 200]);
    expect(uids(await board.view(BOARD, null))).toEqual(['p1', 'p2', 'p0']);
    advance(CACHE_MS - 1);
    await board.view(BOARD, null);
    expect(backend.topCalls).toBe(1);
    advance(1);
    await board.view(BOARD, null);
    expect(backend.topCalls).toBe(2);
  });

  it('the cache survives a reload and is shared with other tabs', async () => {
    const { board, backend, open, advance } = setup();
    fill(backend, BOARD, [100]);
    const first = await board.view(BOARD, null);
    advance(60_000);
    expect(await open().view(BOARD, null)).toEqual(first);
    expect(backend.topCalls).toBe(1);
  });

  it('does not even load Firebase for a cached board', async () => {
    const store = memoryStore();
    const { board, backend } = setup(0, store);
    fill(backend, BOARD, [100]);
    await board.view(BOARD, null);
    const offline = new Leaderboard(() => Promise.reject(new Error('no network')), store, () => 1000);
    expect(uids(await offline.view(BOARD, null))).toEqual(['p0']);
    await expect(offline.view({ ...BOARD, diff: 'hard' }, null)).rejects.toThrow();
  });

  it('each mode, difficulty, language and day is an entry of its own', async () => {
    const { board, backend } = setup();
    const boards: Board[] = [
      BOARD,
      { ...BOARD, mode: 'timeAttack' },
      { ...BOARD, diff: 'hard' },
      { ...BOARD, lang: 'en' },
      dailyBoard('pt-BR', DAY),
      dailyBoard('pt-BR', DAY + 1),
    ];
    for (const each of boards) await board.view(each, null);
    expect(backend.topCalls).toBe(boards.length);
    for (const each of boards) await board.view(each, null);
    expect(backend.topCalls).toBe(boards.length);
  });

  it('works for the session when the browser refuses storage', async () => {
    for (const store of [null, refusingStore()]) {
      const { board, backend, advance } = setup(0, store);
      await board.view(BOARD, null);
      advance(1000);
      await board.view(BOARD, null);
      expect(backend.topCalls).toBe(1);
      advance(CACHE_MS);
      await board.view(BOARD, null);
      expect(backend.topCalls).toBe(2);
    }
  });

  it('flipping tabs fast never starts the same read twice', async () => {
    const { board, backend } = setup(DURING_DAY);
    const daily = dailyBoard('pt-BR', DAY);
    fill(backend, daily, FULL);
    backend.docs.set(scoreDocId('u1', daily), { ...fields(), ...daily, score: 5 });
    const views = await Promise.all([board.view(daily, 'u1'), board.view(daily, 'u1'), board.view(daily, null)]);
    expect(views[0]).toEqual(views[1]);
    expect(backend.topCalls).toBe(1);
    expect(backend.reads).toHaveLength(1);
    expect(backend.countCalls).toBe(1);
  });

  it('throws when the ranking cannot be read (the screen shows the error) and tries again', async () => {
    const { board, backend } = setup();
    backend.fail = true;
    await expect(board.view(BOARD, null)).rejects.toThrow();
    backend.fail = false;
    expect(await board.view(BOARD, null)).toMatchObject({ rows: [] });
    expect(backend.topCalls).toBe(2);
  });

  it('is empty in an offline build', async () => {
    const offline = new Leaderboard(null);
    expect(offline.available).toBe(false);
    expect(await offline.view(BOARD, 'u1')).toMatchObject({ rows: [], own: null, ownPlace: null });
  });
});

describe('Leaderboard.view: the player outside the top', () => {
  it('reads their row once while the board is cached', async () => {
    const { board, backend, open, advance } = setup();
    fill(backend, BOARD, FULL);
    backend.docs.set(scoreDocId('u1', BOARD), fields({ score: 5 }));
    expect(await board.view(BOARD, 'u1')).toMatchObject({ own: { uid: 'u1', score: 5 }, ownPlace: null });
    advance(60_000);
    expect(await open().view(BOARD, 'u1')).toMatchObject({ own: { uid: 'u1', score: 5 } });
    expect(backend.reads).toEqual([scoreDocId('u1', BOARD)]);
    expect(backend.countCalls).toBe(0);
  });

  it('remembers that they are not on the board', async () => {
    const { board, backend } = setup();
    expect((await board.view(BOARD, 'u1')).own).toBeNull();
    expect((await board.view(BOARD, 'u1')).own).toBeNull();
    expect(backend.reads).toHaveLength(1);
  });

  it('Daily Challenge: the exact place is counted once too', async () => {
    const { board, backend } = setup(DURING_DAY);
    const daily = dailyBoard('pt-BR', DAY);
    fill(backend, daily, FULL);
    backend.docs.set(scoreDocId('u1', daily), { ...fields(), ...daily, score: 5 });
    for (let i = 0; i < 3; i++) expect(await board.view(daily, 'u1')).toMatchObject({ ownPlace: 51 });
    expect(backend.countCalls).toBe(1);
  });

  it('nothing to read for them when they are in the top, or not in the ranking', async () => {
    const { board, backend } = setup();
    fill(backend, BOARD, FULL);
    expect((await board.view(BOARD, 'p7')).own).toBeNull();
    expect((await board.view(BOARD, null)).own).toBeNull();
    expect(backend.reads).toHaveLength(0);
  });

  it('another account reuses the rows and reads only its own', async () => {
    const { board, backend } = setup();
    fill(backend, BOARD, FULL);
    await board.view(BOARD, 'u1');
    backend.docs.set(scoreDocId('u2', BOARD), fields({ uid: 'u2', score: 7 }));
    expect((await board.view(BOARD, 'u2')).own).toMatchObject({ uid: 'u2', score: 7 });
    expect(backend.topCalls).toBe(1);
    expect(backend.reads).toEqual([scoreDocId('u1', BOARD), scoreDocId('u2', BOARD)]);
  });

  it('the bonus always asks the server (own / position are not cached)', async () => {
    const { board, backend } = setup(DURING_DAY);
    const daily = dailyBoard('pt-BR', DAY);
    fill(backend, daily, FULL);
    await board.view(daily, 'u1');
    await board.own(daily, 'u1');
    await board.own(daily, 'u1');
    await board.position(daily, 5);
    expect(backend.reads).toHaveLength(3);
    expect(backend.countCalls).toBe(1);
    await board.submit(DAILY, GOOGLE);
    expect(await board.own(daily, 'u1')).toMatchObject({ uid: 'u1', score: 4321 });
    expect(await board.own(daily, 'nobody')).toBeNull();
  });
});

describe('Leaderboard.view: "Atualizar"', () => {
  it('reads the board again, at most once every 30 s', async () => {
    const { board, backend, advance } = setup();
    fill(backend, BOARD, [100]);
    await board.view(BOARD, null);
    advance(REFRESH_MS);
    expect(board.refreshWait(BOARD)).toBe(0);
    fill(backend, BOARD, [100, 200]);
    expect(uids(await board.view(BOARD, null, true))).toEqual(['p1', 'p0']);
    expect(backend.topCalls).toBe(2);

    expect(board.refreshWait(BOARD)).toBe(REFRESH_MS);
    await board.view(BOARD, null, true);
    advance(REFRESH_MS - 1);
    expect(board.refreshWait(BOARD)).toBe(1);
    await board.view(BOARD, null, true);
    expect(backend.topCalls).toBe(2);

    advance(1);
    await board.view(BOARD, null, true);
    expect(backend.topCalls).toBe(3);
  });

  it('waits on rows just read, too', async () => {
    const { board, backend, advance } = setup();
    await board.view(BOARD, null);
    advance(5000);
    expect(board.refreshWait(BOARD)).toBe(REFRESH_MS - 5000);
    await board.view(BOARD, null, true);
    expect(backend.topCalls).toBe(1);
  });

  it('the limit holds for every board, and after a reload', async () => {
    const { board, backend, open, advance } = setup();
    const other: Board = { ...BOARD, diff: 'hard' };
    await board.view(BOARD, null);
    await board.view(other, null);
    advance(REFRESH_MS);
    await board.view(BOARD, null, true);
    expect(backend.topCalls).toBe(3);
    expect(board.refreshWait(other)).toBe(REFRESH_MS);
    await open().view(other, null, true);
    expect(backend.topCalls).toBe(3);
  });

  it('reads the player outside the top again as well', async () => {
    const { board, backend, advance } = setup();
    fill(backend, BOARD, FULL);
    await board.view(BOARD, 'u1');
    advance(REFRESH_MS);
    backend.docs.set(scoreDocId('u1', BOARD), fields({ score: 5 }));
    expect((await board.view(BOARD, 'u1', true)).own).toMatchObject({ score: 5 });
  });

  it('when it fails the cached rows stay good', async () => {
    const { board, backend, advance } = setup();
    fill(backend, BOARD, [100]);
    await board.view(BOARD, null);
    advance(REFRESH_MS);
    backend.fail = true;
    await expect(board.view(BOARD, null, true)).rejects.toThrow();
    expect(uids(await board.view(BOARD, null))).toEqual(['p0']);
  });
});

describe('Leaderboard: a new record in the cache', () => {
  it('changes only the player’s own row, without reading the top again', async () => {
    const { board, backend, advance } = setup();
    fill(backend, BOARD, [9000, 100]);
    const before = await board.view(BOARD, 'u1');
    advance(60_000);
    // Someone else improved meanwhile: that is for the next read.
    fill(backend, BOARD, [9000, 8000]);
    await board.submit(MATCH, GOOGLE);
    const after = await board.view(BOARD, 'u1');
    expect(after.rows.map(({ uid, score }) => [uid, score])).toEqual([
      ['p0', 9000],
      ['u1', 4321],
      ['p1', 100],
    ]);
    expect(after.rows[1]).toEqual({ uid: 'u1', name: 'PilotoAb12', score: 4321, wpm: 52.3, accuracy: 95.7 });
    expect(after.own).toBeNull();
    expect(backend.topCalls).toBe(1);

    // It does not make the other rows any newer: the board expires when it would have.
    expect(after.at).toBe(before.at);
    advance(CACHE_MS - 60_000 - 1);
    await board.view(BOARD, 'u1');
    expect(backend.topCalls).toBe(1);
    advance(1);
    expect(uids(await board.view(BOARD, 'u1'))).toEqual(['p0', 'p1', 'u1']);
    expect(backend.topCalls).toBe(2);
  });

  it('moves the row up when the player was already there', async () => {
    const { board, backend } = setup();
    fill(backend, BOARD, [3000, 2000, 1000]);
    await board.view(BOARD, 'p2');
    await board.submit({ ...MATCH, score: 2500 }, { ...GOOGLE, uid: 'p2' });
    expect(uids(await board.view(BOARD, 'p2'))).toEqual(['p0', 'p2', 'p1']);
    expect(backend.topCalls).toBe(1);
  });

  it('entering a full top drops the last row; not entering it shows below the table', async () => {
    const { board, backend } = setup();
    fill(backend, BOARD, FULL);
    await board.view(BOARD, 'u1');
    await board.submit({ ...MATCH, score: 20 }, GOOGLE);
    const outside = await board.view(BOARD, 'u1');
    expect(outside.rows).toHaveLength(50);
    expect(uids(outside)).not.toContain('u1');
    expect(outside).toMatchObject({ own: { uid: 'u1', score: 20 }, ownPlace: null });

    await board.submit({ ...MATCH, score: 10_015 }, GOOGLE);
    const inside = await board.view(BOARD, 'u1');
    expect(inside.rows).toHaveLength(50);
    expect(inside.rows[48]?.uid).toBe('u1');
    expect(uids(inside)).not.toContain('p0');
    expect(inside.own).toBeNull();
    expect(backend.topCalls).toBe(1);
    // Two submissions + the first look outside the top: nothing else was read.
    expect(backend.reads).toHaveLength(3);
  });

  it('Daily Challenge outside the top: the place counted by the submission is reused', async () => {
    const { board, backend } = setup(DURING_DAY);
    const daily = dailyBoard('pt-BR', DAY);
    fill(backend, daily, FULL);
    await board.view(daily, 'u1');
    expect(await board.submit({ ...DAILY, score: 20 }, GOOGLE)).toMatchObject({ kind: 'record', position: 51 });
    expect(await board.view(daily, 'u1')).toMatchObject({ own: { score: 20 }, ownPlace: 51 });
    expect(backend.topCalls).toBe(1);
    expect(backend.countCalls).toBe(1);
  });

  it('a place that could not be counted is asked for again', async () => {
    const { board, backend } = setup(DURING_DAY);
    const daily = dailyBoard('pt-BR', DAY);
    fill(backend, daily, FULL);
    await board.view(daily, 'u1');
    backend.failCount = true;
    await board.submit({ ...DAILY, score: 20 }, GOOGLE);
    backend.failCount = false;
    expect(await board.view(daily, 'u1')).toMatchObject({ own: { score: 20 }, ownPlace: 51 });
  });

  it('other boards, worse scores and refused writes leave the cache alone', async () => {
    const { board, backend } = setup(DURING_DAY);
    fill(backend, BOARD, [9000]);
    await board.submit(MATCH, GOOGLE);
    const before = await board.view(BOARD, 'u1');
    await board.submit({ ...MATCH, score: 10 }, GOOGLE);
    await board.submit({ ...MATCH, difficulty: 'hard', score: 9999 }, GOOGLE);
    backend.refuse = true;
    await board.submit({ ...MATCH, score: 9999 }, GOOGLE);
    expect(await board.view(BOARD, 'u1')).toEqual(before);
  });

  it('a board not in the cache is simply read when it is opened', async () => {
    const { board, backend } = setup();
    await board.submit(MATCH, GOOGLE);
    expect(backend.topCalls).toBe(0);
    expect(uids(await board.view(BOARD, 'u1'))).toEqual(['u1']);
    expect(backend.topCalls).toBe(1);
  });

  it('is not lost when the board was being read as it was sent', async () => {
    const { board, backend } = setup();
    fill(backend, BOARD, [9000, 100]);
    let answer = (): void => undefined;
    backend.gate = new Promise((resolve) => (answer = resolve));
    const reading = board.view(BOARD, 'u1'); // the server already picked the rows…
    await Promise.resolve();
    await board.submit(MATCH, GOOGLE);
    answer(); // …and they arrive after the record was accepted
    expect(uids(await reading)).toEqual(['p0', 'u1', 'p1']);
    expect(uids(await board.view(BOARD, 'u1'))).toEqual(['p0', 'u1', 'p1']);
    expect(backend.topCalls).toBe(1);
  });
});

/** A browser that lets pages read storage but not write it (full or blocked). */
function refusingStore(): KeyValueStore {
  return {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
}
