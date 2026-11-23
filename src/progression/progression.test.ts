import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { getItem, CATALOG, isAchievementItem, isPurchasable } from '../cosmetics/catalog.ts';
import { COLLECTIONS, isComplete, ownsTitle } from '../cosmetics/collections.ts';
import { COLLECTION_IDS } from '../cosmetics/types.ts';
import { dayIndex } from '../utils/day.ts';
import { LANGUAGES } from '../words/types.ts';
import { ACHIEVEMENTS, achievementFor, isAchieved } from './achievements.ts';
import { dailyMissions, mergeAmounts, missionAmounts, missionViews } from './missions.ts';
import { emptyProgress } from './progress.ts';
import { claimLogin, currentStreak, streakCoins, streakSlot } from './streak.ts';
import { dayWith, matchReport } from './testing.ts';
import { MISSION_METRICS } from './types.ts';
import { chestCoins, levelCost, levelOf, levelProgress, matchXp, xpToReach } from './xp.ts';

const MAX = CONFIG.sync.maxRewardPerWrite;
const P = CONFIG.progression;

describe('matchXp', () => {
  it('= letters + 2 × words + 50 × bosses', () => {
    expect(matchXp({ mode: 'survival', letters: 262, destroyed: 46, bosses: 0 })).toEqual({
      fromLetters: 262,
      fromWords: 92,
      fromBosses: 0,
      factor: 1,
      total: 354,
    });
    expect(matchXp({ mode: 'daily', letters: 100, destroyed: 10, bosses: 2 }).total).toBe(220);
  });

  it('is at most 1000 per match, and a quarter in Zen (after the cap)', () => {
    expect(matchXp({ mode: 'timeAttack', letters: 9000, destroyed: 900, bosses: 9 }).total).toBe(1000);
    expect(matchXp({ mode: 'zen', letters: 9000, destroyed: 900, bosses: 9 }).total).toBe(250);
    expect(matchXp({ mode: 'zen', letters: 10, destroyed: 1, bosses: 0 }).total).toBe(3); // floor(12 / 4)
  });

  it('every match fits in one reward write', () => {
    expect(P.xp.maxPerMatch).toBeLessThanOrEqual(CONFIG.sync.maxXpPerWrite);
  });
});

describe('levels', () => {
  it('level n costs 200 + 100 × (n − 1)', () => {
    expect([1, 2, 3, 10].map((n) => levelCost(n))).toEqual([200, 300, 400, 1100]);
    expect([1, 2, 3, 5, 10, 20].map((n) => xpToReach(n))).toEqual([0, 200, 500, 1400, 5400, 20900]);
  });

  it('levelOf is the inverse of xpToReach, at every edge', () => {
    for (let level = 1; level <= 300; level++) {
      const xp = xpToReach(level);
      expect(levelOf(xp)).toBe(level);
      expect(levelOf(xp + levelCost(level) - 1)).toBe(level);
      if (level > 1) expect(levelOf(xp - 1)).toBe(level - 1);
    }
    expect(levelOf(0)).toBe(1);
    expect(levelOf(-50)).toBe(1);
  });

  it('levelProgress tells how far inside the level', () => {
    expect(levelProgress(0)).toEqual({ level: 1, into: 0, cost: 200 });
    expect(levelProgress(650)).toEqual({ level: 3, into: 150, cost: 400 });
  });

  it('a chest is 40 + 5 × level, up to 150 (one reward write)', () => {
    expect([2, 10, 22, 23, 500].map((level) => chestCoins(level))).toEqual([50, 90, 150, 150, 150]);
    for (let level = 2; level < 200; level++) expect(chestCoins(level)).toBeLessThanOrEqual(MAX);
  });
});

describe('login streak', () => {
  const DAY = 20_780;

  it('pays 20 on day 1 up to 150 on day 7, then starts the table over', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 14, 15].map((n) => streakCoins(n))).toEqual([20, 30, 40, 60, 80, 110, 150, 20, 150, 20]);
    expect(streakSlot(0)).toBe(0);
    for (const coins of P.streakCoins) expect(coins).toBeLessThanOrEqual(MAX);
  });

  it('counts the days in a row, once each', () => {
    expect(claimLogin({ streak: 0, lastLogin: null }, DAY)).toEqual({ streak: 1, coins: 20 });
    expect(claimLogin({ streak: 1, lastLogin: DAY }, DAY)).toBeNull();
    expect(claimLogin({ streak: 1, lastLogin: DAY }, DAY + 1)).toEqual({ streak: 2, coins: 30 });
    expect(claimLogin({ streak: 7, lastLogin: DAY }, DAY + 1)).toEqual({ streak: 8, coins: 20 });
  });

  it('a missed day goes back to day 1', () => {
    expect(claimLogin({ streak: 6, lastLogin: DAY }, DAY + 2)).toEqual({ streak: 1, coins: 20 });
  });

  it('a later day already counted (another device, a clock ahead) is not paid again', () => {
    expect(claimLogin({ streak: 3, lastLogin: DAY + 1 }, DAY)).toBeNull();
  });

  it('is alive until the end of the next day', () => {
    const state = { streak: 4, lastLogin: DAY };
    expect(currentStreak(state, DAY)).toBe(4);
    expect(currentStreak(state, DAY + 1)).toBe(4);
    expect(currentStreak(state, DAY + 2)).toBe(0);
    expect(currentStreak({ streak: 0, lastLogin: null }, DAY)).toBe(0);
  });
});

describe('daily missions', () => {
  const TODAY = dayIndex(Date.parse('2026-11-22T12:00:00Z'));

  it('are three, one per slot, the same for everyone on the same day', () => {
    const missions = dailyMissions(TODAY);
    expect(missions.map((m) => m.slot)).toEqual([0, 1, 2]);
    expect(missions.map((m) => m.coins)).toEqual([30, 40, 50]);
    expect(dailyMissions(TODAY)).toEqual(missions);
  });

  it('change every day; a slot shows its whole pool before repeating', () => {
    P.missions.slots.forEach(({ pool }, slot) => {
      const start = Math.ceil(TODAY / pool.length) * pool.length;
      for (let cycle = 0; cycle < 20; cycle++) {
        const days = pool.map((_, i) => start + cycle * pool.length + i);
        const metrics = days.map((day) => dailyMissions(day)[slot]?.metric);
        expect(new Set(metrics).size).toBe(pool.length);
      }
    });
  });

  it('draw a target from their own list, and every target comes up', () => {
    const seen = new Set<string>();
    for (let day = TODAY; day < TODAY + 400; day++) {
      for (const { metric, target, slot } of dailyMissions(day)) {
        const template = P.missions.slots[slot]?.pool.find((entry) => entry.metric === metric);
        expect(template?.targets).toContain(target);
        seen.add(`${metric}:${target}`);
      }
    }
    const all = P.missions.slots.flatMap(({ pool }) => pool.flatMap((t) => t.targets.map((target) => `${t.metric}:${target}`)));
    expect([...seen].sort()).toEqual([...all].sort());
  });

  it('use every metric, with coins that fit in one reward write', () => {
    const used = P.missions.slots.flatMap(({ pool }) => pool.map((t) => t.metric));
    expect([...used].sort()).toEqual([...MISSION_METRICS].sort());
    for (const { coins } of P.missions.slots) expect(coins).toBeLessThanOrEqual(MAX);
  });

  it('count what a match did', () => {
    const report = matchReport({ empUses: 2, bosses: 1 });
    const amountOf = (metric: (typeof MISSION_METRICS)[number], match = report) => {
      const { day, mission } = dayWith(metric);
      return missionAmounts(day, match)[mission.slot];
    };
    expect(amountOf('words')).toBe(40);
    expect(amountOf('letters')).toBe(250);
    expect(amountOf('games')).toBe(1);
    expect(amountOf('games', matchReport({ destroyed: 9 }))).toBe(0);
    expect(amountOf('score')).toBe(4200);
    expect(amountOf('matchScore')).toBe(4200);
    expect(amountOf('bosses')).toBe(1);
    expect(amountOf('emp')).toBe(2);
    expect(amountOf('combo')).toBe(7);
    expect(amountOf('accuracy')).toBe(91);
    expect(amountOf('accuracy', matchReport({ destroyed: 24, accuracy: 1 }))).toBe(0);
    expect(amountOf('burst')).toBe(41);
    expect(amountOf('wave')).toBe(5);
    expect(amountOf('wave', matchReport({ mode: 'timeAttack' }))).toBe(0);
    expect(amountOf('dailyScore')).toBe(0);
    expect(amountOf('dailyScore', matchReport({ mode: 'daily' }))).toBe(4200);
    expect(amountOf('timeAttackScore')).toBe(0);
    expect(amountOf('timeAttackScore', matchReport({ mode: 'timeAttack' }))).toBe(4200);
  });

  it('add up over the day, or keep the best match, depending on the metric', () => {
    const sum = dayWith('words');
    expect(mergeAmounts(sum.day, missionAmounts(sum.day, matchReport()), missionAmounts(sum.day, matchReport()))[sum.mission.slot]).toBe(80);
    const best = dayWith('combo');
    const a = missionAmounts(best.day, matchReport({ maxCombo: 5 }));
    const b = missionAmounts(best.day, matchReport({ maxCombo: 4 }));
    expect(mergeAmounts(best.day, a, b)[best.mission.slot]).toBe(5);
  });

  it('missionViews shows today only, capped at the target', () => {
    const { day, mission } = dayWith('letters');
    const state = { day, progress: [0, 0, 0].map((_, i) => (i === mission.slot ? 99_999 : 0)), paid: [false, false, false] };
    expect(missionViews(state, day)[mission.slot]).toMatchObject({ progress: mission.target, done: false });
    expect(missionViews({ ...state, paid: [true, true, true] }, day).every((view) => view.done && view.progress === view.target)).toBe(true);
    expect(missionViews(state, day + 1).every((view) => view.progress === 0 && !view.done)).toBe(true);
    expect(missionViews(null, day)).toHaveLength(3);
  });
});

describe('achievements', () => {
  it('one per category; each item is in the catalog, never sold, and points back', () => {
    const items = ACHIEVEMENTS.map((entry) => getItem(entry.itemId));
    for (const [i, entry] of ACHIEVEMENTS.entries()) {
      const item = items[i];
      expect(item?.unlock, entry.id).toBe(entry.id);
      expect(item?.price, entry.id).toBeNull();
      expect(achievementFor(entry.itemId)).toBe(entry);
    }
    expect(new Set(items.map((item) => item?.type)).size).toBe(5);
    expect(CATALOG.filter(isAchievementItem).map((item) => item.id).sort()).toEqual(ACHIEVEMENTS.map((entry) => entry.itemId).sort());
    expect(achievementFor('cannon_halo')).toBeUndefined();
  });

  it('are reached at their target', () => {
    const { stats } = emptyProgress();
    const golden = achievementFor('cannon_golden');
    if (!golden) throw new Error('no golden cannon');
    expect(golden.target).toBe(100);
    expect(isAchieved(golden, stats)).toBe(false);
    expect(isAchieved(golden, { ...stats, bestBurst: 99.9 })).toBe(false);
    expect(isAchieved(golden, { ...stats, bestBurst: 100 })).toBe(true);
    // The match WPM has nothing to do with it.
    expect(isAchieved(golden, { ...stats, bestWpm: 150 })).toBe(false);
  });

  it('the streak one can be reached with the streak table', () => {
    expect(P.achievements.loyal).toBeLessThanOrEqual(P.streakCoins.length);
  });
});

describe('collections', () => {
  it('cover every item that is not a default, each in one set', () => {
    for (const item of CATALOG) expect(item.set === undefined, item.id).toBe(item.price === 0);
    const listed = COLLECTIONS.flatMap((entry) => entry.items.map((item) => item.id));
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed).toHaveLength(CATALOG.filter((item) => isPurchasable(item) || isAchievementItem(item)).length);
  });

  it('have a name and a title in every language, and 3 to 5 items', () => {
    expect(COLLECTIONS.map((entry) => entry.id)).toEqual([...COLLECTION_IDS]);
    expect(new Set(COLLECTIONS.map((entry) => entry.titleId)).size).toBe(COLLECTIONS.length);
    for (const entry of COLLECTIONS) {
      expect(entry.items.length).toBeGreaterThanOrEqual(3);
      expect(entry.items.length).toBeLessThanOrEqual(5);
      for (const lang of LANGUAGES) {
        expect(entry.name[lang].length).toBeGreaterThan(0);
        expect(entry.title[lang].length).toBeGreaterThan(0);
      }
    }
  });

  it('the achievement items are a set of their own', () => {
    const golden = COLLECTIONS.find((entry) => entry.id === 'golden');
    expect(golden?.items.every(isAchievementItem)).toBe(true);
    expect(COLLECTIONS.filter((entry) => entry.id !== 'golden').every((entry) => entry.items.every(isPurchasable))).toBe(true);
  });

  it('a title needs every item of its set', () => {
    const aurora = COLLECTIONS[0];
    if (!aurora) throw new Error('no collections');
    const all = new Set(aurora.items.map((item) => item.id));
    expect(isComplete(aurora, (id) => all.has(id))).toBe(true);
    expect(ownsTitle(aurora.titleId, (id) => all.has(id))).toBe(true);
    all.delete(aurora.items[0]?.id ?? '');
    expect(ownsTitle(aurora.titleId, (id) => all.has(id))).toBe(false);
    expect(ownsTitle('title_nope', () => true)).toBe(false);
  });
});
