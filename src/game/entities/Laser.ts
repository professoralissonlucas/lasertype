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
  readonly items: readonly Laser[];

  constructor(capacity: number) {
    const items: Laser[] = [];
    for (let i = 0; i < capacity; i++) {
      items.push({ active: false, x0: 0, y0: 0, x1: 0, y1: 0, life: 0, maxLife: 1 });
    }
    this.items = items;
  }

  /** Activates a free laser; when all are busy, recycles the one closest to fading out. */
  fire(x0: number, y0: number, x1: number, y1: number, life: number): Laser | null {
    let slot: Laser | null = null;
    for (const laser of this.items) {
      if (!laser.active) {
        slot = laser;
        break;
      }
      if (slot === null || laser.life < slot.life) slot = laser;
    }
    if (!slot) return null;
    slot.active = true;
    slot.x0 = x0;
    slot.y0 = y0;
    slot.x1 = x1;
    slot.y1 = y1;
    slot.life = life;
    slot.maxLife = life;
    return slot;
  }

  update(dt: number): void {
    for (const laser of this.items) {
      if (!laser.active) continue;
      laser.life -= dt;
      if (laser.life <= 0) laser.active = false;
    }
  }

  get activeCount(): number {
    let count = 0;
    for (const laser of this.items) if (laser.active) count++;
    return count;
  }

  clear(): void {
    for (const laser of this.items) laser.active = false;
  }
}
