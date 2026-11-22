/** Objects a FixedPool can manage. */
export interface Poolable {
  active: boolean;
  /** Seconds left; when the pool is full, the object with the least life is recycled. */
  life: number;
}

/** Fixed-capacity object pool: allocates everything up front, never during a match. */
export class FixedPool<T extends Poolable> {
  readonly items: readonly T[];

  constructor(capacity: number, create: () => T) {
    const items: T[] = [];
    for (let i = 0; i < capacity; i++) items.push(create());
    this.items = items;
  }

  /** A free object, or (when all are busy) the one closest to expiring. Marks it active. */
  acquire(): T | null {
    let slot: T | null = null;
    for (const item of this.items) {
      if (!item.active) {
        slot = item;
        break;
      }
      if (slot === null || item.life < slot.life) slot = item;
    }
    if (slot) slot.active = true;
    return slot;
  }

  get activeCount(): number {
    let count = 0;
    for (const item of this.items) if (item.active) count++;
    return count;
  }

  clear(): void {
    for (const item of this.items) item.active = false;
  }
}
