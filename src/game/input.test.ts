import { describe, expect, it } from 'vitest';
import { charsMatch, keyToAction, normalizeText, stripAccents, type KeyLike } from './input.ts';

const LOOSE = { requireAccents: false };
const STRICT = { requireAccents: true };

function key(value: string, mods: Partial<KeyLike> = {}): KeyLike {
  return { key: value, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, ...mods };
}

describe('stripAccents', () => {
  it('removes Portuguese diacritics, including cedilla and tilde', () => {
    expect(stripAccents('ação')).toBe('acao');
    expect(stripAccents('maçã')).toBe('maca');
    expect(stripAccents('ônibus')).toBe('onibus');
    expect(stripAccents('água')).toBe('agua');
    expect(stripAccents('pinguim')).toBe('pinguim');
  });

  it('handles decomposed (NFD) input', () => {
    expect(stripAccents('água')).toBe('agua');
  });
});

describe('normalizeText', () => {
  it('lowercases and strips accents by default', () => {
    expect(normalizeText('AÇÃO', LOOSE)).toBe('acao');
  });

  it('keeps accents when they are required', () => {
    expect(normalizeText('AÇÃO', STRICT)).toBe('ação');
  });

  it('treats composed and decomposed forms as equal', () => {
    expect(normalizeText('á', STRICT)).toBe(normalizeText('á', STRICT));
  });
});

describe('charsMatch', () => {
  it('accepts the plain letter for an accented one by default', () => {
    expect(charsMatch('ç', 'c', LOOSE)).toBe(true);
    expect(charsMatch('ã', 'a', LOOSE)).toBe(true);
    expect(charsMatch('é', 'e', LOOSE)).toBe(true);
  });

  it('also accepts the accented letter itself by default', () => {
    expect(charsMatch('ã', 'ã', LOOSE)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(charsMatch('a', 'A', LOOSE)).toBe(true);
  });

  it('rejects different letters', () => {
    expect(charsMatch('a', 'b', LOOSE)).toBe(false);
  });

  it('requires the exact accent when accents are mandatory', () => {
    expect(charsMatch('ç', 'c', STRICT)).toBe(false);
    expect(charsMatch('ç', 'ç', STRICT)).toBe(true);
    expect(charsMatch('ã', 'á', STRICT)).toBe(false);
  });
});

describe('keyToAction', () => {
  it('maps letters to lowercase char actions', () => {
    expect(keyToAction(key('a'))).toEqual({ type: 'char', char: 'a' });
    expect(keyToAction(key('Q'))).toEqual({ type: 'char', char: 'q' });
  });

  it('accepts accented letters produced by dead keys', () => {
    expect(keyToAction(key('é'))).toEqual({ type: 'char', char: 'é' });
    expect(keyToAction(key('Ç'))).toEqual({ type: 'char', char: 'ç' });
  });

  it('maps control keys', () => {
    expect(keyToAction(key('Backspace'))).toEqual({ type: 'unlock' });
    expect(keyToAction(key('Tab'))).toEqual({ type: 'restart' });
    expect(keyToAction(key('Enter'))).toEqual({ type: 'confirm' });
    expect(keyToAction(key('Escape'))).toEqual({ type: 'pause' });
    expect(keyToAction(key(' '))).toEqual({ type: 'emp' });
  });

  it('with the on-screen keyboard up, only the space bar changes: it is not the EMP', () => {
    expect(keyToAction(key(' '), true)).toBeNull();
    for (const value of ['a', 'É', 'Backspace', 'Tab', 'Enter', 'Escape', '1']) {
      expect(keyToAction(key(value), true), value).toEqual(keyToAction(key(value), false));
    }
  });

  it('ignores non-letter keys', () => {
    for (const value of ['1', '-', 'Dead', 'Shift', 'ArrowLeft', 'F5', 'Process']) {
      expect(keyToAction(key(value))).toBeNull();
    }
  });

  it('ignores browser shortcuts (Ctrl or Meta)', () => {
    expect(keyToAction(key('a', { ctrlKey: true }))).toBeNull();
    expect(keyToAction(key('r', { metaKey: true }))).toBeNull();
    expect(keyToAction(key('Tab', { ctrlKey: true }))).toBeNull();
  });

  it('allows AltGr (Ctrl+Alt) so international layouts can type', () => {
    expect(keyToAction(key('e', { ctrlKey: true, altKey: true }))).toEqual({ type: 'char', char: 'e' });
  });

  it('ignores keys during IME composition', () => {
    expect(keyToAction(key('a', { isComposing: true }))).toBeNull();
  });
});
