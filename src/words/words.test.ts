import { describe, expect, it } from 'vitest';
import { stripAccents } from '../game/input.ts';
import { getWordList, isLanguage } from './index.ts';
import { DIFFICULTIES, LANGUAGES, type Difficulty } from './types.ts';

const LENGTHS: Record<Difficulty, [number, number]> = {
  easy: [3, 5],
  medium: [6, 8],
  hard: [9, 14],
};

describe.each(LANGUAGES)('word list %s', (lang) => {
  const list = getWordList(lang);
  const all = DIFFICULTIES.flatMap((tier) => list[tier]);

  it('has about 300 words split across 3 tiers', () => {
    for (const tier of DIFFICULTIES) expect(list[tier].length).toBeGreaterThanOrEqual(90);
    expect(all.length).toBeGreaterThanOrEqual(280);
  });

  it('contains only lowercase NFC letters', () => {
    for (const word of all) {
      expect(word, word).toMatch(/^\p{Ll}+$/u);
      expect(word.normalize('NFC'), word).toBe(word);
    }
  });

  it.each(DIFFICULTIES)('%s words have the right length', (tier) => {
    const [min, max] = LENGTHS[tier];
    for (const word of list[tier]) {
      expect([...word].length, word).toBeGreaterThanOrEqual(min);
      expect([...word].length, word).toBeLessThanOrEqual(max);
    }
  });

  it('has no duplicates, even once accents are removed', () => {
    const normalized = all.map(stripAccents);
    const duplicates = normalized.filter((word, i) => normalized.indexOf(word) !== i);
    expect(duplicates).toEqual([]);
  });
});

describe('isLanguage', () => {
  it('accepts supported languages only', () => {
    expect(isLanguage('pt-BR')).toBe(true);
    expect(isLanguage('en')).toBe(true);
    expect(isLanguage('fr')).toBe(false);
  });
});
