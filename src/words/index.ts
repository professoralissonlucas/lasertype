import en from './en.json';
import ptBR from './pt-BR.json';
import { LANGUAGES, type Language, type WordList } from './types.ts';

const LISTS: Readonly<Record<Language, WordList>> = {
  'pt-BR': ptBR,
  en,
};

export function getWordList(lang: Language): WordList {
  return LISTS[lang];
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
