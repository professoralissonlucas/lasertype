// Procedural "Orbital Defense" background: a nebula and parallax star layers.
// Pure (no DOM): the renderer turns this data into pixels.
import { lerp } from '../../utils/math.ts';
import type { Rng } from '../../utils/rng.ts';

// ---------- Noise ----------

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function wrap(i: number, period: number): number {
  return ((i % period) + period) % period;
}

/** Value noise on a `period`×`period` lattice that repeats seamlessly on both axes. */
export class PeriodicNoise {
  private readonly values: Float32Array;
  private readonly period: number;

  constructor(rng: Rng, period: number) {
    this.period = period;
    this.values = new Float32Array(period * period);
    for (let i = 0; i < this.values.length; i++) this.values[i] = rng.next();
  }

  private at(ix: number, iy: number): number {
    return this.values[wrap(iy, this.period) * this.period + wrap(ix, this.period)] ?? 0;
  }

  /** Smooth value in [0, 1]. `u`, `v` are in lattice cells (the pattern repeats every `period`). */
  sample(u: number, v: number): number {
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const fx = smoothstep(0, 1, u - x0);
    const fy = smoothstep(0, 1, v - y0);
    const top = lerp(this.at(x0, y0), this.at(x0 + 1, y0), fx);
    const bottom = lerp(this.at(x0, y0 + 1), this.at(x0 + 1, y0 + 1), fx);
    return lerp(top, bottom, fy);
  }
}

/**
 * Fractal noise (fBm) over u, v ∈ [0, 1), seamless when wrapping at 1.
 * Each octave doubles the lattice period so every octave tiles at the same size.
 */
export function createFractalNoise(
  rng: Rng,
  basePeriod: number,
  octaves: number,
): (u: number, v: number) => number {
  const layers: { noise: PeriodicNoise; period: number; amplitude: number }[] = [];
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    const period = basePeriod * 2 ** i;
    const amplitude = 0.5 ** i;
    layers.push({ noise: new PeriodicNoise(rng, period), period, amplitude });
    total += amplitude;
  }
  return (u, v) => {
    let sum = 0;
    for (const layer of layers) sum += layer.noise.sample(u * layer.period, v * layer.period) * layer.amplitude;
    return sum / total;
  };
}

// ---------- Nebula ----------

export type Rgb = readonly [number, number, number];

/** Side of the square nebula texture (it is stretched to the screen; clouds are soft anyway). */
export const NEBULA_SIZE = 256;

/**
 * RGBA pixels (non-premultiplied) of a tileable nebula: two cloud fields tinted with
 * `colorA` and `colorB`, at most `maxAlpha` opaque, transparent elsewhere.
 */
export function generateNebula(
  size: number,
  rng: Rng,
  colorA: Rgb,
  colorB: Rgb,
  maxAlpha: number,
): Uint8ClampedArray {
  const fieldA = createFractalNoise(rng, 4, 4);
  const fieldB = createFractalNoise(rng, 3, 4);
  const pixels = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const a = smoothstep(0.42, 0.85, fieldA(u, v));
      const b = smoothstep(0.5, 0.88, fieldB(u, v)) * 0.8;
      const total = a + b;
      if (total <= 0) continue;
      const i = (y * size + x) * 4;
      pixels[i] = (colorA[0] * a + colorB[0] * b) / total;
      pixels[i + 1] = (colorA[1] * a + colorB[1] * b) / total;
      pixels[i + 2] = (colorA[2] * a + colorB[2] * b) / total;
      pixels[i + 3] = Math.min(1, total) * maxAlpha * 255;
    }
  }
  return pixels;
}

// ---------- Stars ----------

/** A star in normalized screen coordinates. */
export interface Star {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly alpha: number;
}

export interface StarLayer {
  readonly stars: readonly Star[];
  /** Drift speed in screen heights per second. */
  readonly speed: number;
}

interface LayerSpec {
  readonly count: number;
  readonly size: readonly [number, number];
  readonly alpha: readonly [number, number];
  readonly speed: number;
}

/** Far → near: more, smaller, dimmer and slower stars in the back. */
const STAR_LAYERS: readonly LayerSpec[] = [
  { count: 120, size: [0.8, 1.2], alpha: [0.12, 0.4], speed: 0.006 },
  { count: 60, size: [1.2, 1.8], alpha: [0.3, 0.65], speed: 0.014 },
  { count: 22, size: [1.8, 2.6], alpha: [0.55, 0.9], speed: 0.03 },
];

/** Nebula drift, slower than every star layer (it is the farthest thing). */
export const NEBULA_SPEED = 0.003;

export function createStarLayers(rng: Rng): StarLayer[] {
  return STAR_LAYERS.map((spec) => ({
    speed: spec.speed,
    stars: Array.from({ length: spec.count }, () => ({
      x: rng.next(),
      y: rng.next(),
      size: rng.range(spec.size[0], spec.size[1]),
      alpha: rng.range(spec.alpha[0], spec.alpha[1]),
    })),
  }));
}

/**
 * Scroll offsets for the nebula (index 0) and each star layer (1..n), advanced in fixed
 * updates and interpolated for rendering. Offsets grow without bound and are wrapped
 * only when read, so interpolation never jumps backwards at the wrap point.
 */
export class BackgroundState {
  readonly layers: readonly StarLayer[];
  private readonly speeds: Float64Array;
  private readonly current: Float64Array;
  private readonly previous: Float64Array;

  constructor(rng: Rng) {
    this.layers = createStarLayers(rng);
    this.speeds = Float64Array.from([NEBULA_SPEED, ...this.layers.map((layer) => layer.speed)]);
    this.current = new Float64Array(this.speeds.length);
    this.previous = new Float64Array(this.speeds.length);
  }

  update(dt: number): void {
    for (let i = 0; i < this.speeds.length; i++) {
      const value = this.current[i] ?? 0;
      this.previous[i] = value;
      this.current[i] = value + (this.speeds[i] ?? 0) * dt;
    }
  }

  /** Wrapped offset in [0, 1) for layer `index` (0 = nebula, 1.. = star layers). */
  offset(index: number, alpha: number): number {
    const value = lerp(this.previous[index] ?? 0, this.current[index] ?? 0, alpha);
    return value - Math.floor(value);
  }
}
