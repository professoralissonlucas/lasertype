// Particle pool and physics (pure: no DOM/canvas). Coordinates are screen CSS pixels.
import { FixedPool } from '../../utils/pool.ts';

/** Palette keys particles may use (resolved to colors by the renderer). */
export type FxColor = 'primary' | 'text' | 'combo' | 'danger';

/**
 * - spark: short streak along its velocity (`size` = line width)
 * - glow: soft additive blob (`size` = radius)
 * - ring: expanding shockwave (`size` = radius)
 * - glyph: a letter flying away from a destroyed word (`size` = scale)
 */
export type ParticleKind = 'spark' | 'glow' | 'ring' | 'glyph';

export interface Particle {
  active: boolean;
  kind: ParticleKind;
  color: FxColor;
  x: number;
  y: number;
  /** Position at the start of the current update, for render interpolation. */
  prevX: number;
  prevY: number;
  /** px/s */
  vx: number;
  vy: number;
  /** Exponential velocity damping, per second. */
  drag: number;
  /** Downward acceleration, px/s². */
  gravity: number;
  /** Seconds left. */
  life: number;
  maxLife: number;
  /** Size at birth… */
  size: number;
  /** …and at death (interpolated over the lifetime). */
  sizeEnd: number;
  /** Rotation (glyphs), radians, and its speed. */
  angle: number;
  spin: number;
  glyph: string;
}

function blankParticle(): Particle {
  return {
    active: false,
    kind: 'spark',
    color: 'primary',
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    drag: 0,
    gravity: 0,
    life: 0,
    maxLife: 1,
    size: 1,
    sizeEnd: 1,
    angle: 0,
    spin: 0,
    glyph: '',
  };
}

export class ParticlePool {
  private readonly pool: FixedPool<Particle>;

  constructor(capacity: number) {
    this.pool = new FixedPool(capacity, blankParticle);
  }

  get items(): readonly Particle[] {
    return this.pool.items;
  }

  get activeCount(): number {
    return this.pool.activeCount;
  }

  /**
   * Activates a particle with every field reset to defaults; the caller then sets
   * velocity, size, etc. directly on it (no spec objects, so no allocation).
   */
  spawn(kind: ParticleKind, color: FxColor, x: number, y: number, life: number): Particle | null {
    const p = this.pool.acquire();
    if (!p) return null;
    p.kind = kind;
    p.color = color;
    p.x = x;
    p.y = y;
    p.prevX = x;
    p.prevY = y;
    p.vx = 0;
    p.vy = 0;
    p.drag = 0;
    p.gravity = 0;
    p.life = life;
    p.maxLife = life;
    p.size = 1;
    p.sizeEnd = 1;
    p.angle = 0;
    p.spin = 0;
    p.glyph = '';
    return p;
  }

  update(dt: number): void {
    for (const p of this.pool.items) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.prevX = p.x;
      p.prevY = p.y;
      const damping = p.drag > 0 ? Math.exp(-p.drag * dt) : 1;
      p.vx *= damping;
      p.vy = p.vy * damping + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
    }
  }

  clear(): void {
    this.pool.clear();
  }
}
