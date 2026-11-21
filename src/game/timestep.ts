/**
 * Fixed-timestep accumulator: converts variable frame times into a whole number of
 * fixed updates, plus an interpolation factor for rendering between the last two states.
 */
export class FixedTimestep {
  /** Seconds per update. */
  readonly step: number;
  private readonly maxFrame: number;
  private accumulator = 0;

  constructor(updatesPerSecond: number, maxFrameSeconds: number) {
    this.step = 1 / updatesPerSecond;
    this.maxFrame = maxFrameSeconds;
  }

  /** Adds a frame's elapsed time and returns how many fixed updates to run now. */
  advance(frameSeconds: number): number {
    this.accumulator += Math.min(Math.max(frameSeconds, 0), this.maxFrame);
    let steps = 0;
    while (this.accumulator >= this.step) {
      this.accumulator -= this.step;
      steps++;
    }
    return steps;
  }

  /** 0..1: how far the current frame is between the previous and the latest update. */
  get alpha(): number {
    return this.accumulator / this.step;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
