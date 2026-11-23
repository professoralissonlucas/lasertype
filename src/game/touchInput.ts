// Typing through the on-screen keyboard of a phone (pure).
//
// Those keyboards often send key presses without a letter (key "Unidentified"), so the letter
// comes from how the text of a hidden field changed. One edit is worth at most ONE letter:
// suggestions, swipe typing, dictation and pasting bring several at once and are ignored
// (they would type whole words by themselves and inflate the WPM of the ranking).
import { isLetter, type InputAction } from './input.ts';

/** What the field holds while idle: something for Backspace to delete, and no letters. */
export const IDLE_TEXT = '  ';

function lettersOf(text: string): string[] {
  return [...text.normalize('NFC')].filter(isLetter);
}

/** What the player did when the field went from `previous` to `next`; null = nothing for the game. */
export function editAction(previous: string, next: string): InputAction | null {
  let common = 0;
  while (common < previous.length && common < next.length && previous[common] === next[common]) common++;
  const removed = previous.slice(common);
  const added = next.slice(common);

  if (added === '') return removed === '' ? null : { type: 'unlock' };

  const letters = lettersOf(added);
  if (letters.length === 0) {
    // The space bar, like on a physical keyboard. Anything else (digits, punctuation) is ignored.
    return removed === '' && added.trim() === '' ? { type: 'emp' } : null;
  }
  // Letters replaced by others: the keyboard correcting or completing what was already typed.
  if (lettersOf(removed).length > 0) return null;
  const [letter] = letters;
  if (letters.length > 1 || letter === undefined) return null;
  return { type: 'char', char: letter.toLowerCase() };
}
