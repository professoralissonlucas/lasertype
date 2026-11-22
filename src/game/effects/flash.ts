import type { FxColor } from './particles.ts';

/** Short full-screen color flash that fades out linearly. */
export class ScreenFlash {
  color: FxColor = 'text';
  private intensity = 0;
  private life = 0;
  private duration = 1;

  /** A weaker flash never cuts a stronger one that is still visible. */
  trigger(color: FxColor, intensity: number, duration: number): void {
    if (intensity < this.alpha) return;
    this.color = color;
    this.intensity = intensity;
    this.life = duration;
    this.duration = duration;
  }

  update(dt: number): void {
    this.life = Math.max(0, this.life - dt);
  }

  /** Current overlay opacity (0 = invisible). */
  get alpha(): number {
    return this.duration > 0 ? this.intensity * (this.life / this.duration) : 0;
  }

  reset(): void {
    this.life = 0;
  }
}
