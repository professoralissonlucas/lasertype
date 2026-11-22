import { describe, expect, it } from 'vitest';
import {
  buildScore,
  Leaderboard,
  MAX_POINTS_PER_SECOND,
  parseRow,
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
  score: 4321,
  wpm: 52.345,
  accuracy: 0.9567,
  elapsed: 95.4321,
};
const GOOGLE: Submitter = { uid: 'u1', google: true, name: 'PilotoAb12' };

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

  it('keeps the day only when given (daily mode, Phase 7)', () => {
    expect(buildScore(MATCH, 'u1', 'PilotoAb12', 20779)?.day).toBe(20779);
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

  async bestScore(id: string): Promise<number | null> {
    if (this.fail) throw new Error('offline');
    return this.docs.get(id)?.score ?? null;
  }

  async save(id: string, data: ScoreFields): Promise<void> {
    if (this.fail) throw new Error('offline');
    this.saves++;
    this.docs.set(id, data);
  }

  async top(board: Board, size: number): Promise<RankRow[]> {
    this.topCalls++;
    if (this.fail) throw new Error('offline');
    return [...this.docs.values()]
      .filter((d) => d.mode === board.mode && d.diff === board.diff && d.lang === board.lang && d.day === board.day)
      .sort((a, b) => b.score - a.score)
      .slice(0, size);
  }

  async row(id: string): Promise<RankRow | null> {
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
    expect(await board.submit(MATCH, GOOGLE)).toEqual({ kind: 'record', previous: null });
    expect(backend.docs.get('u1_survival_normal_pt-BR_0')?.score).toBe(4321);
  });

  it('only sends when the record is beaten', async () => {
    const { board, backend } = setup();
    await board.submit(MATCH, GOOGLE);
    expect(await board.submit({ ...MATCH, score: 4321 }, GOOGLE)).toEqual({ kind: 'notRecord', best: 4321 });
    expect(await board.submit({ ...MATCH, score: 100 }, GOOGLE)).toEqual({ kind: 'notRecord', best: 4321 });
    expect(backend.saves).toBe(1);
    expect(await board.submit({ ...MATCH, score: 5000 }, GOOGLE)).toEqual({ kind: 'record', previous: 4321 });
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
