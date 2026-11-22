// drawCannon on a recording stand-in for the 2D context: every model fits the same
// footprint with the muzzle at LAYOUT.barrelLength, and every pose leaves the context as
// it found it (no throw, balanced save/restore, no rotation or blending left behind).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { itemsOfType } from '../../cosmetics/catalog.ts';
import { DEFAULT_COSMETICS } from '../../cosmetics/equip.ts';
import type { CannonParams } from '../../cosmetics/types.ts';
import { SETTLED_SHOT_AGE } from '../entities/Cannon.ts';
import { createCannonPose, drawCannon, type CannonPose } from './drawCannon.ts';
import { LAYOUT } from './layout.ts';
import { Skin } from './skin.ts';

type Matrix = [number, number, number, number, number, number];

interface Recording {
  readonly ctx: CanvasRenderingContext2D;
  /** World points of every path/shape (glow sprites excluded). */
  readonly points: { x: number; y: number }[];
  images: number;
  depth: number;
  /** Context state right before the outermost restore(). */
  final: { alpha: number; composite: string; rotation: number } | null;
}

function record(): Recording {
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: { m: Matrix; alpha: number; composite: string }[] = [];
  const rec: Recording = { ctx: null as unknown as CanvasRenderingContext2D, points: [], images: 0, depth: 0, final: null };
  const at = (x: number, y: number, r = 0): void => {
    const wx = m[0] * x + m[2] * y + m[4];
    const wy = m[1] * x + m[3] * y + m[5];
    rec.points.push({ x: wx - r, y: wy - r }, { x: wx + r, y: wy + r });
  };
  const gradient = { addColorStop: () => {} };
  const state = { globalAlpha: 1, globalCompositeOperation: 'source-over' };
  const ctx = {
    ...state,
    save() {
      stack.push({ m: [...m], alpha: ctx.globalAlpha, composite: ctx.globalCompositeOperation });
      rec.depth++;
    },
    restore() {
      if (rec.depth === 1) {
        rec.final = { alpha: ctx.globalAlpha, composite: ctx.globalCompositeOperation, rotation: Math.atan2(m[1], m[0]) };
      }
      const top = stack.pop();
      if (!top) throw new Error('restore without save');
      m = top.m;
      ctx.globalAlpha = top.alpha;
      ctx.globalCompositeOperation = top.composite;
      rec.depth--;
    },
    translate(x: number, y: number) {
      m[4] += m[0] * x + m[2] * y;
      m[5] += m[1] * x + m[3] * y;
    },
    rotate(a: number) {
      const [ma, mb, mc, md] = m;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      m = [ma * cos + mc * sin, mb * cos + md * sin, -ma * sin + mc * cos, -mb * sin + md * cos, m[4], m[5]];
    },
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
      m = [a, b, c, d, e, f];
    },
    moveTo: at,
    lineTo: at,
    rect(x: number, y: number, w: number, h: number) {
      at(x, y);
      at(x + w, y + h);
    },
    fillRect(x: number, y: number, w: number, h: number) {
      at(x, y);
      at(x + w, y + h);
    },
    roundRect(x: number, y: number, w: number, h: number) {
      at(x, y);
      at(x + w, y + h);
    },
    arc(x: number, y: number, r: number, start: number, end: number) {
      ctx.ellipse(x, y, r, r, 0, start, end);
    },
    /** Sampled along the drawn part only (start..end, tilted by `rotation`). */
    ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number) {
      const span = Math.min(Math.abs(end - start), Math.PI * 2);
      for (let i = 0; i <= 32; i++) {
        const t = start + (span * i) / 32;
        const ex = rx * Math.cos(t);
        const ey = ry * Math.sin(t);
        at(x + ex * Math.cos(rotation) - ey * Math.sin(rotation), y + ex * Math.sin(rotation) + ey * Math.cos(rotation));
      }
    },
    drawImage() {
      rec.images++;
    },
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    beginPath() {},
    closePath() {},
    fill() {},
    stroke() {},
  };
  (rec as { ctx: CanvasRenderingContext2D }).ctx = ctx as unknown as CanvasRenderingContext2D;
  return rec;
}

const CANNONS = itemsOfType('cannon').map((item) => ({ id: item.id, params: item.params }));

const skins = new Map<CannonParams, Skin>();

function skinOf(params: CannonParams): Skin {
  const skin = skins.get(params) ?? new Skin({ ...DEFAULT_COSMETICS, cannon: params });
  skins.set(params, skin);
  return skin;
}

function draw(params: CannonParams, pose: CannonPose): Recording {
  const rec = record();
  drawCannon(rec.ctx, skinOf(params), 0, 0, pose);
  return rec;
}

function bounds(rec: Recording): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs = rec.points.map((p) => p.x);
  const ys = rec.points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

beforeAll(() => {
  // Sprites (glows, smoke) are pre-rendered on canvases: give them the stand-in too.
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => record().ctx }) });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('drawCannon', () => {
  it.each(CANNONS)('$id fits the footprint, with the muzzle at the barrel length', ({ params }) => {
    const pose = createCannonPose();
    pose.time = 1.7;
    const box = bounds(draw(params, pose));
    expect(box.minX).toBeGreaterThanOrEqual(-LAYOUT.baseRadius - 0.5);
    expect(box.maxX).toBeLessThanOrEqual(LAYOUT.baseRadius + 0.5);
    expect(box.minY).toBeCloseTo(-LAYOUT.barrelLength, 1);
    expect(box.maxY).toBeLessThanOrEqual(17);
  });

  it.each(CANNONS.filter(({ params }) => params.barrel !== 'twin'))('$id slides its barrel back on recoil', ({ params }) => {
    const pose = createCannonPose();
    pose.recoil[0] = 1;
    expect(bounds(draw(params, pose)).minY).toBeCloseTo(-LAYOUT.barrelLength + LAYOUT.recoilDistance, 1);
  });

  it.each(CANNONS)('$id leaves the context as it found it, in every pose', ({ params }) => {
    for (const angle of [-1.35, -0.4, 0, 0.7, 1.35]) {
      for (const age of [0, 0.03, 0.1, 0.3, SETTLED_SHOT_AGE]) {
        for (const reduced of [false, true]) {
          const pose = createCannonPose();
          pose.angle = angle;
          pose.recoil = [age < 0.14 ? 1 - age / 0.14 : 0, 0.5];
          pose.shotAge = [age, Math.min(SETTLED_SHOT_AGE, age + 0.1)];
          pose.shotSeed = [3, 2];
          pose.energy = angle > 0 ? 1 : 0.4;
          pose.missFlash = age === 0.03;
          pose.time = 2.5 + angle;
          pose.reduced = reduced;
          const rec = draw(params, pose);
          expect(rec.depth).toBe(0);
          expect(rec.final).toEqual({ alpha: 1, composite: 'source-over', rotation: expect.closeTo(0, 9) });
        }
      }
    }
  });

  it.each(CANNONS)('$id: "Reduzir efeitos" drops the sparks and smoke after a shot', ({ params }) => {
    const firing = (reduced: boolean): number => {
      const pose = createCannonPose();
      pose.shotAge = [0.1, SETTLED_SHOT_AGE];
      pose.reduced = reduced;
      const rec = draw(params, pose);
      return rec.images + rec.points.length;
    };
    expect(firing(true)).toBeLessThan(firing(false));
  });
});
