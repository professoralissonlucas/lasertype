import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { dailyMissions } from './missions.ts';
import {
  applyGain,
  emptyGain,
  emptyProgress,
  isEmptyGain,
  loginGain,
  matchGain,
  mergeGain,
  parseGain,
  parseProgress,
  sameProgress,
  STAT_KEYS,
  takeGain,
} from './progress.ts';
import { dayWith, matchReport } from './testing.ts';
import type { Progress, ProgressGain } from './types.ts';
import { chestCoins } from './xp.ts';

const DAY = 20_780;
const START = emptyProgress();
const progress = (patch: Partial<Progress> = {}): Progress => ({ ...START, ...patch });
const xpGain = (xp: number): ProgressGain => ({ ...emptyGain(), xp });
const coinsOf = (gain: ProgressGain, before: Progress = START) =>
  applyGain(before, gain).awards.reduce((sum, award) => sum + award.coins, 0);

describe('matchGain', () => {
  it('collects XP, statistics and the missions of the day', () => {
    const gain = matchGain(matchReport(), DAY);
    expect(gain.xp).toBe(250 + 2 * 40);
    expect(gain.stats).toEqual({
      games: 1,
      words: 40,
      bosses: 0,
      bestScore: 4200,
      bestWpm: 24.5,
      bestBurst: 41.2,
      bestCombo: 7,
      bestWave: 5,
    });
    expect(gain.missions).toEqual([{ day: DAY, amounts: expect.any(Array) as number[] }]);
  });

  it('never rounds a speed up to the target', () => {
    expect(matchGain(matchReport({ burst: 99.99 }), DAY).stats.bestBurst).toBe(99.9);
  });

  it('Zen gives only XP, a quarter of it', () => {
    const gain = matchGain(matchReport({ mode: 'zen', wave: 40, maxCombo: 500, bosses: 12 }), DAY);
    expect(gain).toEqual({ ...emptyGain(), xp: Math.floor((250 + 80 + 600) / 4) });
  });

  it('a match without any word destroyed is not a match', () => {
    const gain = matchGain(matchReport({ destroyed: 0, letters: 0, score: 0 }), DAY);
    expect(isEmptyGain(gain)).toBe(true);
  });
});

describe('applyGain', () => {
  it('adds XP and counters, keeps the best of the bests', () => {
    const once = applyGain(START, matchGain(matchReport(), DAY)).progress;
    const twice = applyGain(once, matchGain(matchReport({ score: 100, burst: 90, maxCombo: 3, bosses: 1 }), DAY)).progress;
    expect(twice.xp).toBe(330 + 330 + 50);
    expect(twice.stats).toMatchObject({ games: 2, words: 80, bosses: 1, bestScore: 4200, bestBurst: 90, bestCombo: 7 });
  });

  it('credits a chest per level reached, once', () => {
    const { progress: after, awards } = applyGain(START, xpGain(550));
    expect(after).toMatchObject({ xp: 550, level: 3 });
    expect(awards).toEqual([
      { type: 'chest', level: 2, coins: chestCoins(2) },
      { type: 'chest', level: 3, coins: chestCoins(3) },
    ]);
    expect(after.owed).toBe(chestCoins(2) + chestCoins(3));
    expect(applyGain(after, xpGain(10)).awards).toEqual([]);
  });

  it('a level above what the XP says (an older, easier curve) pays nothing until it is passed', () => {
    const { progress: after, awards } = applyGain(progress({ xp: 100, level: 5 }), xpGain(500));
    expect(awards).toEqual([]);
    expect(after.level).toBe(5);
  });

  it('two devices crossing the same level credit one chest', () => {
    // Both saw 190 XP and earned 20: the server applies one gain after the other.
    const first = applyGain(progress({ xp: 190 }), xpGain(20));
    const second = applyGain(first.progress, xpGain(20));
    expect(first.awards).toHaveLength(1);
    expect(second.awards).toEqual([]);
  });

  it('counts each login day once, in order, and remembers the best streak', () => {
    const first = applyGain(START, loginGain(DAY));
    expect(first.progress).toMatchObject({ streak: 1, lastLogin: DAY, owed: 20 });
    expect(first.awards).toEqual([{ type: 'login', day: DAY, streak: 1, coins: 20 }]);
    const week = { ...emptyGain(), logins: [DAY, DAY + 1, DAY + 2] };
    const after = applyGain(first.progress, week);
    expect(after.awards.map((award) => award.coins)).toEqual([30, 40]);
    expect(after.progress).toMatchObject({ streak: 3, lastLogin: DAY + 2, owed: 90 });
    expect(after.progress.stats.bestStreak).toBe(3);
    // Broken: back to day 1, the best stays.
    expect(applyGain(after.progress, loginGain(DAY + 9)).progress).toMatchObject({ streak: 1, stats: { bestStreak: 3 } });
  });

  it('an old login arriving late changes nothing', () => {
    const state = progress({ streak: 4, lastLogin: DAY + 5 });
    expect(applyGain(state, loginGain(DAY)).progress).toMatchObject({ streak: 4, lastLogin: DAY + 5, owed: 0 });
  });

  it('pays a mission when it is completed, once', () => {
    const { day, mission } = dayWith('words');
    const match = matchGain(matchReport({ destroyed: mission.target }), day);
    const first = applyGain(START, match);
    const award = { type: 'mission', day, slot: mission.slot, coins: mission.coins };
    expect(first.awards).toContainEqual(award);
    expect(first.progress.missions?.paid[mission.slot]).toBe(true);
    expect(first.progress.missions?.progress[mission.slot]).toBe(mission.target);
    expect(applyGain(first.progress, match).awards).not.toContainEqual(award);
  });

  it('adds up several matches of the day', () => {
    const { day, mission } = dayWith('words');
    const half = matchGain(matchReport({ destroyed: Math.ceil(mission.target / 2) }), day);
    const first = applyGain(START, half);
    expect(first.progress.missions?.paid[mission.slot]).toBe(false);
    expect(applyGain(first.progress, half).progress.missions?.paid[mission.slot]).toBe(true);
  });

  it('a new day starts over; news of a past day are ignored', () => {
    const { day } = dayWith('words');
    const today = applyGain(START, matchGain(matchReport({ destroyed: 500 }), day)).progress;
    const tomorrow = applyGain(today, matchGain(matchReport({ destroyed: 1, letters: 1, score: 0, maxCombo: 0 }), day + 1)).progress;
    expect(tomorrow.missions?.day).toBe(day + 1);
    const late = applyGain(tomorrow, matchGain(matchReport({ destroyed: 500 }), day)).progress;
    expect(late.missions).toEqual(tomorrow.missions);
    // The XP and the statistics still count.
    expect(late.stats.words).toBe(tomorrow.stats.words + 500);
  });

  it('applying merged gains is the same as applying them one by one', () => {
    const { day } = dayWith('letters');
    const gains = [
      loginGain(day),
      matchGain(matchReport(), day),
      matchGain(matchReport({ destroyed: 70, letters: 400, maxCombo: 12 }), day),
      loginGain(day + 1),
      matchGain(matchReport({ mode: 'daily', score: 9000 }), day + 1),
    ];
    const oneByOne = gains.reduce((state, gain) => applyGain(state, gain).progress, START);
    const merged = applyGain(START, gains.reduce((a, b) => mergeGain(a, b), emptyGain())).progress;
    expect(merged).toEqual(oneByOne);
  });

  it('every award of a heavy day still waits in `owed`', () => {
    const { day } = dayWith('words');
    const heavy = matchReport({ destroyed: 600, letters: 9000, score: 99_999, maxCombo: 60, wave: 20, bosses: 4, empUses: 9, burst: 120 });
    const gain = mergeGain(loginGain(day), matchGain(heavy, day));
    const { progress: after, awards } = applyGain(progress({ xp: 100 }), gain);
    expect(after.owed).toBe(awards.reduce((sum, award) => sum + award.coins, 0));
    expect(after.owed).toBe(coinsOf(gain, progress({ xp: 100 })));
    expect(after.owed).toBeGreaterThan(CONFIG.sync.maxRewardPerWrite);
    for (const award of awards) expect(award.coins).toBeLessThanOrEqual(CONFIG.sync.maxRewardPerWrite);
  });
});

describe('gains', () => {
  it('takeGain leaves the XP above the limit for later', () => {
    const gain = { ...matchGain(matchReport(), DAY), xp: 4500, logins: [DAY] };
    const { first, rest } = takeGain(gain, 2000);
    expect(first).toEqual({ ...gain, xp: 2000 });
    expect(rest).toEqual({ ...emptyGain(), xp: 2500 });
    expect(takeGain(xpGain(10), 2000).rest).toEqual(emptyGain());
  });

  it('mergeGain keeps the days sorted and apart', () => {
    const merged = mergeGain(mergeGain(loginGain(DAY + 1), matchGain(matchReport(), DAY + 1)), mergeGain(loginGain(DAY), matchGain(matchReport(), DAY)));
    expect(merged.logins).toEqual([DAY, DAY + 1]);
    expect(merged.missions.map((entry) => entry.day)).toEqual([DAY, DAY + 1]);
  });

  it('isEmptyGain', () => {
    expect(isEmptyGain(emptyGain())).toBe(true);
    expect(isEmptyGain(xpGain(1))).toBe(false);
    expect(isEmptyGain(loginGain(DAY))).toBe(false);
  });
});

describe('reading', () => {
  it('a missing or broken document is an empty progress', () => {
    for (const raw of [undefined, null, 'x', 7, { stats: 'x', xp: -5, level: 0, lastLogin: 'today' }]) {
      expect(parseProgress(raw)).toEqual(START);
    }
  });

  it('reads the document shape (missions and owed inside stats) and the cache shape', () => {
    const { day } = dayWith('words');
    const state = applyGain(START, mergeGain(loginGain(day), matchGain(matchReport({ destroyed: 300 }), day))).progress;
    const { missions, owed, stats, ...top } = state;
    expect(parseProgress({ ...top, stats: { ...stats, missions, owed, dailyDay: 3 } })).toEqual(state);
    expect(parseProgress(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('repairs bad numbers and mission lists', () => {
    const parsed = parseProgress({
      xp: 12.9,
      level: 2.5,
      streak: Number.NaN,
      stats: { games: '3', words: 10.7, bestWpm: 33.3, missions: { day: 5, progress: ['x', 4], paid: 'yes' }, owed: -3 },
    });
    expect(parsed).toMatchObject({ xp: 12, level: 2, streak: 0, owed: 0 });
    expect(parsed.stats).toMatchObject({ games: 0, words: 10, bestWpm: 33.3 });
    expect(parsed.missions).toEqual({ day: 5, progress: [0, 4, 0], paid: [false, false, false] });
    expect(parseProgress({ stats: { missions: { day: 'x' } } }).missions).toBeNull();
  });

  it('reads a cached gain back, dropping what is invalid', () => {
    const gain = mergeGain(loginGain(DAY), matchGain(matchReport(), DAY));
    expect(parseGain(JSON.parse(JSON.stringify(gain)))).toEqual(gain);
    expect(parseGain(undefined)).toEqual(emptyGain());
    expect(parseGain({ xp: 'lots', logins: [DAY, 'x', -1], missions: [null, { day: 0 }], stats: { games: -2 } })).toEqual({
      ...emptyGain(),
      logins: [DAY],
    });
  });

  it('sameProgress compares by value', () => {
    expect(sameProgress(START, emptyProgress())).toBe(true);
    expect(sameProgress(START, progress({ xp: 1 }))).toBe(false);
  });

  it('STAT_KEYS lists every statistic', () => {
    expect([...STAT_KEYS].sort()).toEqual(Object.keys(START.stats).sort());
    expect(dailyMissions(DAY)).toHaveLength(3);
  });
});
