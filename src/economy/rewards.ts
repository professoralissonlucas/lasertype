// Coins per match (pure). Missions, streak and XP: only their users/{uid} fields exist so far.
import { CONFIG } from '../config.ts';
import type { Grade } from '../game/types.ts';
import type { ModeId } from '../modes/types.ts';
import type { EconomyConfig, MatchReward } from './types.ts';

export interface RewardInput {
  readonly score: number;
  readonly grade: Grade;
  readonly mode: ModeId;
}

/** min(floor(points / 100), 80) + grade bonus (S +20, A +10, B +5), × the mode factor (Zen 25%). */
export function matchReward(input: RewardInput, config: EconomyConfig = CONFIG.economy): MatchReward {
  const score = Number.isFinite(input.score) ? Math.max(0, input.score) : 0;
  const fromScore = Math.min(Math.floor(score / config.pointsPerCoin), config.maxScoreCoins);
  const gradeBonus = config.gradeBonus[input.grade];
  const factor = config.modeFactor[input.mode];
  return { fromScore, gradeBonus, factor, total: Math.floor((fromScore + gradeBonus) * factor) };
}
