import { describe, expect, it } from 'vitest';
import { GRADES } from '../game/types.ts';
import { MODE_IDS } from '../modes/types.ts';
import { matchReward } from './rewards.ts';

describe('matchReward', () => {
  it('gives floor(points / 100) coins plus the grade bonus', () => {
    expect(matchReward({ score: 3456, grade: 'A', mode: 'survival' })).toEqual({
      fromScore: 34,
      gradeBonus: 10,
      factor: 1,
      total: 44,
    });
    expect(matchReward({ score: 99, grade: 'D', mode: 'survival' }).total).toBe(0);
    expect(matchReward({ score: 100, grade: 'D', mode: 'survival' }).total).toBe(1);
  });

  it('uses the bonus table S +20, A +10, B +5, C/D +0', () => {
    const bonus = (grade: (typeof GRADES)[number]) => matchReward({ score: 0, grade, mode: 'timeAttack' }).gradeBonus;
    expect(GRADES.map(bonus)).toEqual([20, 10, 5, 0, 0]);
  });

  it('caps the score part at 80 coins (the grade bonus comes on top)', () => {
    expect(matchReward({ score: 8000, grade: 'C', mode: 'survival' }).fromScore).toBe(80);
    expect(matchReward({ score: 1_000_000, grade: 'S', mode: 'survival' })).toMatchObject({ fromScore: 80, total: 100 });
  });

  it('pays 25% in Zen, rounded down (bonus included)', () => {
    expect(matchReward({ score: 3000, grade: 'B', mode: 'zen' })).toEqual({
      fromScore: 30,
      gradeBonus: 5,
      factor: 0.25,
      total: 8, // floor(35 × 0.25)
    });
    expect(matchReward({ score: 1_000_000, grade: 'S', mode: 'zen' }).total).toBe(25);
  });

  it('Survival and Time Attack pay in full', () => {
    expect(matchReward({ score: 5000, grade: 'A', mode: 'timeAttack' }).total).toBe(60);
    expect(matchReward({ score: 5000, grade: 'A', mode: 'survival' }).total).toBe(60);
  });

  it('treats negative or invalid scores as zero', () => {
    expect(matchReward({ score: -500, grade: 'D', mode: 'survival' }).total).toBe(0);
    expect(matchReward({ score: Number.NaN, grade: 'B', mode: 'survival' })).toMatchObject({ fromScore: 0, total: 5 });
  });

  it('never exceeds the 150-coins-per-write limit of the future Firestore rules', () => {
    for (const mode of MODE_IDS) {
      for (const grade of GRADES) {
        const { total } = matchReward({ score: Number.MAX_SAFE_INTEGER, grade, mode });
        expect(total).toBeLessThanOrEqual(150);
        expect(Number.isInteger(total)).toBe(true);
      }
    }
  });
});
