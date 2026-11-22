// Particle recipes for each game moment. Pure: they only fill the pool.
// `scale` multiplies particle counts (0.5 with "Reduzir efeitos").
// Cosmetic colors use the slots 'laser', 'blast' and 'blastAlt' (resolved by the renderer).
import { DEFAULT_COSMETICS } from '../../cosmetics/equip.ts';
import type { ExplosionParams } from '../../cosmetics/types.ts';
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
    const p = pool.spawn('spark', rng.next() < 0.3 ? 'text' : 'laser', x, y, rng.range(0.12, 0.28));
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

  const glow = pool.spawn('glow', 'laser', x, y, 0.16);
  if (glow) {
    glow.size = 14;
    glow.sizeEnd = 2;
  }

  const ring = pool.spawn('ring', 'laser', x, y, 0.18);
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

/** Letters crumbling into pixels where they were drawn (the "dissolve" explosion). */
function emitDissolve(
  pool: ParticlePool,
  rng: Rng,
  text: string,
  startX: number,
  charWidth: number,
  y: number,
  scale: number,
  gravity: number,
): void {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === undefined) continue;
    const x = startX + (i + 0.5) * charWidth;
    // The letter flashes in place for an instant…
    const glyph = pool.spawn('glyph', 'text', x, y, 0.2);
    if (!glyph) return;
    glyph.glyph = char;
    glyph.size = 1;
    glyph.sizeEnd = 1.15;
    // …and breaks into a few pixels that drift away.
    for (let k = 0, n = count(4, scale); k < n; k++) {
      const p = pool.spawn(
        'square',
        rng.next() < 0.5 ? 'text' : 'blast',
        x + rng.range(-0.4, 0.4) * charWidth,
        y + rng.range(-0.5, 0.5) * charWidth,
        rng.range(0.5, 0.95),
      );
      if (!p) return;
      p.vx = rng.range(-30, 30);
      p.vy = rng.range(-50, -10);
      p.drag = 1.5;
      p.gravity = 120 * gravity;
      p.size = rng.range(2.5, 4);
      p.sizeEnd = 0.5;
    }
  }
}

/** Letters sucked into the middle of the word (the "collapse" explosion). */
function emitCollapse(
  pool: ParticlePool,
  rng: Rng,
  text: string,
  startX: number,
  charWidth: number,
  y: number,
): void {
  const cx = startX + (text.length * charWidth) / 2;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === undefined) continue;
    const x = startX + (i + 0.5) * charWidth;
    const life = rng.range(0.22, 0.3);
    const p = pool.spawn('glyph', 'text', x, y, life);
    if (!p) return;
    p.glyph = char;
    // Reaches the center as it vanishes.
    p.vx = (cx - x) / life;
    p.spin = rng.range(-4, 4);
    p.size = 1;
    p.sizeEnd = 0.2;
  }
}

/**
 * A destroyed word, drawn the way the equipped explosion says: its letters fly apart
 * (or crumble, or collapse), plus debris, embers and shockwaves.
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
  style: ExplosionParams = DEFAULT_COSMETICS.explosion,
): void {
  const width = text.length * charWidth;
  const cx = startX + width / 2;

  switch (style.letters) {
    case 'scatter':
      emitGlyphs(pool, rng, text, startX, charWidth, y, 'text');
      break;
    case 'dissolve':
      emitDissolve(pool, rng, text, startX, charWidth, y, scale, style.gravity);
      break;
    case 'collapse':
      emitCollapse(pool, rng, text, startX, charWidth, y);
      break;
  }

  const square = style.debris === 'square';
  for (let i = 0, n = count((16 + text.length * 2) * style.debrisCount, scale); i < n; i++) {
    const color: FxColor = rng.next() < 0.3 ? 'text' : 'blast';
    if (style.inward) {
      // Debris starts on a circle around the word and converges on its center.
      const life = rng.range(0.2, 0.32);
      const dir = rng.range(0, TAU);
      const radius = (rng.range(50, 110) + width * 0.4) * style.debrisSpeed;
      const p = pool.spawn(square ? 'square' : 'spark', color, cx + Math.sin(dir) * radius, y - Math.cos(dir) * radius, life);
      if (!p) break;
      p.vx = (-Math.sin(dir) * radius) / life;
      p.vy = (Math.cos(dir) * radius) / life;
      p.size = rng.range(1.2, 2.4);
      p.sizeEnd = 0.6;
      continue;
    }
    const p = pool.spawn(square ? 'square' : 'spark', color, cx, y, rng.range(0.3, 0.7));
    if (!p) break;
    const dir = rng.range(0, TAU);
    const speed = rng.range(120, 460) * style.debrisSpeed;
    p.vx = Math.sin(dir) * speed;
    p.vy = -Math.cos(dir) * speed;
    p.drag = 3.5;
    p.gravity = 120 * style.gravity;
    p.size = square ? rng.range(2, 4) : rng.range(1.2, 2.6);
    p.sizeEnd = square ? 0.8 : 0.4;
  }

  for (let i = 0, n = count(8 * style.embers, scale); i < n; i++) {
    const p = pool.spawn('glow', rng.next() < 0.3 ? 'blastAlt' : 'blast', cx, y, rng.range(0.5, 0.9));
    if (!p) break;
    const dir = rng.range(0, TAU);
    const speed = rng.range(30, 140);
    p.vx = Math.sin(dir) * speed;
    p.vy = -Math.cos(dir) * speed;
    p.drag = 2;
    p.size = rng.range(6, 12);
    p.sizeEnd = 0;
  }

  const reach = (28 + width * 0.35) * style.ringScale;
  for (let i = 0; i < style.rings; i++) {
    const ring = pool.spawn('ring', i === 0 ? 'blast' : 'blastAlt', cx, y, 0.35 + i * 0.12);
    if (!ring) break;
    if (style.inward && i === 0) {
      // Implosion: the first ring closes in on the word, the next ones burst out.
      ring.size = reach * 1.4;
      ring.sizeEnd = 2;
    } else {
      ring.size = 4;
      ring.sizeEnd = reach * (1 + i * 0.45);
    }
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

/** Pieces of the boss's hull breaking off around a destroyed word, plus sparks and a ring. */
export function emitBossFragments(
  pool: ParticlePool,
  rng: Rng,
  startX: number,
  width: number,
  y: number,
  scale: number,
): void {
  const cx = startX + width / 2;
  // Heavy plates tumbling down.
  for (let i = 0, n = count(8 + width / 14, scale); i < n; i++) {
    const p = pool.spawn('square', rng.next() < 0.55 ? 'danger' : 'text', startX + rng.next() * width, y, rng.range(0.7, 1.2));
    if (!p) break;
    p.vx = (p.x - cx) * rng.range(0.6, 2.2) + rng.range(-60, 60);
    p.vy = rng.range(-220, -40);
    p.gravity = 560;
    p.drag = 0.6;
    p.size = rng.range(3.5, 8);
    p.sizeEnd = 1.5;
  }
  for (let i = 0, n = count(16, scale); i < n; i++) {
    const p = pool.spawn('spark', rng.next() < 0.5 ? 'combo' : 'blast', startX + rng.next() * width, y, rng.range(0.25, 0.55));
    if (!p) break;
    const dir = rng.range(0, TAU);
    const speed = rng.range(120, 380);
    p.vx = Math.sin(dir) * speed;
    p.vy = -Math.cos(dir) * speed;
    p.drag = 3.5;
    p.gravity = 180;
    p.size = rng.range(1.2, 2.4);
    p.sizeEnd = 0.4;
  }
  const ring = pool.spawn('ring', 'danger', cx, y, 0.35);
  if (ring) {
    ring.size = 8;
    ring.sizeEnd = 30 + width * 0.5;
  }
}

/** One of the blasts that tear a defeated boss apart (equipped explosion colors). */
export function emitBossBlast(pool: ParticlePool, rng: Rng, x: number, y: number, radius: number, scale: number): void {
  emitBlast(pool, x, y, radius, rng.next() < 0.5 ? 'blast' : 'blastAlt', 0.4);
  for (let i = 0, n = count(14, scale); i < n; i++) {
    const square = rng.next() < 0.4;
    const p = pool.spawn(square ? 'square' : 'spark', rng.next() < 0.3 ? 'text' : 'blast', x, y, rng.range(0.4, 0.8));
    if (!p) return;
    const dir = rng.range(0, TAU);
    const speed = rng.range(100, 380);
    p.vx = Math.sin(dir) * speed;
    p.vy = -Math.cos(dir) * speed;
    p.drag = 2.6;
    p.gravity = 200;
    p.size = square ? rng.range(3, 6) : rng.range(1.2, 2.6);
    p.sizeEnd = square ? 1 : 0.4;
  }
}

/** The last, biggest burst of a defeated boss: shockwaves, embers and debris over the screen. */
export function emitBossFinale(pool: ParticlePool, rng: Rng, x: number, y: number, reach: number, scale: number): void {
  const colors: readonly FxColor[] = ['text', 'blast', 'blastAlt'];
  for (const [i, color] of colors.entries()) {
    const ring = pool.spawn('ring', color, x, y, 0.55 + i * 0.2);
    if (!ring) return;
    ring.size = 10;
    ring.sizeEnd = reach * (0.55 + i * 0.3);
  }
  const glow = pool.spawn('glow', 'blast', x, y, 0.6);
  if (glow) {
    glow.size = Math.min(260, reach * 0.45);
    glow.sizeEnd = 0;
  }
  for (let i = 0, n = count(90, scale); i < n; i++) {
    const p = pool.spawn('spark', rng.next() < 0.3 ? 'text' : 'blast', x, y, rng.range(0.6, 1.2));
    if (!p) return;
    const dir = rng.range(0, TAU);
    const speed = rng.range(200, 900);
    p.vx = Math.sin(dir) * speed;
    p.vy = -Math.cos(dir) * speed;
    p.drag = 2.4;
    p.gravity = 90;
    p.size = rng.range(1.4, 3);
    p.sizeEnd = 0.4;
  }
  for (let i = 0, n = count(26, scale); i < n; i++) {
    const p = pool.spawn('glow', rng.next() < 0.4 ? 'blastAlt' : 'blast', x, y, rng.range(0.8, 1.5));
    if (!p) return;
    const dir = rng.range(0, TAU);
    const speed = rng.range(40, 280);
    p.vx = Math.sin(dir) * speed;
    p.vy = -Math.cos(dir) * speed - 30;
    p.drag = 1.6;
    p.size = rng.range(8, 18);
    p.sizeEnd = 0;
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
