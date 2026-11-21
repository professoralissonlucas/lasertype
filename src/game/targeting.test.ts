import { describe, expect, it } from 'vitest';
import { pickTarget, resolveKey, type TypedCandidate } from './targeting.ts';

const LOOSE = { requireAccents: false };
const STRICT = { requireAccents: true };

function word(id: number, text: string, y: number, typed = 0): TypedCandidate {
  return { id, text, y, typed };
}

describe('pickTarget', () => {
  it('picks the word closest to the perimeter among those starting with the letter', () => {
    const words = [word(1, 'sol', 0.2), word(2, 'sal', 0.7), word(3, 'sapo', 0.5), word(4, 'mar', 0.9)];
    expect(pickTarget(words, 's', LOOSE)?.id).toBe(2);
  });

  it('ignores closer words that start with another letter', () => {
    const words = [word(1, 'mar', 0.95), word(2, 'sol', 0.1)];
    expect(pickTarget(words, 's', LOOSE)?.id).toBe(2);
  });

  it('returns null when no word starts with the letter', () => {
    expect(pickTarget([word(1, 'mar', 0.5)], 'x', LOOSE)).toBeNull();
    expect(pickTarget([], 'a', LOOSE)).toBeNull();
  });

  it('breaks ties by the oldest word (lowest id)', () => {
    const words = [word(7, 'lua', 0.5), word(3, 'luz', 0.5)];
    expect(pickTarget(words, 'l', LOOSE)?.id).toBe(3);
  });

  it('matches accented first letters without the accent by default', () => {
    expect(pickTarget([word(1, 'água', 0.4)], 'a', LOOSE)?.id).toBe(1);
    expect(pickTarget([word(1, 'água', 0.4)], 'a', STRICT)).toBeNull();
    expect(pickTarget([word(1, 'água', 0.4)], 'á', STRICT)?.id).toBe(1);
  });
});

describe('resolveKey', () => {
  it('locks a new target on its first letter', () => {
    const words = [word(1, 'gato', 0.3), word(2, 'gelo', 0.6)];
    const outcome = resolveKey(words, null, 'g', LOOSE);
    expect(outcome).toMatchObject({ kind: 'hit', index: 0, newLock: true, completed: false });
    expect(outcome.word?.id).toBe(2);
  });

  it('is a miss with no word when nothing matches and nothing is locked', () => {
    expect(resolveKey([word(1, 'gato', 0.3)], null, 'z', LOOSE)).toEqual({ kind: 'miss', word: null });
  });

  it('hits the next letter of the locked word', () => {
    const words = [word(1, 'gato', 0.3, 2)];
    const outcome = resolveKey(words, 1, 't', LOOSE);
    expect(outcome).toMatchObject({ kind: 'hit', index: 2, newLock: false, completed: false });
  });

  it('flags completion on the last letter', () => {
    const outcome = resolveKey([word(1, 'gato', 0.3, 3)], 1, 'o', LOOSE);
    expect(outcome).toMatchObject({ kind: 'hit', index: 3, completed: true });
  });

  it('keeps the lock on a wrong letter', () => {
    const words = [word(1, 'gato', 0.3, 1)];
    const outcome = resolveKey(words, 1, 'x', LOOSE);
    expect(outcome.kind).toBe('miss');
    expect(outcome.word?.id).toBe(1);
  });

  it('does not switch targets while locked, even if another word starts with the key', () => {
    const words = [word(1, 'gato', 0.3, 1), word(2, 'mar', 0.9)];
    const outcome = resolveKey(words, 1, 'm', LOOSE);
    expect(outcome.kind).toBe('miss');
    expect(outcome.word?.id).toBe(1);
  });

  it('accepts unaccented letters inside the locked word by default', () => {
    const words = [word(1, 'ação', 0.3, 1)];
    expect(resolveKey(words, 1, 'c', LOOSE).kind).toBe('hit');
    expect(resolveKey(words, 1, 'c', STRICT).kind).toBe('miss');
    expect(resolveKey(words, 1, 'ç', STRICT).kind).toBe('hit');
  });

  it('falls back to picking a new target when the locked word is gone', () => {
    const outcome = resolveKey([word(2, 'mar', 0.5)], 99, 'm', LOOSE);
    expect(outcome).toMatchObject({ kind: 'hit', newLock: true });
    expect(outcome.word?.id).toBe(2);
  });

  it('does not mutate the words', () => {
    const words = [word(1, 'gato', 0.3)];
    resolveKey(words, null, 'g', LOOSE);
    expect(words[0]?.typed).toBe(0);
  });
});
