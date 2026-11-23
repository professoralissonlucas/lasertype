// What part of the page is visible: on phones the on-screen keyboard covers the lower half of
// it (and the browser may scroll the page to show the focused field). The app moves into the
// visible part, so the cannon and the perimeter stay above the keyboard.
// ViewportModel is pure; ViewportWatcher reads the browser and places the app element.

/** Less than this is a shortcut bar (hardware keyboard) or the browser's own bars (px). */
const KEYBOARD_MIN = 120;
/** Sub-pixel differences between the layout and the visual viewport. */
const SLACK = 1;

export interface ViewportReading {
  /** Layout viewport: what `position: fixed; inset: 0` covers. */
  readonly width: number;
  readonly height: number;
  /** Visual viewport: the part in sight, in CSS px at its zoom. */
  readonly visibleTop: number;
  readonly visibleHeight: number;
  readonly scale: number;
  /** A text field has the focus. */
  readonly editing: boolean;
}

export interface ViewportState {
  /** Where the app goes; null = the whole page. */
  readonly inset: { readonly top: number; readonly height: number } | null;
  /** The on-screen keyboard is up. */
  readonly keyboard: boolean;
}

export const FULL_VIEWPORT: ViewportState = { inset: null, keyboard: false };

export class ViewportModel {
  private width = Number.NaN;
  /** Tallest the page has been at this width: browsers that shrink the page show no inset. */
  private full = 0;

  update(reading: ViewportReading): ViewportState {
    const { width, height, editing } = reading;
    // Rotated (or the window was resized): start measuring again.
    if (width !== this.width) this.full = 0;
    this.width = width;

    // Zoomed in by the player: the app stays put and the zoom shows a part of it.
    const zoomed = reading.scale > 1.01;
    const visible = Math.min(height, Math.round(reading.visibleHeight * reading.scale));
    const top = zoomed ? 0 : Math.max(0, Math.round(reading.visibleTop));

    this.full = Math.max(this.full, height);
    const covered = visible < height - SLACK || top > 0;
    return {
      inset: covered ? { top, height: visible } : null,
      keyboard: editing && this.full - visible >= KEYBOARD_MIN,
    };
  }
}

function sameState(a: ViewportState, b: ViewportState): boolean {
  return a.keyboard === b.keyboard && a.inset?.top === b.inset?.top && a.inset?.height === b.inset?.height;
}

export type ViewportListener = (state: ViewportState, previous: ViewportState) => void;

export class ViewportWatcher {
  private readonly root: HTMLElement;
  private readonly listener: ViewportListener;
  private readonly model = new ViewportModel();
  private current = FULL_VIEWPORT;

  constructor(root: HTMLElement, listener: ViewportListener) {
    this.root = root;
    this.listener = listener;
  }

  get state(): ViewportState {
    return this.current;
  }

  attach(): void {
    window.addEventListener('resize', this.update);
    window.visualViewport?.addEventListener('resize', this.update);
    window.visualViewport?.addEventListener('scroll', this.update);
    document.addEventListener('focusin', this.update);
    document.addEventListener('focusout', this.update);
    this.update();
  }

  private readonly update = (): void => {
    const page = document.documentElement;
    const visual = window.visualViewport;
    const focused = document.activeElement;
    const next = this.model.update({
      width: page.clientWidth,
      height: page.clientHeight,
      visibleTop: visual?.offsetTop ?? 0,
      visibleHeight: visual?.height ?? page.clientHeight,
      scale: visual?.scale ?? 1,
      editing: focused instanceof HTMLInputElement && focused.type === 'text',
    });
    const previous = this.current;
    if (sameState(previous, next)) {
      // Same room for the app, but the window may have been resized.
      this.listener(next, next);
      return;
    }
    this.current = next;
    const { inset } = next;
    this.root.classList.toggle('is-inset', inset !== null);
    if (inset) {
      this.root.style.setProperty('--app-top', `${inset.top}px`);
      this.root.style.setProperty('--app-height', `${inset.height}px`);
      // iOS also scrolls the page itself to bring the field into sight.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    }
    this.listener(next, previous);
  };
}
