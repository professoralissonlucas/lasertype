// Game loop: requestAnimationFrame, fixed timestep, interpolated render.
import { CONFIG } from '../config.ts';
import { aimAngle } from '../utils/math.ts';
import { getWordList } from '../words/index.ts';
import type { Language, WordList } from '../words/types.ts';
import { Cannon } from './entities/Cannon.ts';
import { LaserPool } from './entities/Laser.ts';
import { KeyboardInput, type InputAction } from './input.ts';
import { letterCenterX, muzzlePosition, toScreenY } from './render/layout.ts';
import { Renderer } from './render/renderer.ts';
import { Spawner } from './spawner.ts';
import {
  createMatchState,
  lockedWord,
  stepMatch,
  typeChar,
  unlockTarget,
  type MatchState,
} from './state.ts';
import { FixedTimestep } from './timestep.ts';
import type { GameEvent, TypingOptions } from './types.ts';

// Visual timings (not balancing).
const LASER_LIFETIME = 0.12;
const MISS_FLASH_SECONDS = 0.18;
const LASER_POOL_SIZE = 32;

export interface GameOptions {
  readonly lang: Language;
  /** Fixed seed (e.g. from `?seed=`); null = a new seed every match. */
  readonly seed: string | null;
  readonly requireAccents: boolean;
}

/** The DOM side (HUD, overlays). Called only when something it shows has changed. */
export interface GameView {
  sync(state: Readonly<MatchState>): void;
}

export class Game {
  private readonly renderer: Renderer;
  private readonly view: GameView;
  private readonly options: GameOptions;
  private readonly typing: TypingOptions;
  private readonly words: WordList;
  private readonly input = new KeyboardInput();
  private readonly timestep = new FixedTimestep(CONFIG.updatesPerSecond, CONFIG.maxFrameSeconds);
  private readonly cannon = new Cannon();
  private readonly lasers = new LaserPool(LASER_POOL_SIZE);
  private readonly events: GameEvent[] = [];
  private state: MatchState;
  private spawner: Spawner;
  private missFlash = 0;
  private lastTime: number | null = null;
  private rafId: number | null = null;

  constructor(canvas: HTMLCanvasElement, view: GameView, options: GameOptions) {
    this.renderer = new Renderer(canvas);
    this.view = view;
    this.options = options;
    this.typing = { requireAccents: options.requireAccents };
    this.words = getWordList(options.lang);
    this.state = createMatchState();
    this.spawner = this.createSpawner();
  }

  start(): void {
    if (this.rafId !== null) return;
    this.renderer.attach();
    this.input.attach(window);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.view.sync(this.state);
    this.lastTime = null;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.renderer.detach();
    this.input.detach();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  restart(): void {
    this.state = createMatchState();
    this.spawner = this.createSpawner();
    this.cannon.reset();
    this.lasers.clear();
    this.missFlash = 0;
    this.events.length = 0;
    this.timestep.reset();
    this.view.sync(this.state);
  }

  private createSpawner(): Spawner {
    return new Spawner(this.options.seed ?? Date.now(), this.words, CONFIG.spawn);
  }

  private readonly frame = (now: number): void => {
    const dt = this.lastTime === null ? 0 : (now - this.lastTime) / 1000;
    this.lastTime = now;

    const steps = this.timestep.advance(dt);
    for (let i = 0; i < steps; i++) this.update(this.timestep.step);
    this.render(this.timestep.alpha);

    this.rafId = requestAnimationFrame(this.frame);
  };

  /** One fixed update. */
  private update(dt: number): void {
    this.input.drain(this.handleAction);
    this.cannon.beginStep();
    stepMatch(this.state, dt, this.spawner, this.events);
    this.aimCannon(dt);
    this.lasers.update(dt);
    this.missFlash = Math.max(0, this.missFlash - dt);
    this.flushEvents();
  }

  private readonly handleAction = (action: InputAction): void => {
    switch (action.type) {
      case 'char':
        typeChar(this.state, action.char, this.typing, this.events);
        break;
      case 'unlock':
        unlockTarget(this.state, this.events);
        break;
      case 'restart':
        this.restart();
        break;
      case 'confirm':
        if (this.state.status === 'gameover') this.restart();
        break;
    }
  };

  /** Tracks the next letter of the locked word; rests upright otherwise. */
  private aimCannon(dt: number): void {
    const word = lockedWord(this.state);
    let target = 0;
    if (word) {
      const { layout, charWidth } = this.renderer;
      const index = Math.min(word.typed, word.text.length - 1);
      const x = letterCenterX(layout, word.x, word.text.length, index, charWidth);
      target = aimAngle(layout.cannonX, layout.cannonY, x, toScreenY(layout, word.y));
    }
    this.cannon.turnTowards(target, dt);
  }

  private flushEvents(): void {
    let viewDirty = false;
    for (const event of this.events) {
      switch (event.type) {
        case 'hit':
          this.fireLaser(event);
          break;
        case 'miss':
          this.missFlash = MISS_FLASH_SECONDS;
          break;
        case 'destroy':
        case 'breach':
        case 'gameover':
          viewDirty = true;
          break;
        case 'spawn':
        case 'lock':
        case 'unlock':
          break;
      }
    }
    this.events.length = 0;
    if (viewDirty) this.view.sync(this.state);
  }

  private fireLaser(hit: Extract<GameEvent, { type: 'hit' }>): void {
    const { layout, charWidth } = this.renderer;
    const tx = letterCenterX(layout, hit.x, hit.length, hit.index, charWidth);
    const ty = toScreenY(layout, hit.y);
    this.cannon.snapTo(aimAngle(layout.cannonX, layout.cannonY, tx, ty));
    const muzzle = muzzlePosition(layout, this.cannon.angle);
    this.lasers.fire(muzzle.x, muzzle.y, tx, ty, LASER_LIFETIME);
  }

  private render(alpha: number): void {
    // Once the match is frozen, interpolating would make words jitter between two positions.
    const a = this.state.status === 'playing' ? alpha : 1;
    this.renderer.draw({
      state: this.state,
      alpha: a,
      cannonAngle: this.cannon.interpolated(alpha),
      lasers: this.lasers,
      missFlash: this.missFlash > 0,
    });
  }

  /** Hidden tabs pause requestAnimationFrame; don't count that time when coming back. */
  private readonly onVisibilityChange = (): void => {
    this.lastTime = null;
  };
}
