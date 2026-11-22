import { describe, expect, it } from 'vitest';
import { MODES } from '../modes/index.ts';
import { buildReport } from './report.ts';
import { createMatchState, type MatchState } from './state.ts';

function finished(patch: (state: MatchState) => void): MatchState {
  const state = createMatchState({ mode: MODES.timeAttack, difficulty: 'hard' });
  state.status = 'gameover';
  state.endReason = 'time';
  patch(state);
  return state;
}

describe('buildReport', () => {
  it('collects the numbers the Mission Report shows', () => {
    const state = finished((s) => {
      s.score = 12345;
      s.elapsed = 60;
      s.wave = 3;
      s.combo = { combo: 4, maxCombo: 21, charge: 0.5 };
      Object.assign(s.stats, { destroyed: 30, breaches: 2, hits: 300, misses: 15, empUses: 1 });
    });
    expect(buildReport(state)).toMatchObject({
      mode: 'timeAttack',
      difficulty: 'hard',
      endReason: 'time',
      score: 12345,
      destroyed: 30,
      lost: 2,
      wpm: 60,
      maxCombo: 21,
      wave: 3,
      elapsed: 60,
      letters: 300,
      errors: 15,
      empUses: 1,
    });
    const report = buildReport(state);
    expect(report.accuracy).toBeCloseTo(300 / 315);
    expect(report.defense).toBeCloseTo(30 / 32);
  });

  it('keeps the game day of a Daily Challenge (0 in the other modes)', () => {
    expect(buildReport(createMatchState({ mode: MODES.daily, day: 20779 }))).toMatchObject({ mode: 'daily', day: 20779 });
    expect(buildReport(createMatchState({ mode: MODES.survival })).day).toBe(0);
  });

  it('grades the match', () => {
    const great = finished((s) => {
      s.elapsed = 60;
      Object.assign(s.stats, { destroyed: 50, breaches: 0, hits: 350, misses: 2 });
    });
    expect(buildReport(great).grade).toBe('S');

    const poor = finished((s) => {
      s.elapsed = 60;
      Object.assign(s.stats, { destroyed: 6, breaches: 6, hits: 40, misses: 40 });
    });
    expect(buildReport(poor).grade).toBe('D');
  });

  it('a match that never started still produces a valid report', () => {
    const report = buildReport(createMatchState());
    expect(report).toMatchObject({ score: 0, grade: 'D', wpm: 0, accuracy: 0, wave: 1, endReason: 'quit' });
  });
});
