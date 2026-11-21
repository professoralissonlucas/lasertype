export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Angle (radians) to aim from a pivot at a target in screen space (y grows downward).
 * 0 points straight up, positive values turn clockwise (to the right).
 */
export function aimAngle(pivotX: number, pivotY: number, targetX: number, targetY: number): number {
  return Math.atan2(targetX - pivotX, pivotY - targetY);
}
