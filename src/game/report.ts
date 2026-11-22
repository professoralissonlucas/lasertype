// Mission Report numbers (pure): everything the end screen shows, computed from the match.
import type { ModeId } from '../modes/types.ts';
import { accuracyOf, defenseRate, gradeFor, wordsPerMinute } from './scoring.ts';
import type { MatchState } from './state.ts';
import type { EndReason, GameDifficulty, Grade } from './types.ts';

export interface MatchReport {
  readonly mode: ModeId;
  readonly difficulty: GameDifficulty;
  readonly endReason: EndReason;
  readonly score: number;
  readonly grade: Grade;
  readonly destroyed: number;
  /** Words that crossed the perimeter. */
  readonly lost: number;
  readonly accuracy: number;
  readonly wpm: number;
  readonly defense: number;
  readonly maxCombo: number;
  readonly wave: number;
  readonly elapsed: number;
  /** Correct letters. */
  readonly letters: number;
  /** Wrong keys. */
  readonly errors: number;
  readonly empUses: number;
}

export function buildReport(state: Readonly<MatchState>): MatchReport {
  const { stats } = state;
  const accuracy = accuracyOf(stats.hits, stats.misses);
  const wpm = wordsPerMinute(stats.hits, state.elapsed);
  const defense = defenseRate(stats.destroyed, stats.breaches);
  return {
    mode: state.mode.id,
    difficulty: state.difficulty,
    endReason: state.endReason ?? 'quit',
    score: state.score,
    grade: gradeFor({ accuracy, wpm, defense, destroyed: stats.destroyed }),
    destroyed: stats.destroyed,
    lost: stats.breaches,
    accuracy,
    wpm,
    defense,
    maxCombo: state.combo.maxCombo,
    wave: Math.max(1, state.wave),
    elapsed: state.elapsed,
    letters: stats.hits,
    errors: stats.misses,
    empUses: stats.empUses,
  };
}
