import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import { emptyGain, emptyProgress, loginGain, matchGain, mergeGain, parseProgress } from '../progression/progress.ts';
import { matchReport } from '../progression/testing.ts';
import { chestCoins } from '../progression/xp.ts';
import { newUserFields, parseUserDoc, rewardWrite } from './profile.ts';

describe('parseUserDoc (untrusted users/{uid})', () => {
  it('reads coins, items, equipment, name and lastReward', () => {
    const snapshot = parseUserDoc({
      coins: 1200,
      owned: { theme_void: true },
      equipped: { theme: 'theme_void' },
      lastPurchase: 'theme_void',
      name: 'Ana',
      lastReward: { toMillis: () => 1_700_000_000_000 },
      xp: 250,
      level: 2,
      stats: { batch: 'b1' },
    });
    expect(snapshot).toEqual({
      inventory: { coins: 1200, owned: { theme_void: true }, equipped: { theme: 'theme_void' }, lastPurchase: 'theme_void' },
      progress: { ...emptyProgress(), xp: 250, level: 2 },
      batch: 'b1',
      name: 'Ana',
      lastReward: 1_700_000_000_000,
      dailyDay: null,
    });
  });

  it('reads the last Daily Challenge day paid (stats.dailyDay)', () => {
    expect(parseUserDoc({ stats: { games: 0, dailyDay: 20779 } }).dailyDay).toBe(20779);
    for (const dailyDay of ['20779', 20779.5, Number.NaN, null, true]) {
      expect(parseUserDoc({ stats: { dailyDay } }).dailyDay).toBeNull();
    }
    expect(parseUserDoc({ stats: 'x' }).dailyDay).toBeNull();
  });

  it('repairs whatever is wrong instead of failing', () => {
    expect(parseUserDoc(undefined)).toEqual({
      inventory: { coins: 0, owned: {}, equipped: {}, lastPurchase: null },
      progress: emptyProgress(),
      batch: null,
      name: null,
      lastReward: null,
      dailyDay: null,
    });
    const snapshot = parseUserDoc({
      coins: -5,
      owned: { nope: true, cannon_twin: 'yes' },
      equipped: { theme: 'theme_void' }, // not owned
      name: 'x',
      lastReward: 'yesterday',
    });
    expect(snapshot.inventory).toEqual({ coins: 0, owned: {}, equipped: {}, lastPurchase: null });
    expect(snapshot.name).toBeNull();
    expect(snapshot.lastReward).toBeNull();
  });

  it('a freshly created document reads back as an empty account', () => {
    const snapshot = parseUserDoc(newUserFields('Piloto0001', { toMillis: () => 42 }));
    expect(snapshot).toEqual({
      inventory: { coins: 0, owned: {}, equipped: {}, lastPurchase: null },
      progress: emptyProgress(),
      batch: null,
      name: 'Piloto0001',
      lastReward: 42,
      dailyDay: null,
    });
  });
});

describe('rewardWrite', () => {
  const NOW = { serverTimestamp: true };
  const server = (patch = {}) => ({ coins: 100, progress: { ...emptyProgress(), ...patch } });
  const batch = (coins: number, gain = emptyGain()) => ({ id: 'b1', coins, gain });

  /** What the document holds after the write (field paths applied). */
  function stored(fields: Readonly<Record<string, unknown>>) {
    const doc: { stats: Record<string, unknown> } & Record<string, unknown> = { stats: {} };
    for (const [path, value] of Object.entries(fields)) {
      if (path.startsWith('stats.')) doc.stats[path.slice('stats.'.length)] = value;
      else doc[path] = value;
    }
    return doc;
  }

  it('pays match coins at once when they fit', () => {
    const { fields, paid, progress } = rewardWrite(server(), batch(90), NOW);
    expect(paid).toBe(90);
    expect(fields).toMatchObject({ coins: 190, lastReward: NOW, 'stats.owed': 0, 'stats.batch': 'b1' });
    expect(progress.owed).toBe(0);
  });

  it('pays at most 150 per write; the rest stays owed in the document', () => {
    const week = { ...emptyGain(), xp: 500, logins: [20_000] };
    const total = 90 + 20 + chestCoins(2) + chestCoins(3);
    const first = rewardWrite(server(), batch(90, week), NOW);
    expect(first.coins).toBe(100 + 150);
    expect(first.progress).toMatchObject({ xp: 500, level: 3, streak: 1, lastLogin: 20_000, owed: total - 150 });
    const second = rewardWrite({ coins: first.coins, progress: first.progress }, batch(0), NOW);
    expect(second.coins).toBe(100 + total);
    expect(second.progress.owed).toBe(0);
  });

  it('never pays the same login, mission or chest twice, whatever the devices send', () => {
    const heavy = { destroyed: 900, letters: 900, score: 99_999, bosses: 3, empUses: 9, maxCombo: 40, wave: 12, burst: 80, accuracy: 1 };
    const gain = mergeGain(loginGain(20_000), matchGain(matchReport(heavy), 20_000));
    const once = rewardWrite(server(), batch(0, gain), NOW);
    const again = rewardWrite({ coins: once.coins, progress: once.progress }, { id: 'b2', coins: 0, gain: { ...gain, xp: 0 } }, NOW);
    expect(again.coins + again.progress.owed).toBe(once.coins + once.progress.owed);
  });

  it('the document reads back as the progress it returns', () => {
    const gain = mergeGain(loginGain(20_000), matchGain(matchReport(), 20_000));
    const { fields, progress } = rewardWrite(server({ xp: 700, level: 3 }), batch(40, gain), NOW);
    expect(parseProgress(stored(fields))).toEqual(progress);
  });

  it('touches stats by field path, so the rest of it stays (dailyDay)', () => {
    const { fields } = rewardWrite(server(), batch(10), NOW);
    expect('stats' in fields).toBe(false);
    expect('stats.dailyDay' in fields).toBe(false);
    expect(CONFIG.sync.maxRewardPerWrite).toBe(150);
  });

  it('XP and coins are whole numbers (the rules require int)', () => {
    const gain = matchGain(matchReport({ mode: 'zen', letters: 333 }), 20_000);
    const { fields } = rewardWrite(server(), batch(7, gain), NOW);
    for (const key of ['coins', 'xp', 'level', 'streak', 'stats.owed']) expect(Number.isInteger(fields[key]), key).toBe(true);
  });
});
