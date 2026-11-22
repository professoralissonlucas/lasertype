/** Largest offset, in CSS pixels, at full trauma. Kept small: the shake is meant to be light. */
const MAX_OFFSET = 8;
/** Trauma lost per second. */
const DECAY = 1.6;

/**
 * Trauma-based screen shake: events add trauma (0..1); the offset grows with trauma²,
 * so small hits barely move the screen while big ones (and stacked hits) do.
 * Deterministic (sine mix instead of random noise).
 */
export class ScreenShake {
  trauma = 0;
  private time = 0;

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number): void {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - DECAY * dt);
  }

  private get amplitude(): number {
    return MAX_OFFSET * this.trauma * this.trauma;
  }

  offsetX(): number {
    if (this.trauma === 0) return 0;
    const t = this.time;
    return this.amplitude * (Math.sin(t * 90) * 0.6 + Math.sin(t * 131 + 1.3) * 0.4);
  }

  offsetY(): number {
    if (this.trauma === 0) return 0;
    const t = this.time;
    return this.amplitude * (Math.sin(t * 103 + 0.7) * 0.6 + Math.sin(t * 149 + 2.1) * 0.4);
  }

  reset(): void {
    this.trauma = 0;
  }
}

export const SHAKE_MAX_OFFSET = MAX_OFFSET;
