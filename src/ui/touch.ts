// Touch or mouse? Shows the on-screen controls and opens the on-screen keyboard only for
// players who are using their fingers. Starts from the device's main pointer and follows the
// last one used (tablets with a mouse, laptops with a touch screen).

export class TouchMode {
  private readonly onChange: () => void;
  private touch: boolean;

  constructor(onChange: () => void) {
    this.onChange = onChange;
    this.touch = window.matchMedia('(pointer: coarse)').matches;
  }

  get active(): boolean {
    return this.touch;
  }

  attach(): void {
    // Capture: before the tap's own handlers, which already need to know.
    window.addEventListener('pointerdown', this.onPointer, { capture: true });
  }

  private readonly onPointer = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'mouse') return;
    const touch = event.pointerType === 'touch';
    if (touch === this.touch) return;
    this.touch = touch;
    this.onChange();
  };
}
