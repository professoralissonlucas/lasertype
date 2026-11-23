import { describe, expect, it } from 'vitest';
import { editAction, IDLE_TEXT } from './touchInput.ts';

const char = (value: string) => ({ type: 'char', char: value });

describe('editAction', () => {
  it('turns an added letter into that letter, in lower case', () => {
    expect(editAction(IDLE_TEXT, `${IDLE_TEXT}s`)).toEqual(char('s'));
    expect(editAction(IDLE_TEXT, `${IDLE_TEXT}S`)).toEqual(char('s'));
    expect(editAction('', 'a')).toEqual(char('a'));
  });

  it('follows a composition that keeps growing (the field is not cleared meanwhile)', () => {
    const steps = ['s', 'so', 'sol', 'solm'].map((text) => IDLE_TEXT + text);
    const typed = steps.map((text, i) => editAction(steps[i - 1] ?? IDLE_TEXT, text));
    expect(typed).toEqual([char('s'), char('o'), char('l'), char('m')]);
  });

  it('accepts accented letters, composed or decomposed', () => {
    expect(editAction(IDLE_TEXT, `${IDLE_TEXT}ç`)).toEqual(char('ç'));
    expect(editAction(IDLE_TEXT, `${IDLE_TEXT}ã`)).toEqual(char('ã'));
    expect(editAction(IDLE_TEXT, `${IDLE_TEXT}É`)).toEqual(char('é'));
  });

  it('a dead key (an accent alone) becomes the letter that replaces it', () => {
    expect(editAction(IDLE_TEXT, `${IDLE_TEXT}´`)).toBeNull();
    expect(editAction(`${IDLE_TEXT}´`, `${IDLE_TEXT}á`)).toEqual(char('á'));
  });

  it('Backspace releases the target, also with nothing typed yet', () => {
    expect(editAction(IDLE_TEXT, IDLE_TEXT.slice(1))).toEqual({ type: 'unlock' });
    expect(editAction(`${IDLE_TEXT}so`, `${IDLE_TEXT}s`)).toEqual({ type: 'unlock' });
    // A long press deletes the whole word at once.
    expect(editAction(`${IDLE_TEXT}sol`, '')).toEqual({ type: 'unlock' });
    expect(IDLE_TEXT.length).toBeGreaterThan(0);
  });

  it('the space bar is the EMP, like on a physical keyboard', () => {
    expect(editAction(IDLE_TEXT, `${IDLE_TEXT} `)).toEqual({ type: 'emp' });
    expect(editAction(`${IDLE_TEXT}sol`, `${IDLE_TEXT}sol `)).toEqual({ type: 'emp' });
    // Keyboards that insert a no-break space.
    expect(editAction(IDLE_TEXT, `${IDLE_TEXT} `)).toEqual({ type: 'emp' });
  });

  it('a letter that comes with an automatic space is just the letter', () => {
    expect(editAction(`${IDLE_TEXT}sol`, `${IDLE_TEXT}sol m`)).toEqual(char('m'));
    expect(editAction(IDLE_TEXT, `${IDLE_TEXT}m `)).toEqual(char('m'));
  });

  it('never counts more than one letter per edit: suggestions, swipe, dictation, paste', () => {
    for (const text of ['casa', 'casa ', 'so', 'sol mar', 'ab']) {
      expect(editAction(IDLE_TEXT, IDLE_TEXT + text), text).toBeNull();
    }
    // Completing a word that was being typed.
    expect(editAction(`${IDLE_TEXT}ca`, `${IDLE_TEXT}casa `)).toBeNull();
  });

  it('ignores corrections of what was already typed', () => {
    expect(editAction(`${IDLE_TEXT}teh`, `${IDLE_TEXT}the`)).toBeNull();
    expect(editAction(`${IDLE_TEXT}sol`, `${IDLE_TEXT}Sol `)).toBeNull();
    expect(editAction(`${IDLE_TEXT}a`, `${IDLE_TEXT}ã`)).toBeNull();
  });

  it('ignores digits, punctuation, emoji and edits that change nothing', () => {
    for (const text of ['1', '.', '-', '😀', '\n-']) expect(editAction(IDLE_TEXT, IDLE_TEXT + text), text).toBeNull();
    expect(editAction(IDLE_TEXT, IDLE_TEXT)).toBeNull();
  });

  it('the idle text has no letters of its own', () => {
    expect(editAction('', IDLE_TEXT)?.type).not.toBe('char');
  });
});
