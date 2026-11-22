// Seedable PRNG (mulberry32). All gameplay randomness must go through here so that
// a given seed (e.g. the Daily Challenge date) produces the same match for everyone.

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** Uniformly picks one element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
}

/** FNV-1a 32-bit hash, used to turn string seeds (e.g. "2026-11-21") into numbers. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Stateless hash of two integers to a float in [0, 1): random-looking, the same every
 * time. For visual effects redrawn each frame from an index (e.g. the sparks of shot n),
 * where keeping an Rng per effect would mean allocating.
 */
export function hashUnit(seed: number, salt: number): number {
  let t = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul((salt | 0) + 0x632be5ab, 0x85ebca6b)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x7feb352d);
  t = Math.imul(t ^ (t >>> 15), 0x846ca68b);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

export function createRng(seed: number | string): Rng {
  let state = (typeof seed === 'string' ? hashString(seed) : Math.trunc(seed)) >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick<T>(items: readonly T[]): T {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error('rng.pick: empty array');
      return item;
    },
  };
}

/** A shuffled copy of `items` (Fisher–Yates driven by `rng`; the input is not changed). */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

/**
 * Picks a key with probability proportional to its weight. `keys` fixes the iteration
 * order so results never depend on object key order. Non-positive weights are never picked.
 */
export function pickWeighted<K extends string>(
  rng: Rng,
  keys: readonly K[],
  weights: Readonly<Record<K, number>>,
): K {
  let total = 0;
  for (const key of keys) total += Math.max(0, weights[key]);
  if (total <= 0) throw new Error('pickWeighted: no positive weight');

  let roll = rng.next() * total;
  let last: K | null = null;
  for (const key of keys) {
    const weight = Math.max(0, weights[key]);
    if (weight === 0) continue;
    roll -= weight;
    last = key;
    if (roll < 0) return key;
  }
  // Floating-point leftovers: fall back to the last eligible key.
  if (last === null) throw new Error('pickWeighted: no positive weight');
  return last;
}
