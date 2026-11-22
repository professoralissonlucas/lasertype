import { describe, expect, it } from 'vitest';
import { stripAccents } from '../game/input.ts';
import { getBossPhrases, getWordList, isLanguage, longestBossPhrase } from './index.ts';
import { BOSS_TIERS, DIFFICULTIES, LANGUAGES, type BossTier, type Difficulty } from './types.ts';

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

/** Letters per phrase, spaces excluded. */
const BOSS_LETTERS: Record<BossTier, [number, number]> = {
  small: [24, 30],
  medium: [32, 39],
  large: [40, 48],
};

describe.each(LANGUAGES)('boss phrases %s', (lang) => {
  const phrases = getBossPhrases(lang);
  const all = BOSS_TIERS.flatMap((tier) => phrases[tier]);

  it('has 8 phrases per size, all different', () => {
    for (const tier of BOSS_TIERS) expect(phrases[tier]).toHaveLength(8);
    expect(new Set(all.map(stripAccents)).size).toBe(all.length);
  });

  it('only lowercase NFC letters and single spaces, words of 2 to 14 letters', () => {
    for (const phrase of all) {
      expect(phrase, phrase).toMatch(/^\p{Ll}{2,14}( \p{Ll}{2,14})+$/u);
      expect(phrase.normalize('NFC'), phrase).toBe(phrase);
    }
  });

  it.each(BOSS_TIERS)('%s phrases have the right size', (tier) => {
    const [min, max] = BOSS_LETTERS[tier];
    for (const phrase of phrases[tier]) {
      const letters = [...phrase.replaceAll(' ', '')].length;
      expect(letters, phrase).toBeGreaterThanOrEqual(min);
      expect(letters, phrase).toBeLessThanOrEqual(max);
      const words = phrase.split(' ').length;
      expect(words, phrase).toBeGreaterThanOrEqual(4);
      expect(words, phrase).toBeLessThanOrEqual(9);
    }
  });
});

it('longestBossPhrase counts letters only', () => {
  const lengths = LANGUAGES.flatMap((lang) => Object.values(getBossPhrases(lang)).flat()).map((p) => p.replaceAll(' ', '').length);
  expect(longestBossPhrase()).toBe(Math.max(...lengths));
});

describe('isLanguage', () => {
  it('accepts supported languages only', () => {
    expect(isLanguage('pt-BR')).toBe(true);
    expect(isLanguage('en')).toBe(true);
    expect(isLanguage('fr')).toBe(false);
  });
});
