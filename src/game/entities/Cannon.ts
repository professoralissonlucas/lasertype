import { clamp, lerp } from '../../utils/math.ts';

/**
 * Stiffness of the turn (rad/s): a critically damped spring, so the turret speeds up and
 * then settles on its aim without overshooting (~0.25 s for a big turn). Visual only.
 */
const TURN_STIFFNESS = 18;
/** The barrel never points more than ~77° away from vertical. */
const MAX_ANGLE = 1.35;
/** Seconds for the barrel to slide back into place after a shot. */
const RECOIL_RETURN = 0.14;
/** Shot age kept once every muzzle effect is over (no need to count further). */
export const SETTLED_SHOT_AGE = 1;

/** 0 = the single barrel (or the left one of a pair), 1 = the right one. */
export type BarrelIndex = 0 | 1;
const BARRELS = [0, 1] as const;

/** What the renderer needs from the cannon's motion for one frame (render/drawCannon.ts). */
export interface CannonMotion {
  angle: number;
  /** Per barrel, 0 = at rest, 1 = fully kicked back. */
  recoil: [number, number];
  /** Seconds since each barrel last fired (muzzle glow, sparks, smoke). */
  shotAge: [number, number];
  /** Index of each barrel's last shot (seeds its sparks). */
  shotSeed: [number, number];
}

/** The fixed cannon at the bottom center. Angle 0 = straight up, positive = right. */
export class Cannon {
  angle = 0;
  prevAngle = 0;
  private velocity = 0;
  readonly recoil: [number, number] = [0, 0];
  readonly prevRecoil: [number, number] = [0, 0];
  readonly shotAge: [number, number] = [SETTLED_SHOT_AGE, SETTLED_SHOT_AGE];
  readonly prevShotAge: [number, number] = [SETTLED_SHOT_AGE, SETTLED_SHOT_AGE];
  private readonly shotSeed: [number, number] = [0, 0];
  /** Shots fired since the last reset (the twin alternates barrels with it). */
  shots = 0;

  /** Call at the start of every fixed update, before changing the angle or recoil. */
  beginStep(): void {
    this.prevAngle = this.angle;
    for (const i of BARRELS) {
      this.prevRecoil[i] = this.recoil[i];
      this.prevShotAge[i] = this.shotAge[i];
    }
  }

  /** Turns toward `target` (critically damped spring; frame-rate independent: `dt` is the fixed step). */
  turnTowards(target: number, dt: number): void {
    const goal = clamp(target, -MAX_ANGLE, MAX_ANGLE);
    const accel = -TURN_STIFFNESS * TURN_STIFFNESS * (this.angle - goal) - 2 * TURN_STIFFNESS * this.velocity;
    this.velocity += accel * dt;
    this.angle = clamp(this.angle + this.velocity * dt, -MAX_ANGLE, MAX_ANGLE);
  }

  /** Points straight at `target` (used when firing: the beam leaves along the barrel). */
  snapTo(target: number): void {
    this.angle = clamp(target, -MAX_ANGLE, MAX_ANGLE);
    this.velocity = 0;
  }

  /** Fires `barrel`: it jumps back and its muzzle flashes. */
  kick(barrel: BarrelIndex = 0): void {
    this.recoil[barrel] = 1;
    this.shotAge[barrel] = 0;
    this.prevShotAge[barrel] = 0;
    this.shotSeed[barrel] = this.shots;
    this.shots++;
  }

  /** Slides the barrels back to rest and ages the muzzle effects. */
  recover(dt: number): void {
    for (const i of BARRELS) {
      this.recoil[i] = Math.max(0, this.recoil[i] - dt / RECOIL_RETURN);
      this.shotAge[i] = Math.min(SETTLED_SHOT_AGE, this.shotAge[i] + dt);
    }
  }

  interpolated(alpha: number): number {
    return lerp(this.prevAngle, this.angle, alpha);
  }

  interpolatedRecoil(alpha: number, barrel: BarrelIndex = 0): number {
    return lerp(this.prevRecoil[barrel], this.recoil[barrel], alpha);
  }

  /** Fills `out` with the motion interpolated between the last two steps. */
  writeMotion(alpha: number, out: CannonMotion): void {
    out.angle = this.interpolated(alpha);
    for (const i of BARRELS) {
      out.recoil[i] = this.interpolatedRecoil(alpha, i);
      out.shotAge[i] = lerp(this.prevShotAge[i], this.shotAge[i], alpha);
      out.shotSeed[i] = this.shotSeed[i];
    }
  }

  reset(): void {
    this.angle = 0;
    this.prevAngle = 0;
    this.velocity = 0;
    for (const i of BARRELS) {
      this.recoil[i] = 0;
      this.prevRecoil[i] = 0;
      this.shotAge[i] = SETTLED_SHOT_AGE;
      this.prevShotAge[i] = SETTLED_SHOT_AGE;
      this.shotSeed[i] = 0;
    }
    this.shots = 0;
  }
}
