import bossesEn from './bosses.en.json';
import bossesPtBR from './bosses.pt-BR.json';
import en from './en.json';
import ptBR from './pt-BR.json';
import { LANGUAGES, type BossPhrases, type Language, type WordList } from './types.ts';

const LISTS: Readonly<Record<Language, WordList>> = {
  'pt-BR': ptBR,
  en,
};

const BOSSES: Readonly<Record<Language, BossPhrases>> = {
  'pt-BR': bossesPtBR,
  en: bossesEn,
};

export function getWordList(lang: Language): WordList {
  return LISTS[lang];
}

export function getBossPhrases(lang: Language): BossPhrases {
  return BOSSES[lang];
}

/** Letters of the longest boss phrase in every language (bounds the points of a boss). */
export function longestBossPhrase(): number {
  let longest = 0;
  for (const lang of LANGUAGES) {
    for (const phrases of Object.values(BOSSES[lang])) {
      for (const phrase of phrases) longest = Math.max(longest, [...phrase.replaceAll(' ', '')].length);
    }
  }
  return longest;
}

/** Length of the longest word in every list (bounds the score per word). */
export function longestWordLength(): number {
  let longest = 0;
  for (const lang of LANGUAGES) {
    for (const words of Object.values(LISTS[lang])) {
      for (const word of words) longest = Math.max(longest, [...word].length);
    }
  }
  return longest;
}

export function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}
