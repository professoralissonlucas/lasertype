// Texts about missions, achievements and collections (pure: no DOM), shared by the Progress
// screen, the Mission Report, the shop and the notices.
import { CONFIG } from '../config.ts';
import { getItem } from '../cosmetics/catalog.ts';
import { collectionOfTitle } from '../cosmetics/collections.ts';
import type { Equipped } from '../economy/types.ts';
import type { Achievement } from '../progression/achievements.ts';
import type { Mission } from '../progression/missions.ts';
import type { MissionMetric } from '../progression/types.ts';
import type { Language } from '../words/types.ts';
import { ACHIEVEMENT_DESCRIPTION, ACHIEVEMENT_NAME, MISSION_LABEL, TYPE_LABEL, type Translate } from './i18n.ts';

type Format = (value: number) => string;

/** Words a match needs for the missions that ask for a minimum. */
function minWords(metric: MissionMetric): number {
  const { minWordsPlayed, minWordsAccuracy } = CONFIG.progression.missions;
  return metric === 'accuracy' ? minWordsAccuracy : minWordsPlayed;
}

export function missionText(t: Translate, format: Format, mission: Mission): string {
  return t(MISSION_LABEL[mission.metric], { n: format(mission.target), min: minWords(mission.metric) });
}

export function achievementName(t: Translate, achievement: Achievement): string {
  return t(ACHIEVEMENT_NAME[achievement.id]);
}

export function achievementDescription(t: Translate, achievement: Achievement): string {
  return t(ACHIEVEMENT_DESCRIPTION[achievement.id], { n: achievement.target });
}

/** "Canhão Dourado": the category and the name ('' for an unknown item). */
export function itemFullName(t: Translate, language: Language, itemId: string): string {
  const item = getItem(itemId);
  return item ? `${t(TYPE_LABEL[item.type])} ${item.name[language]}` : '';
}

/** The title being worn, null without one. */
export function titleText(language: Language, equipped: Equipped): string | null {
  return (equipped.title !== undefined && collectionOfTitle(equipped.title)?.title[language]) || null;
}
