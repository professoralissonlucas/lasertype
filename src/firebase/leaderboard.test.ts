import { describe, expect, it } from 'vitest';
import { dayIndex, dayStart } from '../utils/day.ts';
import {
  boardAt,
  buildScore,
  dailyBoard,
  Leaderboard,
  MAX_POINTS_PER_SECOND,
  parseRow,
  placesOf,
  scoreDocId,
  scoreProblems,
  type LeaderboardBackend,
  type MatchResult,
  type Submitter,
} from './leaderboard.ts';
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

describe('parseRow', () => {
  it('reads valid rows and drops malformed ones', () => {
    expect(parseRow({ uid: 'a', name: 'Abc', score: 10, wpm: 30, accuracy: 90, extra: 1 })).toEqual({
      uid: 'a',
      name: 'Abc',
      score: 10,
      wpm: 30,
      accuracy: 90,
    });
    expect(parseRow({ uid: 'a', name: 'Abc', score: '10' })).toBeNull();
    expect(parseRow(undefined)).toBeNull();
    expect(parseRow({ uid: 'a', name: 'Abc', score: 5 })).toMatchObject({ wpm: 0, accuracy: 0 });
  });
});

/** In-memory Firestore stand-in. */
class FakeBackend implements LeaderboardBackend {
  readonly docs = new Map<string, ScoreFields>();
  saves = 0;
  topCalls = 0;
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
    return this.on(board)
      .sort((a, b) => b.score - a.score)
      .slice(0, size);
  }

  async countAbove(board: Board, score: number): Promise<number> {
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
    return this.docs.get(id) ?? null;
  }
}

function setup(now = 0) {
  const backend = new FakeBackend();
  let time = now;
  const board = new Leaderboard(async () => backend, () => time);
  return { backend, board, advance: (ms: number) => (time += ms) };
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

  it('placesOf: ties share a place and the next one skips', () => {
    expect(placesOf([{ score: 90 }, { score: 70 }, { score: 70 }, { score: 10 }])).toEqual([1, 2, 2, 4]);
    expect(placesOf([])).toEqual([]);
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

describe('Leaderboard.top / own', () => {
  const BOARD: Board = { mode: 'survival', diff: 'normal', lang: 'pt-BR', day: 0 };

  it('lists the best rows and caches them briefly', async () => {
    const { board, backend, advance } = setup();
    await board.submit(MATCH, GOOGLE);
    await board.submit({ ...MATCH, score: 9000 }, { ...GOOGLE, uid: 'u2' });
    expect((await board.top(BOARD)).map((r) => r.uid)).toEqual(['u2', 'u1']);
    await board.top(BOARD);
    expect(backend.topCalls).toBe(1);
    advance(31_000);
    await board.top(BOARD);
    expect(backend.topCalls).toBe(2);
  });

  it('a new record refreshes that board right away', async () => {
    const { board, backend } = setup();
    await board.top(BOARD);
    await board.submit(MATCH, GOOGLE);
    expect((await board.top(BOARD)).length).toBe(1);
    expect(backend.topCalls).toBe(2);
  });

  it('throws when the ranking cannot be read (the screen shows the error)', async () => {
    const { board, backend } = setup();
    backend.fail = true;
    await expect(board.top(BOARD)).rejects.toThrow();
  });

  it('finds the player’s own row', async () => {
    const { board } = setup();
    await board.submit(MATCH, GOOGLE);
    expect(await board.own(BOARD, 'u1')).toMatchObject({ uid: 'u1', score: 4321 });
    expect(await board.own(BOARD, 'nobody')).toBeNull();
  });

  it('is empty in an offline build', async () => {
    const offline = new Leaderboard(null);
    expect(offline.available).toBe(false);
    expect(await offline.top(BOARD)).toEqual([]);
  });
});
