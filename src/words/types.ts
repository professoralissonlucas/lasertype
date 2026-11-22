export const LANGUAGES = ['pt-BR', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const BOSS_TIERS = ['small', 'medium', 'large'] as const;
export type BossTier = (typeof BOSS_TIERS)[number];

/** Boss phrases by size: lowercase NFC letters, words separated by single spaces. */
export type BossPhrases = Readonly<Record<BossTier, readonly string[]>>;

/** Words per difficulty tier. Words are lowercase, NFC-normalized, letters only. */
export type WordList = Readonly<Record<Difficulty, readonly string[]>>;
