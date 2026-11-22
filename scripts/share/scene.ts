// The share images, drawn in a browser with the game's own renderer (background, words,
// laser, particles, cannon) and posted back to scripts/share-images.ts, which saves them:
//   og-image.jpg          1200×630  Open Graph preview (WhatsApp, social networks)
//   apple-touch-icon.png  180×180   public/favicon.svg on the background color (iOS)
import { DEFAULT_COSMETICS } from '../../src/cosmetics/equip.ts';
import { Effects } from '../../src/game/effects/Effects.ts';
import { LaserPool } from '../../src/game/entities/Laser.ts';
import { BackgroundState } from '../../src/game/render/background.ts';
import { drawBackground } from '../../src/game/render/drawBackground.ts';
import { createCannonPose, drawCannon } from '../../src/game/render/drawCannon.ts';
import { drawBeams, drawParticles } from '../../src/game/render/drawFx.ts';
import { drawWord, type WordMetrics, type WordVisual } from '../../src/game/render/drawWord.ts';
import { LAYOUT } from '../../src/game/render/layout.ts';
import { PALETTE, withAlpha } from '../../src/game/render/palette.ts';
import { WORD_FONT_FAMILY } from '../../src/game/render/renderer.ts';
import { Skin } from '../../src/game/render/skin.ts';
import { bandSprite } from '../../src/game/render/sprites.ts';
import { createTranslator } from '../../src/ui/i18n.ts';
import { aimAngle } from '../../src/utils/math.ts';
import { createRng } from '../../src/utils/rng.ts';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const TOUCH_ICON_SIZE = 180;
const JPEG_QUALITY = 0.88;

/** Same stack as --font-display (styles/tokens.css). */
const DISPLAY_FONT = "'Orbitron', 'Segoe UI', system-ui, sans-serif";
/** The scene is laid out in game pixels and drawn 1.5× larger (OG_WIDTH / SCALE wide). */
const SCALE = 1.5;
const VW = OG_WIDTH / SCALE;
const VH = OG_HEIGHT / SCALE;
const FONT_SIZE = 20;
const PERIMETER_Y = VH - 80;
const CANNON_X = VW / 2;
const CANNON_Y = VH - 24;
const STEP = 1 / 60;

interface SceneWord extends WordVisual {
  /** Horizontal center (fraction of the width) and vertical center (game px). */
  readonly cx: number;
  readonly y: number;
}

/** Locked target: four letters already shot, the laser hitting the fourth. */
const TARGET: SceneWord = { text: 'galáxia', typed: 4, kind: 'normal', armor: 0, cx: 0.66, y: 226 };
const WORDS: readonly SceneWord[] = [
  { text: 'cometa', typed: 0, kind: 'normal', armor: 0, cx: 0.16, y: 172 },
  { text: 'satélite', typed: 0, kind: 'ice', armor: 0, cx: 0.85, y: 162 },
  { text: 'órbita', typed: 0, kind: 'bomb', armor: 0, cx: 0.27, y: 268 },
  { text: 'radar', typed: 0, kind: 'normal', armor: 0, cx: 0.87, y: 296 },
];
/** A word that blew up a moment ago (its letters fly off). */
const EXPLODED = { text: 'nebulosa', cx: 0.44, y: 178, age: 0.14 };

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D canvas');
  return ctx;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(`toBlob ${type} failed`))), type, quality);
  });
}

/** The game's perimeter at rest (renderer.ts): a soft band under a dashed line. */
function drawPerimeter(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.18;
  ctx.drawImage(bandSprite(PALETTE.danger), 0, PERIMETER_Y - 14, VW, 28);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = PALETTE.danger;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  ctx.moveTo(0, PERIMETER_Y);
  ctx.lineTo(VW, PERIMETER_Y);
  ctx.stroke();
  ctx.restore();
}

/** Centered text with letter spacing (which also pads after the last letter). */
function spacedText(ctx: CanvasRenderingContext2D, text: string, size: number, spacing: number, y: number): void {
  ctx.letterSpacing = `${size * spacing}px`;
  ctx.fillText(text, OG_WIDTH / 2 + (size * spacing) / 2, y);
}

/** Title and tagline over a darkened top, in real pixels. */
function drawTitle(ctx: CanvasRenderingContext2D): void {
  const shade = ctx.createLinearGradient(0, 0, 0, 290);
  shade.addColorStop(0, withAlpha(PALETTE.bg, 0.82));
  shade.addColorStop(0.65, withAlpha(PALETTE.bg, 0.45));
  shade.addColorStop(1, withAlpha(PALETTE.bg, 0));
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, OG_WIDTH, 290);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 96px ${DISPLAY_FONT}`;
  ctx.fillStyle = PALETTE.primary;
  ctx.shadowColor = PALETTE.primary;
  const glow: readonly (readonly [number, number])[] = [
    [48, 0.45],
    [16, 0.7],
    [0, 1],
  ];
  for (const [blur, alpha] of glow) {
    ctx.shadowBlur = blur;
    ctx.globalAlpha = alpha;
    spacedText(ctx, 'LASER TYPE', 96, 0.16, 112);
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  ctx.font = `600 28px ${DISPLAY_FONT}`;
  ctx.fillStyle = PALETTE.text;
  spacedText(ctx, createTranslator('pt-BR')('tagline'), 28, 0.06, 186);
  ctx.letterSpacing = '0px';
}

function drawOgImage(canvas: HTMLCanvasElement): void {
  canvas.width = OG_WIDTH;
  canvas.height = OG_HEIGHT;
  const ctx = context(canvas);
  const skin = new Skin(DEFAULT_COSMETICS);
  const font = `${FONT_SIZE}px ${WORD_FONT_FAMILY}`;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.font = font;
  const charWidth = ctx.measureText('M').width;
  const startX = (word: { readonly text: string; readonly cx: number }): number =>
    VW * word.cx - (word.text.length * charWidth) / 2;

  const background = new BackgroundState(createRng('share-stars'));
  const nebula = ctx.createPattern(skin.nebula, 'repeat');
  drawBackground(ctx, skin, nebula, new DOMMatrix(), background, 1, VW, VH);
  drawPerimeter(ctx);

  // The shot: the cannon aims at the 4th letter of the target and the laser hits it
  // (at the foot of the letter, so the spark does not hide it in a still image).
  const letterX = startX(TARGET) + (TARGET.typed - 0.5) * charWidth;
  const hitY = TARGET.y + FONT_SIZE * 0.5;
  const angle = aimAngle(CANNON_X, CANNON_Y, letterX, hitY);
  const muzzleX = CANNON_X + Math.sin(angle) * LAYOUT.barrelLength;
  const muzzleY = CANNON_Y - Math.cos(angle) * LAYOUT.barrelLength;
  const lasers = new LaserPool(1);
  lasers.fire(muzzleX, muzzleY, letterX, hitY, 0.12);

  // Particles: the explosion has had a moment to spread; the impact is fresh.
  const fx = new Effects(false, 'share-fx', DEFAULT_COSMETICS.explosion);
  fx.explosion(EXPLODED.text, startX(EXPLODED), charWidth, EXPLODED.y);
  for (let t = 0; t < EXPLODED.age; t += STEP) fx.update(STEP);
  fx.impact(letterX, hitY, angle);
  for (let i = 0; i < 4; i++) fx.update(STEP);

  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const metrics: WordMetrics = { x: 0, y: 0, fontSize: FONT_SIZE, charWidth, padX: LAYOUT.wordPadX, dpr: SCALE };
  for (const word of [...WORDS, TARGET]) {
    metrics.x = startX(word);
    metrics.y = word.y;
    drawWord(ctx, skin, word, word === TARGET, metrics, false);
  }
  drawParticles(ctx, fx.particles, 1, skin, font);
  drawBeams(ctx, lasers, skin, SCALE);
  // Just fired: barrel kicked back, muzzle hot and sparking, core charged by a combo.
  const pose = createCannonPose();
  pose.angle = angle;
  pose.recoil[0] = 0.75;
  pose.shotAge[0] = 0.03;
  pose.shotSeed[0] = 3;
  pose.energy = 0.75;
  pose.time = 1.2;
  drawCannon(ctx, skin, CANNON_X, CANNON_Y, pose);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawTitle(ctx);
}

async function drawTouchIcon(canvas: HTMLCanvasElement): Promise<void> {
  const icon = new Image(TOUCH_ICON_SIZE, TOUCH_ICON_SIZE);
  icon.src = `${import.meta.env.BASE_URL}favicon.svg`;
  await icon.decode();
  canvas.width = TOUCH_ICON_SIZE;
  canvas.height = TOUCH_ICON_SIZE;
  const ctx = context(canvas);
  // iOS rounds the corners itself and shows transparency as black: fill the whole square.
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, TOUCH_ICON_SIZE, TOUCH_ICON_SIZE);
  ctx.drawImage(icon, 0, 0, TOUCH_ICON_SIZE, TOUCH_ICON_SIZE);
}

async function send(file: string, blob: Blob): Promise<void> {
  const response = await fetch(`/__share?file=${encodeURIComponent(file)}`, { method: 'POST', body: blob });
  if (!response.ok) throw new Error(`saving ${file}: HTTP ${response.status}`);
}

async function run(): Promise<void> {
  await document.fonts.ready;
  const og = document.createElement('canvas');
  drawOgImage(og);
  document.body.append(og);
  await send('og-image.jpg', await toBlob(og, 'image/jpeg', JPEG_QUALITY));

  const icon = document.createElement('canvas');
  await drawTouchIcon(icon);
  document.body.append(icon);
  await send('apple-touch-icon.png', await toBlob(icon, 'image/png'));
}

run().catch((error: unknown) => {
  void fetch(`/__share?error=${encodeURIComponent(String(error))}`, { method: 'POST' });
});
