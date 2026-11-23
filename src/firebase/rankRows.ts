// Rows of a leaderboard (pure): reading them from untrusted data, places, and the player's own.
import type { RankRow } from './types.ts';

/** Firestore or cached data → a row, or null when it is malformed (it is untrusted input). */
export function parseRow(data: unknown): RankRow | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const { uid, name, score, wpm, accuracy } = d;
  if (typeof uid !== 'string' || typeof name !== 'string' || typeof score !== 'number') return null;
  return {
    uid,
    name,
    score,
    wpm: typeof wpm === 'number' ? wpm : 0,
    accuracy: typeof accuracy === 'number' ? accuracy : 0,
  };
}

/** Places of rows sorted best first: 1 + how many scored more (ties share a place). */
export function placesOf(rows: readonly { readonly score: number }[]): number[] {
  return rows.map((row) => 1 + rows.findIndex((other) => other.score === row.score));
}

/**
 * `rows` (best first, at most `size`) with a player's new record in its place. Unchanged when
 * they already have that score or a better one: scores only go up.
 */
export function withRecord(rows: readonly RankRow[], record: RankRow, size: number): readonly RankRow[] {
  const known = rows.find((row) => row.uid === record.uid);
  if (known && known.score >= record.score) return rows;
  const others = rows.filter((row) => row.uid !== record.uid);
  const below = others.findIndex((row) => row.score < record.score);
  const index = below === -1 ? others.length : below;
  return [...others.slice(0, index), record, ...others.slice(index)].slice(0, size);
}
