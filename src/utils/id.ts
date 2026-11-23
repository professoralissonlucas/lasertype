/**
 * An id no other device will come up with (64 random bits). Not gameplay randomness: it must be
 * different everywhere, so it never comes from the seedable rng.
 */
export function uniqueId(): string {
  const words = crypto.getRandomValues(new Uint32Array(2));
  return Array.from(words, (word) => word.toString(36).padStart(7, '0')).join('');
}
