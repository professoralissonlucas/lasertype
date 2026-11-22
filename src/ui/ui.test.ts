import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../words/types.ts';
import { createBoss } from '../game/boss.ts';
import { CombatLogModel, logEntryOf } from './combatLog.ts';
import { dailyPlaceText } from './dailyText.ts';
import { createTranslator, interpolate, STRING_KEYS } from './i18n.ts';

describe('i18n', () => {
  const pt = createTranslator('pt-BR');
  const en = createTranslator('en');

  it('translates and fills placeholders', () => {
    expect(pt('waveBanner', { n: 3 })).toBe('Onda 3');
    expect(en('waveBanner', { n: 3 })).toBe('Wave 3');
  });

  it('leaves unknown placeholders alone', () => {
    expect(interpolate('{a} and {b}', { a: 1 })).toBe('1 and {b}');
    expect(interpolate('no vars')).toBe('no vars');
  });

  it('every language has a non-empty text for every key, with the same placeholders', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(STRING_KEYS.length).toBeGreaterThan(50);
    for (const lang of LANGUAGES) {
      const t = createTranslator(lang);
      for (const key of STRING_KEYS) {
        expect(t(key).length, `${lang}.${key}`).toBeGreaterThan(0);
        expect(placeholders(t(key)), `${lang}.${key}`).toEqual(placeholders(pt(key)));
      }
    }
  });
});

describe('dailyPlaceText', () => {
  const pt = createTranslator('pt-BR');
  const en = createTranslator('en');

  it('tells the place and the bonus it would pay', () => {
    expect(dailyPlaceText(pt, String, 3, 5000, 'pt-BR')).toBe('Você está em 3º hoje. +100 moedas se terminar assim.');
    expect(dailyPlaceText(en, String, 1, 5000, 'pt-BR')).toBe('You are #1 today. +150 coins if it ends like this.');
  });

  it('only the place when there is no bonus (place, score or language)', () => {
    for (const text of [
      dailyPlaceText(pt, String, 51, 5000, 'pt-BR'),
      dailyPlaceText(pt, String, 51, 10, 'pt-BR'),
      dailyPlaceText(pt, String, 51, 5000, 'en'),
    ]) {
      expect(text).toBe('Você está em 51º hoje.');
    }
    expect(dailyPlaceText(pt, String, 1, 5000, 'en')).toBe('Você está em 1º hoje.');
    expect(dailyPlaceText(pt, String, 1, 10, 'pt-BR')).toBe('Você está em 1º hoje.');
  });
});

describe('logEntryOf', () => {
  const boss = createBoss({ kind: 'boss', number: 2, phrase: 'sol mar', speed: 0.1 });
  const name = (n: number) => `Boss ${n}`;

  it('logs the words of a boss and the bonus for defeating it', () => {
    expect(logEntryOf({ type: 'bossWord', boss, word: 0, text: 'sol', points: 90, multiplier: 3, cause: 'typed' }, name)).toEqual({
      text: 'sol',
      kind: 'boss',
      cause: 'typed',
      points: 90,
      multiplier: 3,
    });
    expect(logEntryOf({ type: 'bossDefeated', boss, points: 1500 }, name)).toMatchObject({ text: 'Boss 2', cause: 'bonus', points: 1500 });
  });

  it('ignores everything else', () => {
    expect(logEntryOf({ type: 'bossAlert', boss }, name)).toBeNull();
    expect(logEntryOf({ type: 'wave', wave: 2 }, name)).toBeNull();
  });
});

describe('CombatLogModel', () => {
  const kill = (text: string, points = 10) =>
    ({ text, kind: 'normal', cause: 'typed', points, multiplier: 1 }) as const;

  it('keeps the newest entry first', () => {
    const log = new CombatLogModel(5);
    log.add(kill('sol'));
    log.add(kill('lua'));
    expect(log.entries.map((e) => e.text)).toEqual(['lua', 'sol']);
  });

  it('drops the oldest entries beyond capacity', () => {
    const log = new CombatLogModel(3);
    for (const text of ['a', 'b', 'c', 'd', 'e']) log.add(kill(text));
    expect(log.entries.map((e) => e.text)).toEqual(['e', 'd', 'c']);
  });

  it('gives every entry a unique id and keeps its details', () => {
    const log = new CombatLogModel(5);
    const a = log.add(kill('sol', 30));
    const b = log.add({ text: 'mar', kind: 'bomb', cause: 'emp', points: 15, multiplier: 2 });
    expect(a.id).not.toBe(b.id);
    expect(b).toMatchObject({ text: 'mar', kind: 'bomb', cause: 'emp', points: 15, multiplier: 2 });
  });

  it('clear() empties the log', () => {
    const log = new CombatLogModel(5);
    log.add(kill('sol'));
    log.clear();
    expect(log.entries).toEqual([]);
  });
});
