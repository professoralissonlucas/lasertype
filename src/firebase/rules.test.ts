// firestore.rules is the contract: these tests fail when the client and the rules drift
// apart (identifier lists, limits, maxPointsPerSecond, day arithmetic, discount, doc ids,
// the fields of every users/{uid} write and the shop documents the seed writes).
import { describe, expect, it } from 'vitest';
import rules from '../../firestore.rules?raw';
import { CONFIG } from '../config.ts';
import { DISCOUNT_ORDER } from '../cosmetics/catalog.ts';
import shopSource from '../economy/shop.ts?raw';
import { discountedPrice } from '../economy/shop.ts';
import { comboMultiplier, maxPointsPerSecond } from '../game/scoring.ts';
import { GAME_DIFFICULTIES } from '../game/types.ts';
import { DAY_MS, DAY_START_OFFSET_MS } from '../utils/day.ts';
import { longestWordLength } from '../words/index.ts';
import { LANGUAGES } from '../words/types.ts';
import { buildScore, MAX_POINTS_PER_SECOND, scoreDocId } from './leaderboard.ts';
import { equipFields, newUserFields, profileFields, purchaseFields, rewardFields } from './profile.ts';
import { SHOP, SHOP_CONFIG_ID, shopDocuments } from './shopDocs.ts';
import { RANKED_MODES } from './types.ts';

/** First capture group of `pattern` (fails loudly when the rules changed shape). */
function capture(pattern: RegExp, source: string = rules): string {
  const match = pattern.exec(source);
  if (!match?.[1]) throw new Error(`firestore.rules: no match for ${pattern}`);
  return match[1];
}

/** `['a', 'b']` → ['a', 'b'] */
function list(pattern: RegExp, source: string = rules): string[] {
  return [...capture(pattern, source).matchAll(/'([^']*)'/g)].map((m) => m[1] ?? '');
}

/** The text of `function name(...) { ... }` in the rules, up to the next function. */
function ruleFunction(name: string): string {
  const start = rules.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`firestore.rules: no function ${name}`);
  const next = rules.indexOf('function ', start + 1);
  return rules.slice(start, next < 0 ? undefined : next);
}

/** The `allow create` rule of users/{uid}. */
function userCreateRule(): string {
  const start = rules.indexOf('allow create: if isOwner(uid)');
  const end = rules.indexOf('allow update: if isOwner(uid)');
  if (start < 0 || end < start) throw new Error('firestore.rules: no users/{uid} create rule');
  return rules.slice(start, end);
}

/** Top-level fields a write touches ('owned.x' is a field path inside `owned`). */
function topLevel(fields: object): string[] {
  return [...new Set(Object.keys(fields).map((key) => key.split('.')[0] ?? key))].sort();
}

/** What `changed().hasOnly([...])` allows in a rules function. */
function allowedChanges(fn: string): string[] {
  return list(/changed\(\)\.hasOnly\((\[[^\]]*\])/, ruleFunction(fn)).sort();
}

/** Stands in for serverTimestamp() (= request.time on the server). */
const SERVER_TIME = { serverTimestamp: true } as const;

describe('firestore.rules ↔ client', () => {
  it('maxPointsPerSecond is the theoretical maximum of scoring.ts, rounded up', () => {
    const value = Number(capture(/function maxPointsPerSecond\(\)\s*\{\s*return (\d+);/));
    expect(value).toBe(Math.ceil(maxPointsPerSecond(longestWordLength())));
    expect(value).toBe(MAX_POINTS_PER_SECOND);
    expect(value).toBe(1977);
  });

  it('mode, diff and lang lists use the code identifiers', () => {
    expect(list(/d\.mode in (\[[^\]]*\])/)).toEqual([...RANKED_MODES, 'daily']);
    expect(list(/d\.diff in (\[[^\]]*\])/)).toEqual([...GAME_DIFFICULTIES]);
    expect(list(/d\.lang in (\[[^\]]*\])/)).toEqual([...LANGUAGES]);
  });

  it('limits match CONFIG.ranking', () => {
    const r = CONFIG.ranking;
    expect(Number(capture(/d\.wpm <= (\d+)/))).toBe(r.maxWpm);
    expect(Number(capture(/d\.duration > 0 && d\.duration <= (\d+)/))).toBe(r.maxDuration);
    expect(Number(capture(/d\.mode != 'timeAttack' \|\| d\.duration <= (\d+)/))).toBe(r.timeAttackMaxDuration);
    expect(Number(capture(/name\.size\(\) >= (\d+)/))).toBe(r.nameMin);
    expect(Number(capture(/name\.size\(\) <= (\d+)/))).toBe(r.nameMax);
    expect(Number(capture(/d\.accuracy >= 0 && d\.accuracy <= (\d+)/))).toBe(100);
  });

  it('the score document has exactly the fields the rules allow (+ createdAt)', () => {
    const fields = buildScore(
      { mode: 'survival', difficulty: 'normal', lang: 'pt-BR', score: 100, wpm: 40, accuracy: 0.9, elapsed: 30 },
      'uid',
      'Piloto1234',
    );
    const sent = [...Object.keys(fields ?? {}), 'createdAt'].sort();
    const allowed = list(/d\.keys\(\)\.hasOnly\((\[[^\]]*\])/).sort();
    const required = list(/d\.keys\(\)\.hasAll\((\[[^\]]*\])/).sort();
    expect(sent).toEqual(required);
    // 'photo' is allowed but never sent (privacy: no Google name or photo).
    expect(allowed).toEqual([...required, 'photo'].sort());
  });

  it('the document id follows the rules', () => {
    expect(rules).toContain("scoreId == d.uid + '_' + d.mode + '_' + d.diff + '_' + d.lang + '_' + string(d.day)");
    expect(scoreDocId('abc', { mode: 'timeAttack', diff: 'hard', lang: 'en', day: 0 })).toBe('abc_timeAttack_hard_en_0');
  });

  it('the game day is computed the same way (03:00 UTC)', () => {
    expect(rules).toContain(`(request.time.toMillis() - ${DAY_START_OFFSET_MS}) / ${DAY_MS}`);
  });

  it('the discount uses the same integer math as economy/shop.ts', () => {
    expect(rules).toContain('int(math.floor(base * 7 / 100)) * 10');
    expect(shopSource).toMatch(/return Math\.floor\(price \* 7 \/ 100\) \* 10;/);
    for (const price of Object.values(CONFIG.economy.rarityPrice)) {
      expect(discountedPrice(price)).toBe(Math.floor(price * 7 / 100) * 10);
    }
  });
});

describe('users/{uid} writes ↔ firestore.rules', () => {
  it('creation: only allowed keys, coins 0, xp 0, owned {} and lastReward = request.time', () => {
    const create = userCreateRule();
    const allowed = list(/incoming\(\)\.keys\(\)\.hasOnly\((\[[^\]]*\])/, create);
    const fields = newUserFields('Piloto1234', SERVER_TIME);
    expect(Object.keys(fields).filter((key) => !allowed.includes(key))).toEqual([]);
    expect(create).toContain('incoming().coins == 0');
    expect(create).toContain('incoming().xp == 0');
    expect(create).toContain('incoming().owned.size() == 0');
    expect(create).toContain('incoming().lastReward == request.time');
    expect(fields).toMatchObject({ name: 'Piloto1234', coins: 0, xp: 0, owned: {}, lastReward: SERVER_TIME });
    // Privacy: never the Google photo.
    expect('photo' in fields).toBe(false);
  });

  it('reward: only reward fields, at most +150 coins, 30 s apart (CONFIG.sync)', () => {
    const fn = ruleFunction('isReward');
    const fields = rewardFields(40, 150, SERVER_TIME);
    expect(fields).toEqual({ coins: 190, lastReward: SERVER_TIME });
    expect(allowedChanges('isReward')).toEqual(['coins', 'lastLogin', 'lastReward', 'level', 'stats', 'streak', 'xp']);
    expect(topLevel(fields).filter((key) => !allowedChanges('isReward').includes(key))).toEqual([]);
    expect(Number(capture(/gain <= (\d+)/, fn))).toBe(CONFIG.sync.maxRewardPerWrite);
    expect(Number(capture(/duration\.value\((\d+), 's'\)/, fn))).toBe(CONFIG.sync.rewardIntervalSeconds);
    expect(fn).toContain('incoming().lastReward == request.time');
  });

  it('purchase: coins, exactly one new owned key (= lastPurchase), price from shop/', () => {
    const fn = ruleFunction('isPurchase');
    const fields = purchaseFields(1000, 'cannon_twin', 900);
    expect(fields).toEqual({ coins: 100, 'owned.cannon_twin': true, lastPurchase: 'cannon_twin' });
    expect(topLevel(fields)).toEqual(allowedChanges('isPurchase'));
    expect(fn).toContain('ownedDiff.addedKeys().hasOnly([id])');
    expect(fn).toContain('incoming().coins == existing().coins - priceFor(id)');
    expect(() => purchaseFields(1000, 'a.b', 10)).toThrow();
  });

  it('equip: only the equipped map', () => {
    expect(topLevel(equipFields({ theme: 'theme_void' }))).toEqual(allowedChanges('isEquip'));
  });

  it('profile: only the name (no photo)', () => {
    expect(allowedChanges('isProfile')).toEqual(['name', 'photo']);
    expect(topLevel(profileFields('Ana'))).toEqual(['name']);
  });
});

describe('shop collection (scripts/seed-shop.ts) ↔ firestore.rules', () => {
  it('has the documents and fields the rules read', () => {
    expect(rules).toContain(`documents/${SHOP}/$(id)`);
    expect(rules).toContain('shopItem(id).price');
    expect(rules).toContain(`documents/${SHOP}/${SHOP_CONFIG_ID}).data.discountOrder`);
    const docs = shopDocuments();
    for (const doc of Object.values(docs.items)) {
      expect(Object.keys(doc).sort()).toEqual(['price', 'rarity', 'type']);
      expect(Number.isInteger(doc.price) && doc.price > 0).toBe(true);
    }
    expect(docs.config.discountOrder).toEqual(DISCOUNT_ORDER);
  });
});

describe('maxPointsPerSecond (theoretical maximum)', () => {
  it('= longest word × armored passes × 10 × 4x × 1.5 / min spawn interval', () => {
    expect(longestWordLength()).toBe(14);
    expect(maxPointsPerSecond(14)).toBeCloseTo((14 * 2 * 10 * 4 * 1.5) / 0.85, 6);
  });

  it('bounds every possible match length, combo ramp included', () => {
    // Fastest possible match: a word every minInterval from firstDelay on, each the most
    // valuable word possible, typed the instant it appears, combo never broken.
    const { firstDelay } = CONFIG.spawn;
    const { minInterval } = CONFIG.waves;
    const perWordAt1x = longestWordLength() * 2 * CONFIG.scoring.pointsPerLetter * CONFIG.scoring.highBonus;
    let score = 0;
    for (let k = 1; k <= 5000; k++) {
      score += perWordAt1x * comboMultiplier(k);
      const time = firstDelay + (k - 1) * minInterval;
      expect(score / time).toBeLessThanOrEqual(MAX_POINTS_PER_SECOND);
    }
  });
});
