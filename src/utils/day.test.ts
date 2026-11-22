import { describe, expect, it } from 'vitest';
import { DAY_MS, dayIndex, dayKey, dayKeyOf, dayStart, msUntilNextDay } from './day.ts';

const at = (iso: string): number => Date.parse(iso);

describe('game day (03:00 UTC = midnight in Brasília)', () => {
  it('turns at 03:00 UTC, not at UTC midnight', () => {
    expect(dayKey(at('2026-11-22T00:30:00Z'))).toBe('2026-11-21');
    expect(dayKey(at('2026-11-22T02:59:59.999Z'))).toBe('2026-11-21');
    expect(dayKey(at('2026-11-22T03:00:00Z'))).toBe('2026-11-22');
    expect(dayKey(at('2026-11-22T23:59:00Z'))).toBe('2026-11-22');
  });

  it('matches midnight in Brasília (UTC−3)', () => {
    expect(dayKey(at('2026-11-21T23:59:59-03:00'))).toBe('2026-11-21');
    expect(dayKey(at('2026-11-22T00:00:00-03:00'))).toBe('2026-11-22');
  });

  it('dayIndex = floor((epochMillis − 3 h) / 86 400 000)', () => {
    for (const iso of ['2026-11-22T03:00:00Z', '2026-01-01T12:34:56Z', '2030-06-15T02:00:00Z']) {
      const t = at(iso);
      expect(dayIndex(t)).toBe(Math.floor((t - 3 * 3_600_000) / 86_400_000));
    }
    expect(dayIndex(at('2026-11-22T03:00:00Z')) - dayIndex(at('2026-11-22T02:59:59Z'))).toBe(1);
  });

  it('dayKeyOf / dayStart agree with dayIndex', () => {
    const day = dayIndex(at('2026-11-22T15:00:00Z'));
    expect(dayKeyOf(day)).toBe('2026-11-22');
    expect(dayStart(day)).toBe(at('2026-11-22T03:00:00Z'));
    expect(dayIndex(dayStart(day))).toBe(day);
    expect(dayIndex(dayStart(day) - 1)).toBe(day - 1);
  });

  it('counts down to the next 03:00 UTC', () => {
    expect(msUntilNextDay(at('2026-11-22T02:00:00Z'))).toBe(3_600_000);
    expect(msUntilNextDay(at('2026-11-22T03:00:00Z'))).toBe(DAY_MS);
    expect(msUntilNextDay(at('2026-11-22T04:00:00Z'))).toBe(23 * 3_600_000);
  });
});
