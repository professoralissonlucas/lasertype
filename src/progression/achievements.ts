// Achievements (pure data): each one unlocks an item that is never sold (price null in the
// catalog, `unlock` = the achievement's id). How far the player is comes from the lifetime
// statistics, what each one asks for from CONFIG.progression.achievements.
import { CONFIG } from '../config.ts';
import type { ProgressionConfig, Stats } from './types.ts';

export type AchievementId = keyof ProgressionConfig['achievements'];

export interface Achievement {
  readonly id: AchievementId;
  readonly itemId: string;
  readonly stat: keyof Stats;
  readonly target: number;
}

const achievement = (id: AchievementId, itemId: string, stat: keyof Stats): Achievement => ({
  id,
  itemId,
  stat,
  target: CONFIG.progression.achievements[id],
});

export const ACHIEVEMENTS: readonly Achievement[] = [
  achievement('lightning', 'cannon_golden', 'bestBurst'),
  achievement('frontline', 'theme_eclipse', 'bestWave'),
  achievement('flawless', 'laser_aurum', 'bestCombo'),
  achievement('bossHunter', 'explosion_fireworks', 'bosses'),
  achievement('loyal', 'border_golden', 'bestStreak'),
];

/** The achievement that unlocks an item, if any. */
export function achievementFor(itemId: string): Achievement | undefined {
  return ACHIEVEMENTS.find((entry) => entry.itemId === itemId);
}

export function isAchieved({ stat, target }: Achievement, stats: Stats): boolean {
  return stats[stat] >= target;
}
