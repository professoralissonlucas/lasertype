import { describe, expect, it } from 'vitest';
import { FULL_VIEWPORT, ViewportModel, type ViewportReading } from './viewport.ts';

const PHONE: ViewportReading = { width: 360, height: 740, visibleTop: 0, visibleHeight: 740, scale: 1, editing: false };
const reading = (patch: Partial<ViewportReading> = {}): ViewportReading => ({ ...PHONE, ...patch });

describe('ViewportModel', () => {
  it('gives the app the whole page when nothing covers it', () => {
    expect(new ViewportModel().update(reading())).toEqual(FULL_VIEWPORT);
    // Focusing a field with a hardware keyboard covers nothing.
    expect(new ViewportModel().update(reading({ editing: true }))).toEqual(FULL_VIEWPORT);
  });

  it('keyboard over the page (iOS, Chrome on Android): the app takes what is left', () => {
    const model = new ViewportModel();
    model.update(reading());
    expect(model.update(reading({ visibleHeight: 440, editing: true }))).toEqual({
      inset: { top: 0, height: 440 },
      keyboard: true,
    });
    // The page was also scrolled to show the field.
    expect(model.update(reading({ visibleHeight: 440, visibleTop: 85.6, editing: true })).inset).toEqual({ top: 86, height: 440 });
    expect(model.update(reading())).toEqual(FULL_VIEWPORT);
  });

  it('keyboard that shrinks the page itself: no inset, but the keyboard is up', () => {
    const model = new ViewportModel();
    model.update(reading());
    expect(model.update(reading({ height: 440, visibleHeight: 440, editing: true }))).toEqual({ inset: null, keyboard: true });
    expect(model.update(reading({ editing: true }))).toEqual(FULL_VIEWPORT); // closed with the back button
  });

  it('a window made shorter is not a keyboard (nothing is being edited)', () => {
    const model = new ViewportModel();
    model.update(reading({ width: 1280, height: 900, visibleHeight: 900 }));
    expect(model.update(reading({ width: 1280, height: 500, visibleHeight: 500 }))).toEqual(FULL_VIEWPORT);
  });

  it('browser bars and the shortcut bar of a hardware keyboard are not a keyboard', () => {
    const model = new ViewportModel();
    model.update(reading());
    expect(model.update(reading({ visibleHeight: 685, editing: true }))).toEqual({ inset: { top: 0, height: 685 }, keyboard: false });
  });

  it('turning the phone starts over: a shorter page is not a keyboard', () => {
    const model = new ViewportModel();
    model.update(reading());
    expect(model.update(reading({ width: 740, height: 360, visibleHeight: 360, editing: true }))).toEqual(FULL_VIEWPORT);
    expect(model.update(reading({ width: 740, height: 360, visibleHeight: 170, editing: true })).keyboard).toBe(true);
  });

  it('pinch zoom shows a part of the app; the app does not move or shrink', () => {
    const model = new ViewportModel();
    model.update(reading());
    expect(model.update(reading({ visibleHeight: 370, visibleTop: 120, scale: 2 }))).toEqual(FULL_VIEWPORT);
  });

  it('ignores sub-pixel differences', () => {
    expect(new ViewportModel().update(reading({ visibleHeight: 739.4, visibleTop: 0.2 }))).toEqual(FULL_VIEWPORT);
  });
});
