import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config.ts';
import {
  accuracyOf,
  areaKillPoints,
  comboMultiplier,
  defenseRate,
  gradeFor,
  gradeScore,
  heightBonus,
  nextTierAt,
  wordPoints,
  wordsPerMinute,
} from './scoring.ts';

describe('typing stats', () => {
  it('accuracy = hits / (hits + misses), 0 with no keys', () => {
    expect(accuracyOf(9, 1)).toBeCloseTo(0.9);
    expect(accuracyOf(0, 0)).toBe(0);
  });

  it('WPM = (letters / 5) per minute', () => {
    expect(wordsPerMinute(250, 60)).toBe(50);
    expect(wordsPerMinute(100, 30)).toBe(40);
  });

  it('WPM is 0 during the first second (no spikes)', () => {
    expect(wordsPerMinute(3, 0.5)).toBe(0);
  });

  it('defense = destroyed / (destroyed + lost)', () => {
    expect(defenseRate(9, 1)).toBeCloseTo(0.9);
    expect(defenseRate(0, 0)).toBe(0);
  });
});

describe('grade', () => {
  const perfect = { accuracy: 1, wpm: 80, defense: 1, destroyed: 40 };

  it('weights accuracy 40%, speed 35% (capped at the target WPM) and defense 25%', () => {
    expect(gradeScore(perfect)).toBeCloseTo(1);
    expect(gradeScore({ accuracy: 1, wpm: 0, defense: 0, destroyed: 10 })).toBeCloseTo(0.4);
    expect(gradeScore({ accuracy: 0, wpm: 30, defense: 0, destroyed: 10 })).toBeCloseTo(0.175);
    expect(gradeScore({ accuracy: 0, wpm: 0, defense: 1, destroyed: 10 })).toBeCloseTo(0.25);
  });

  it.each([
    [{ accuracy: 1, wpm: 60, defense: 1, destroyed: 30 }, 'S'],
    [{ accuracy: 0.95, wpm: 45, defense: 0.9, destroyed: 30 }, 'A'],
    [{ accuracy: 0.9, wpm: 30, defense: 0.8, destroyed: 30 }, 'B'],
    [{ accuracy: 0.8, wpm: 20, defense: 0.6, destroyed: 30 }, 'C'],
    [{ accuracy: 0.5, wpm: 10, defense: 0.3, destroyed: 30 }, 'D'],
  ] as const)('%o → %s', (input, grade) => {
    expect(gradeFor(input)).toBe(grade);
  });

  it('is a D with too few words destroyed, however good the rest', () => {
    expect(gradeFor({ ...perfect, destroyed: CONFIG.grading.minWords - 1 })).toBe('D');
    expect(gradeFor({ ...perfect, destroyed: CONFIG.grading.minWords })).toBe('S');
  });

  it('grade boundaries are inclusive', () => {
    const grading = { ...CONFIG.grading, weights: { accuracy: 1, speed: 0, defense: 0 } };
    expect(gradeFor({ accuracy: 0.9, wpm: 0, defense: 0, destroyed: 10 }, grading)).toBe('S');
    expect(gradeFor({ accuracy: 0.8999, wpm: 0, defense: 0, destroyed: 10 }, grading)).toBe('A');
  });
});

describe('comboMultiplier', () => {
  it.each([
    [0, 1],
    [4, 1],
    [5, 2],
    [14, 2],
    [15, 3],
    [29, 3],
    [30, 4],
    [500, 4],
  ])('combo %i → %ix', (combo, multiplier) => {
    expect(comboMultiplier(combo)).toBe(multiplier);
  });

  it('works with custom tiers', () => {
    const tiers = [
      { min: 0, multiplier: 1 },
      { min: 2, multiplier: 10 },
    ];
    expect(comboMultiplier(1, tiers)).toBe(1);
    expect(comboMultiplier(2, tiers)).toBe(10);
  });
});

describe('nextTierAt', () => {
  it('tells how far the next multiplier is', () => {
    expect(nextTierAt(0)).toBe(5);
    expect(nextTierAt(5)).toBe(15);
    expect(nextTierAt(29)).toBe(30);
    expect(nextTierAt(30)).toBeNull();
  });
});

describe('heightBonus', () => {
  it('is 1.5 in the upper half of the field and 1.0 below', () => {
    expect(heightBonus(0)).toBe(1.5);
    expect(heightBonus(0.49)).toBe(1.5);
    expect(heightBonus(0.5)).toBe(1);
    expect(heightBonus(0.99)).toBe(1);
  });
});

describe('wordPoints', () => {
  it('is letters × 10 × multiplier × height bonus', () => {
    expect(wordPoints(5, 1, 0.8)).toBe(50);
    expect(wordPoints(5, 3, 0.8)).toBe(150);
    expect(wordPoints(5, 3, 0.2)).toBe(225);
    expect(wordPoints(12, 4, 0.1)).toBe(720);
  });

  it('counts both passes of an armored word', () => {
    expect(wordPoints(2 * 4, 1, 0.8)).toBe(80);
  });

  it('respects a custom scoring config', () => {
    const scoring = { ...CONFIG.scoring, pointsPerLetter: 1, highBonus: 2 };
    expect(wordPoints(3, 2, 0.1, scoring)).toBe(12);
  });

  it('always returns whole points', () => {
    expect(Number.isInteger(wordPoints(7, 3, 0.3))).toBe(true);
  });
});

describe('areaKillPoints', () => {
  it('is half of the normal points (bomb and EMP kills)', () => {
    expect(areaKillPoints(4, 2, 0.8)).toBe(40);
    expect(areaKillPoints(4, 2, 0.2)).toBe(60);
    expect(areaKillPoints(3, 1, 0.8)).toBe(15);
  });

  it('rounds to whole points', () => {
    expect(areaKillPoints(3, 1, 0.2)).toBe(23); // 22.5
  });
});
