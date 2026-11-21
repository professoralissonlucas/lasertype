import { clamp, lerp } from '../../utils/math.ts';

/** How fast the barrel eases toward its aim (per second, exponential). Visual only. */
const TURN_RATE = 16;
/** The barrel never points more than ~77° away from vertical. */
const MAX_ANGLE = 1.35;

/** The fixed cannon at the bottom center. Angle 0 = straight up, positive = right. */
export class Cannon {
  angle = 0;
  prevAngle = 0;

  /** Call at the start of every fixed update, before changing the angle. */
  beginStep(): void {
    this.prevAngle = this.angle;
  }

  /** Eases toward `target` (frame-rate independent because `dt` is the fixed step). */
  turnTowards(target: number, dt: number): void {
    const goal = clamp(target, -MAX_ANGLE, MAX_ANGLE);
    this.angle += (goal - this.angle) * (1 - Math.exp(-TURN_RATE * dt));
  }

  /** Points straight at `target` (used when firing). */
  snapTo(target: number): void {
    this.angle = clamp(target, -MAX_ANGLE, MAX_ANGLE);
  }

  interpolated(alpha: number): number {
    return lerp(this.prevAngle, this.angle, alpha);
  }

  reset(): void {
    this.angle = 0;
    this.prevAngle = 0;
  }
}
