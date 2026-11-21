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

export function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}
