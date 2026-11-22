import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { dayIndex, dayStart } from '../utils/day.ts';
import { dailyBonusCoins, dailyPrizes, daysToSettle, lastClosedDay, parseDailyBonus } from './dailyBonus.ts';

const { minScore, lookbackDays, settleMinutes, tiers } = CONFIG.dailyBonus;
const NOON = Date.parse('2026-11-22T12:00:00Z');
const TODAY = dayIndex(NOON);

describe('dailyBonusCoins', () => {
  const at = (position: number) => dailyBonusCoins(position, minScore, 'pt-BR');

  it('pays by place: 150, 120, 100, then 70 / 40 / 20 down to the 50th', () => {
    expect([1, 2, 3].map(at)).toEqual([150, 120, 100]);
    expect([4, 10].map(at)).toEqual([70, 70]);
    expect([11, 25].map(at)).toEqual([40, 40]);
    expect([26, 50].map(at)).toEqual([20, 20]);
    expect(at(51)).toBe(0);
  });

  it('only the Portuguese board pays', () => {
    expect(dailyBonusCoins(1, 50_000, 'pt-BR')).toBe(150);
    expect(dailyBonusCoins(1, 50_000, 'en')).toBe(0);
  });

  it('needs the minimum score (opening and quitting pays nothing, even in 1st place)', () => {
    expect(dailyBonusCoins(1, 0, 'pt-BR')).toBe(0);
    expect(dailyBonusCoins(1, minScore - 1, 'pt-BR')).toBe(0);
    expect(dailyBonusCoins(1, minScore, 'pt-BR')).toBe(150);
  });

  it('treats invalid places as no bonus', () => {
    for (const position of [0, -1, Number.NaN]) expect(at(position)).toBe(0);
  });

  it('every amount fits in one reward write and never grows with a worse place', () => {
    let previous = Infinity;
    let place = 0;
    for (const tier of tiers) {
      expect(tier.maxPosition).toBeGreaterThan(place);
      expect(tier.coins).toBeLessThan(previous);
      expect(tier.coins).toBeLessThanOrEqual(CONFIG.sync.maxRewardPerWrite);
      place = tier.maxPosition;
      previous = tier.coins;
    }
  });
});

describe('dailyPrizes', () => {
  it('covers every place from the 1st on, without gaps', () => {
    const prizes = dailyPrizes();
    expect(prizes[0]).toEqual({ from: 1, to: 1, coins: 150 });
    for (const [i, prize] of prizes.entries()) {
      if (i > 0) expect(prize.from).toBe((prizes[i - 1]?.to ?? 0) + 1);
      for (const place of [prize.from, prize.to]) expect(dailyBonusCoins(place, minScore, 'pt-BR')).toBe(prize.coins);
    }
  });
});

describe('closed days', () => {
  it('today is never closed; yesterday closes a few minutes after the turn', () => {
    const turn = dayStart(TODAY);
    expect(lastClosedDay(turn)).toBe(TODAY - 2);
    expect(lastClosedDay(turn + settleMinutes * 60_000 - 1)).toBe(TODAY - 2);
    expect(lastClosedDay(turn + settleMinutes * 60_000)).toBe(TODAY - 1);
    expect(lastClosedDay(dayStart(TODAY + 1) - 1)).toBe(TODAY - 1);
  });

  it('goes back at most 7 days, oldest first', () => {
    expect(lookbackDays).toBe(7);
    expect(daysToSettle(NOON, null)).toEqual([7, 6, 5, 4, 3, 2, 1].map((n) => TODAY - n));
    expect(daysToSettle(NOON, TODAY - 100)).toEqual(daysToSettle(NOON, null));
  });

  it('continues after the last settled day', () => {
    expect(daysToSettle(NOON, TODAY - 3)).toEqual([TODAY - 2, TODAY - 1]);
    expect(daysToSettle(NOON, TODAY - 1)).toEqual([]);
  });

  it('played on Friday, back on Monday: still there', () => {
    const friday = dayIndex(Date.parse('2026-11-20T18:00:00Z'));
    const monday = Date.parse('2026-11-23T14:00:00Z');
    expect(daysToSettle(monday, friday - 1)).toContain(friday);
  });

  it('ignores a settled day in the future (wrong device clock)', () => {
    expect(daysToSettle(NOON, TODAY + 365)).toEqual(daysToSettle(NOON, null));
  });
});

describe('parseDailyBonus (untrusted cache)', () => {
  it('reads a valid bonus', () => {
    expect(parseDailyBonus({ day: 20779, position: 3, coins: 100, extra: 1 })).toEqual({ day: 20779, position: 3, coins: 100 });
  });

  it('drops anything a reward write could not carry', () => {
    const valid = { day: 20779, position: 3, coins: 100 };
    for (const patch of [{ coins: 151 }, { coins: 0 }, { coins: -5 }, { coins: 1.5 }, { coins: '100' }, { day: 0 }, { position: null }]) {
      expect(parseDailyBonus({ ...valid, ...patch })).toBeNull();
    }
    for (const raw of [null, undefined, 'x', 5, []]) expect(parseDailyBonus(raw)).toBeNull();
  });
});
