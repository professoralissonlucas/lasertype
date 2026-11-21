export const LANGUAGES = ['pt-BR', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Words per difficulty tier. Words are lowercase, NFC-normalized, letters only. */
export type WordList = Readonly<Record<Difficulty, readonly string[]>>;
