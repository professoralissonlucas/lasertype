import { clamp, lerp } from '../../utils/math.ts';

/** How fast the barrel eases toward its aim (per second, exponential). Visual only. */
const TURN_RATE = 16;
/** The barrel never points more than ~77° away from vertical. */
const MAX_ANGLE = 1.35;
/** Seconds for the barrel to slide back into place after a shot. */
const RECOIL_RETURN = 0.11;

/** The fixed cannon at the bottom center. Angle 0 = straight up, positive = right. */
export class Cannon {
  angle = 0;
  prevAngle = 0;
  /** 0 = at rest, 1 = fully kicked back. */
  recoil = 0;
  prevRecoil = 0;

  /** Call at the start of every fixed update, before changing the angle or recoil. */
  beginStep(): void {
    this.prevAngle = this.angle;
    this.prevRecoil = this.recoil;
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

  /** Fires: the barrel jumps back. */
  kick(): void {
    this.recoil = 1;
  }

  /** Slides the barrel back to rest. */
  recover(dt: number): void {
    this.recoil = Math.max(0, this.recoil - dt / RECOIL_RETURN);
  }

  interpolated(alpha: number): number {
    return lerp(this.prevAngle, this.angle, alpha);
  }

  interpolatedRecoil(alpha: number): number {
    return lerp(this.prevRecoil, this.recoil, alpha);
  }

  reset(): void {
    this.angle = 0;
    this.prevAngle = 0;
    this.recoil = 0;
    this.prevRecoil = 0;
  }
}
