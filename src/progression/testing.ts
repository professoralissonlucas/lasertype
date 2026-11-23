// Test helpers (never imported by the game).
import type { MatchReport } from '../game/report.ts';
import { dailyMissions, type Mission } from './missions.ts';
import type { MissionMetric } from './types.ts';

/** A plain Survival match; `patch` changes what a test is about. */
export function matchReport(patch: Partial<MatchReport> = {}): MatchReport {
  return {
    mode: 'survival',
    difficulty: 'normal',
    day: 0,
    endReason: 'shield',
    score: 4200,
    grade: 'B',
    destroyed: 40,
    lost: 3,
    accuracy: 0.91,
    wpm: 24.56,
    burst: 41.28,
    defense: 0.93,
    maxCombo: 7,
    wave: 5,
    elapsed: 120,
    letters: 250,
    errors: 20,
    empUses: 1,
    bosses: 0,
    ...patch,
  };
}

/** The first day from `from` on with a mission of this metric, and the mission. */
export function dayWith(metric: MissionMetric, from = 20_000): { readonly day: number; readonly mission: Mission } {
  for (let day = from; day < from + 100; day++) {
    const mission = dailyMissions(day).find((entry) => entry.metric === metric);
    if (mission) return { day, mission };
  }
  throw new Error(`no day with a ${metric} mission`);
}
