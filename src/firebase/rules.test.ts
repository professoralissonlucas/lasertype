// firestore.rules is the contract: these tests fail when the client and the rules drift
// apart (identifier lists, limits, maxPointsPerSecond, day arithmetic, discount, doc id).
import { describe, expect, it } from 'vitest';
import rules from '../../firestore.rules?raw';
import { CONFIG } from '../config.ts';
import { comboMultiplier, maxPointsPerSecond } from '../game/scoring.ts';
import { GAME_DIFFICULTIES } from '../game/types.ts';
import { DAY_MS, DAY_START_OFFSET_MS } from '../utils/day.ts';
import { longestWordLength } from '../words/index.ts';
import { LANGUAGES } from '../words/types.ts';
import { buildScore, MAX_POINTS_PER_SECOND, scoreDocId } from './leaderboard.ts';
import { RANKED_MODES } from './types.ts';

/** First capture group of `pattern` in the rules (fails loudly when the rules changed shape). */
function capture(pattern: RegExp): string {
  const match = pattern.exec(rules);
  if (!match?.[1]) throw new Error(`firestore.rules: no match for ${pattern}`);
  return match[1];
}

/** `['a', 'b']` → ['a', 'b'] */
function list(pattern: RegExp): string[] {
  return [...capture(pattern).matchAll(/'([^']*)'/g)].map((m) => m[1] ?? '');
}

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
    const { discountKeepTenths, discountStep } = CONFIG.economy;
    expect([discountKeepTenths, 10 * discountStep, discountStep]).toEqual([7, 100, 10]);
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
