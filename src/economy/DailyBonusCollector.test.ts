import { describe, expect, it } from 'vitest';
import type { Board, RankRow } from '../firebase/types.ts';
import { dayIndex } from '../utils/day.ts';
import type { DailyBonus } from './dailyBonus.ts';
import { DailyBonusCollector, type BonusAccount, type BonusBoards } from './DailyBonusCollector.ts';

const NOON = Date.parse('2026-11-22T12:00:00Z');
const DAY_MS = 86_400_000;
const TODAY = dayIndex(NOON);

class FakeAccount implements BonusAccount {
  readyUid: string | null = 'u1';
  dailySettled: number | null = null;
  readonly settled: [day: number, bonus: DailyBonus | null][] = [];

  settleDaily(day: number, bonus: DailyBonus | null): void {
    this.dailySettled = day;
    this.settled.push([day, bonus]);
  }

  get bonuses(): DailyBonus[] {
    return this.settled.flatMap(([, bonus]) => bonus ?? []);
  }
}

class FakeBoards implements BonusBoards {
  /** `${lang}_${day}` → scores by uid. */
  readonly scores = new Map<string, Record<string, number>>();
  readonly asked: Board[] = [];
  counts = 0;
  /** Reading this day fails. */
  failDay: number | null = null;
  onOwn: () => void = () => undefined;

  set(lang: string, day: number, scores: Record<string, number>): void {
    this.scores.set(`${lang}_${day}`, scores);
  }

  private on(board: Board): Record<string, number> {
    return board.mode === 'daily' && board.diff === 'normal' ? (this.scores.get(`${board.lang}_${board.day}`) ?? {}) : {};
  }

  async own(board: Board, uid: string): Promise<RankRow | null> {
    this.asked.push(board);
    this.onOwn();
    if (board.day === this.failDay) throw new Error('offline');
    const score = this.on(board)[uid];
    return score === undefined ? null : { uid, name: 'Ana', score, wpm: 40, accuracy: 95 };
  }

  async position(board: Board, score: number): Promise<number> {
    this.counts++;
    return 1 + Object.values(this.on(board)).filter((other) => other > score).length;
  }
}

function setup() {
  const account = new FakeAccount();
  const boards = new FakeBoards();
  let now = NOON;
  const collector = new DailyBonusCollector(account, boards, undefined, () => now);
  return { account, boards, collector, advance: (ms: number) => (now += ms) };
}

describe('DailyBonusCollector', () => {
  it('finds the final place of a closed day', async () => {
    const { account, boards, collector } = setup();
    boards.set('pt-BR', TODAY - 1, { u1: 5000, a: 9000, b: 7000, c: 100 });
    await collector.collect();
    expect(account.bonuses).toEqual([{ day: TODAY - 1, position: 3, coins: 100 }]);
    expect(account.dailySettled).toBe(TODAY - 1);
  });

  it('ties share the better place', async () => {
    const { account, boards, collector } = setup();
    boards.set('pt-BR', TODAY - 1, { u1: 5000, a: 5000 });
    await collector.collect();
    expect(account.bonuses).toEqual([{ day: TODAY - 1, position: 1, coins: 150 }]);
  });

  it('never pays today: its board can still change', async () => {
    const { account, boards, collector, advance } = setup();
    boards.set('pt-BR', TODAY, { u1: 5000 });
    await collector.collect();
    expect(account.bonuses).toEqual([]);
    advance(DAY_MS);
    await collector.collect();
    expect(account.bonuses).toEqual([{ day: TODAY, position: 1, coins: 150 }]);
  });

  it('only reads the Portuguese board', async () => {
    const { account, boards, collector } = setup();
    boards.set('en', TODAY - 1, { u1: 50_000 });
    await collector.collect();
    expect(account.bonuses).toEqual([]);
    expect(new Set(boards.asked.map((board) => board.lang))).toEqual(new Set(['pt-BR']));
  });

  it('collects up to 7 days back, oldest first, one read per day', async () => {
    const { account, boards, collector } = setup();
    for (const ago of [8, 7, 3, 1]) boards.set('pt-BR', TODAY - ago, { u1: 5000 });
    await collector.collect();
    expect(account.bonuses.map((bonus) => bonus.day)).toEqual([TODAY - 7, TODAY - 3, TODAY - 1]);
    expect(boards.asked).toHaveLength(7);
    expect(boards.counts).toBe(3); // places are only counted on the days played
  });

  it('reads nothing once every closed day is settled', async () => {
    const { boards, collector } = setup();
    await collector.collect();
    const reads = boards.asked.length;
    await collector.collect();
    expect(boards.asked).toHaveLength(reads);
  });

  it('below the minimum score there is no bonus (nor a place to count)', async () => {
    const { account, boards, collector } = setup();
    boards.set('pt-BR', TODAY - 1, { u1: 0 });
    await collector.collect();
    expect(account.bonuses).toEqual([]);
    expect(boards.counts).toBe(0);
  });

  it('stops at a failed day and resumes from it, skipping none', async () => {
    const { account, boards, collector } = setup();
    boards.set('pt-BR', TODAY - 3, { u1: 5000 });
    boards.set('pt-BR', TODAY - 1, { u1: 5000 });
    boards.failDay = TODAY - 3;
    await collector.collect();
    expect(account.dailySettled).toBe(TODAY - 4);
    expect(account.bonuses).toEqual([]);

    boards.failDay = null;
    await collector.collect();
    expect(account.bonuses.map((bonus) => bonus.day)).toEqual([TODAY - 3, TODAY - 1]);
  });

  it('waits for the account document', async () => {
    const { account, boards, collector } = setup();
    account.readyUid = null;
    await collector.collect();
    expect(boards.asked).toEqual([]);
  });

  it('never settles one account’s days on another', async () => {
    const { account, boards, collector } = setup();
    boards.set('pt-BR', TODAY - 7, { u1: 5000 });
    boards.onOwn = () => (account.readyUid = 'u2');
    await collector.collect();
    expect(account.settled).toEqual([]);
  });

  it('runs once at a time', async () => {
    const { boards, collector } = setup();
    await Promise.all([collector.collect(), collector.collect(), collector.collect()]);
    expect(boards.asked).toHaveLength(7);
  });
});
