import { describe, expect, it } from 'vitest';
import { createIntegerFormatter, formatCountdown, formatPercent, formatTime } from './format.ts';
import { aimAngle, clamp, lerp } from './math.ts';

describe('math', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('lerps', () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  it('aims with 0 = up and positive = right', () => {
    expect(aimAngle(0, 0, 0, -10)).toBeCloseTo(0);
    expect(aimAngle(0, 0, 10, -10)).toBeCloseTo(Math.PI / 4);
    expect(aimAngle(0, 0, -10, -10)).toBeCloseTo(-Math.PI / 4);
  });
});

describe('format', () => {
  it('formats time as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(75.9)).toBe('1:15');
    expect(formatTime(600)).toBe('10:00');
  });

  it('formats scores with the locale thousands separator', () => {
    expect(createIntegerFormatter('pt-BR')(12340)).toBe('12.340');
    expect(createIntegerFormatter('en')(12340)).toBe('12,340');
    expect(createIntegerFormatter('en')(7.6)).toBe('8');
  });

  it('formats ratios as whole percentages', () => {
    expect(formatPercent(0.934)).toBe('93%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0)).toBe('0%');
  });
});

describe('formatCountdown', () => {
  it('formats milliseconds as h:mm:ss, rounding up to the second', () => {
    expect(formatCountdown(0)).toBe('0:00:00');
    expect(formatCountdown(999)).toBe('0:00:01');
    expect(formatCountdown((5 * 3600 + 3 * 60 + 9) * 1000)).toBe('5:03:09');
    expect(formatCountdown(24 * 3600 * 1000)).toBe('24:00:00');
    expect(formatCountdown(-5)).toBe('0:00:00');
  });
});
