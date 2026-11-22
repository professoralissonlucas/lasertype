import { FixedPool } from '../../utils/pool.ts';

/** A short-lived beam, in screen (CSS pixel) coordinates. */
export interface Laser {
  active: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Seconds left. */
  life: number;
  maxLife: number;
}

/** Fixed-size pool: firing never allocates during a match. */
export class LaserPool {
  private readonly pool: FixedPool<Laser>;

  constructor(capacity: number) {
    this.pool = new FixedPool(capacity, () => ({
      active: false,
      x0: 0,
      y0: 0,
      x1: 0,
      y1: 0,
      life: 0,
      maxLife: 1,
    }));
  }

  get items(): readonly Laser[] {
    return this.pool.items;
  }

  /** Activates a free laser; when all are busy, recycles the one closest to fading out. */
  fire(x0: number, y0: number, x1: number, y1: number, life: number): Laser | null {
    const slot = this.pool.acquire();
    if (!slot) return null;
    slot.x0 = x0;
    slot.y0 = y0;
    slot.x1 = x1;
    slot.y1 = y1;
    slot.life = life;
    slot.maxLife = life;
    return slot;
  }

  update(dt: number): void {
    for (const laser of this.pool.items) {
      if (!laser.active) continue;
      laser.life -= dt;
      if (laser.life <= 0) laser.active = false;
    }
  }

  get activeCount(): number {
    return this.pool.activeCount;
  }

  clear(): void {
    this.pool.clear();
  }
}
