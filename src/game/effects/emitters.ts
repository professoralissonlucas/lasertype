// Particle recipes for each game moment. Pure: they only fill the pool.
// `scale` multiplies particle counts (0.5 with "Reduzir efeitos").
import type { Rng } from '../../utils/rng.ts';
import type { FxColor, ParticlePool } from './particles.ts';

const TAU = Math.PI * 2;

function count(base: number, scale: number): number {
  return Math.max(1, Math.round(base * scale));
}

/** Sparks where a laser hits a letter. `aim` is the laser direction (0 = up, + = right). */
export function emitImpact(
  pool: ParticlePool,
  rng: Rng,
  x: number,
  y: number,
  aim: number,
  scale: number,
): void {
  for (let i = 0, n = count(7, scale); i < n; i++) {
    const p = pool.spawn('spark', rng.next() < 0.3 ? 'text' : 'primary', x, y, rng.range(0.12, 0.28));
    if (!p) return;
    // Sparks keep travelling roughly the way the beam was going.
    const dir = aim + rng.range(-0.85, 0.85);
    const speed = rng.range(90, 280);
    p.vx = Math.sin(dir) * speed;
    p.vy = -Math.cos(dir) * speed;
    p.drag = 6;
    p.size = rng.range(1, 2);
    p.sizeEnd = 0.5;
  }

  const glow = pool.spawn('glow', 'primary', x, y, 0.16);
  if (glow) {
    glow.size = 14;
    glow.sizeEnd = 2;
  }

  const ring = pool.spawn('ring', 'primary', x, y, 0.18);
  if (ring) {
    ring.size = 3;
    ring.sizeEnd = 16;
  }
}

/**
 * The letters of a word flying apart from where they were drawn (one particle each).
 * `startX` is the left edge of the text, `y` its vertical center.
 */
export function emitGlyphs(
  pool: ParticlePool,
  rng: Rng,
  text: string,
  startX: number,
  charWidth: number,
  y: number,
  color: FxColor,
): void {
  const cx = startX + (text.length * charWidth) / 2;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === undefined) continue;
    const x = startX + (i + 0.5) * charWidth;
    const p = pool.spawn('glyph', color, x, y, rng.range(0.5, 0.8));
    if (!p) return;
    p.glyph = char;
    p.vx = (x - cx) * rng.range(2, 4) + rng.range(-40, 40);
    p.vy = rng.range(-170, -50);
    p.gravity = 420;
    p.drag = 1.2;
    p.spin = rng.range(-7, 7);
    p.size = 1;
    p.sizeEnd = 0.6;
  }
}

/**
 * A destroyed word: its letters fly apart, plus sparks, embers and a shockwave.
 * `startX` is the left edge of the text, `y` its vertical center.
 */
export function emitExplosion(
  pool: ParticlePool,
  rng: Rng,
  text: string,
  startX: number,
  charWidth: number,
  y: number,
  scale: number,
): void {
  const width = text.length * charWidth;
  const cx = startX + width / 2;

  emitGlyphs(pool, rng, text, startX, charWidth, y, 'text');

  for (let i = 0, n = count(16 + text.length * 2, scale); i < n; i++) {
    const p = pool.spawn('spark', rng.next() < 0.3 ? 'text' : 'primary', cx, y, rng.range(0.3, 0.7));
    if (!p) break;
    const dir = rng.range(0, TAU);
    const speed = rng.range(120, 460);
    p.vx = Math.sin(dir) * speed;
    p.vy = -Math.cos(dir) * speed;
    p.drag = 3.5;
    p.gravity = 120;
    p.size = rng.range(1.2, 2.6);
    p.sizeEnd = 0.4;
  }

  for (let i = 0, n = count(8, scale); i < n; i++) {
    const p = pool.spawn('glow', rng.next() < 0.3 ? 'combo' : 'primary', cx, y, rng.range(0.5, 0.9));
    if (!p) break;
    const dir = rng.range(0, TAU);
    const speed = rng.range(30, 140);
    p.vx = Math.sin(dir) * speed;
    p.vy = -Math.cos(dir) * speed;
    p.drag = 2;
    p.size = rng.range(6, 12);
    p.sizeEnd = 0;
  }

  const ring = pool.spawn('ring', 'primary', cx, y, 0.35);
  if (ring) {
    ring.size = 4;
    ring.sizeEnd = 28 + width * 0.35;
  }
}

/** Floating "+120" rising from where a word died. */
export function emitScorePopup(pool: ParticlePool, x: number, y: number, text: string, color: FxColor): void {
  const p = pool.spawn('glyph', color, x, y, 0.9);
  if (!p) return;
  p.glyph = text;
  p.vy = -70;
  p.drag = 2.2;
  p.size = 0.85;
  p.sizeEnd = 1;
}

/** An armor plate breaking off: metal-white sparks across the word and a ring. */
export function emitArmorBreak(
  pool: ParticlePool,
  rng: Rng,
  startX: number,
  width: number,
  y: number,
  scale: number,
): void {
  for (let i = 0, n = count(14, scale); i < n; i++) {
    const p = pool.spawn('spark', rng.next() < 0.6 ? 'text' : 'primary', startX + rng.next() * width, y, rng.range(0.2, 0.45));
    if (!p) break;
    const dir = rng.range(0, TAU);
    const speed = rng.range(80, 260);
    p.vx = Math.sin(dir) * speed;
    p.vy = -Math.cos(dir) * speed;
    p.drag = 4;
    p.gravity = 260;
    p.size = rng.range(1, 2);
    p.sizeEnd = 0.4;
  }
  const ring = pool.spawn('ring', 'text', startX + width / 2, y, 0.25);
  if (ring) {
    ring.size = width * 0.3;
    ring.sizeEnd = width * 0.7;
  }
}

/** A big expanding shockwave (bomb blast, EMP). */
export function emitBlast(
  pool: ParticlePool,
  x: number,
  y: number,
  radius: number,
  color: FxColor,
  life: number,
): void {
  const ring = pool.spawn('ring', color, x, y, life);
  if (ring) {
    ring.size = 8;
    ring.sizeEnd = radius;
  }
  const glow = pool.spawn('glow', color, x, y, life * 0.6);
  if (glow) {
    glow.size = Math.min(80, radius * 0.4);
    glow.sizeEnd = 0;
  }
}

/** Shield restored: soft rising glows over the cannon. */
export function emitShieldUp(pool: ParticlePool, rng: Rng, x: number, y: number): void {
  for (let i = 0; i < 10; i++) {
    const p = pool.spawn('glow', 'primary', x + rng.range(-40, 40), y, rng.range(0.5, 0.9));
    if (!p) break;
    p.vy = rng.range(-140, -60);
    p.drag = 1.5;
    p.size = rng.range(5, 9);
    p.sizeEnd = 0;
  }
  const ring = pool.spawn('ring', 'primary', x, y, 0.5);
  if (ring) {
    ring.size = 10;
    ring.sizeEnd = 70;
  }
}

/** A word crashing into the perimeter: red letters shatter and sparks fan upward. */
export function emitBreach(
  pool: ParticlePool,
  rng: Rng,
  text: string,
  startX: number,
  charWidth: number,
  y: number,
  scale: number,
): void {
  const x = startX + (text.length * charWidth) / 2;
  emitGlyphs(pool, rng, text, startX, charWidth, y, 'danger');

  for (let i = 0, n = count(22, scale); i < n; i++) {
    const p = pool.spawn('spark', 'danger', x, y, rng.range(0.3, 0.6));
    if (!p) break;
    const dir = rng.range(-1.25, 1.25); // upward fan
    const speed = rng.range(100, 360);
    p.vx = Math.sin(dir) * speed;
    p.vy = -Math.cos(dir) * speed;
    p.drag = 3;
    p.gravity = 300;
    p.size = rng.range(1.2, 2.8);
    p.sizeEnd = 0.4;
  }

  const glow = pool.spawn('glow', 'danger', x, y, 0.3);
  if (glow) {
    glow.size = 32;
    glow.sizeEnd = 4;
  }

  const ring = pool.spawn('ring', 'danger', x, y, 0.4);
  if (ring) {
    ring.size = 6;
    ring.sizeEnd = 64;
  }
}
