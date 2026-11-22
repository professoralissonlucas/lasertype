// Game loop: requestAnimationFrame, fixed timestep, interpolated render.
// The loop always runs: without a match (menus) it renders the idle station over the
// animated background; `startMatch` begins a match, `stopMatch` returns to idle.
import type { SoundPlayer } from '../audio/types.ts';
import { CONFIG } from '../config.ts';
import { DEFAULT_COSMETICS } from '../cosmetics/equip.ts';
import type { ResolvedCosmetics } from '../cosmetics/types.ts';
import type { ModeRules } from '../modes/types.ts';
import { aimAngle } from '../utils/math.ts';
import { createRng } from '../utils/rng.ts';
import { getWordList } from '../words/index.ts';
import type { Language, WordList } from '../words/types.ts';
import { applyDifficulty } from './difficulty.ts';
import { Effects } from './effects/Effects.ts';
import { Cannon } from './entities/Cannon.ts';
import { LaserPool } from './entities/Laser.ts';
import { KeyboardInput, type InputAction } from './input.ts';
import { BackgroundState } from './render/background.ts';
import { muzzleSideOffset } from './render/drawCannon.ts';
import {
  letterCenterX,
  muzzlePosition,
  toScreenX,
  toScreenY,
  wordStartX,
  type Layout,
} from './render/layout.ts';
import { Renderer } from './render/renderer.ts';
import { Spawner } from './spawner.ts';
import {
  activateEmp,
  createMatchState,
  endMatch,
  lockedWord,
  stepMatch,
  togglePause,
  typeChar,
  unlockTarget,
  type MatchState,
} from './state.ts';
import { FixedTimestep } from './timestep.ts';
import type { GameDifficulty, GameEvent, TypingOptions } from './types.ts';

// Visual/audio timings (not balancing).
const LASER_LIFETIME = 0.12;
const MISS_FLASH_SECONDS = 0.18;
const LASER_POOL_SIZE = 32;
/** Each letter of a word fires a slightly higher-pitched shot. */
const SHOT_PITCH_STEP = 0.035;
const SHOT_PITCH_MAX_STEPS = 12;
const STARFIELD_SEED = 'orbital-defense-stars';
/** Glows for a shield pickup rise from just above the cannon dome (px). */
const SHIELD_GLOW_OFFSET = 30;
/** Continuous HUD values (time, WPM) refresh this often (s). */
const HUD_REFRESH = 0.1;

export interface MatchConfig {
  readonly lang: Language;
  readonly mode: ModeRules;
  readonly difficulty: GameDifficulty;
  /** Fixed seed (e.g. from `?seed=`); null = a new seed every match. */
  readonly seed: string | null;
  readonly requireAccents: boolean;
  /** "Reduzir efeitos": no shake/flash, static background, fewer particles. */
  readonly reduceEffects: boolean;
}

/** The DOM side (HUD, overlays, combat log). */
export interface GameView {
  /** A match (re)started with a fresh state. */
  onMatchStart(state: Readonly<MatchState>): void;
  /** Something shown in the HUD/overlays may have changed. */
  sync(state: Readonly<MatchState>): void;
  /** Everything that happened in the last update (combat log). */
  onEvents(events: readonly GameEvent[], state: Readonly<MatchState>): void;
  /** Esc on the Mission Report: the player wants the menu. */
  onExitRequest(): void;
}

interface ActiveMatch {
  readonly config: MatchConfig;
  readonly words: WordList;
  readonly typing: TypingOptions;
  state: MatchState;
  spawner: Spawner;
}

export class Game {
  private readonly renderer: Renderer;
  private readonly view: GameView;
  private readonly sound: SoundPlayer;
  private readonly input = new KeyboardInput();
  private readonly timestep = new FixedTimestep(CONFIG.updatesPerSecond, CONFIG.maxFrameSeconds);
  private readonly cannon = new Cannon();
  private readonly lasers = new LaserPool(LASER_POOL_SIZE);
  private readonly background = new BackgroundState(createRng(STARFIELD_SEED));
  private readonly events: GameEvent[] = [];
  private effects = new Effects(false);
  private cosmetics: ResolvedCosmetics = DEFAULT_COSMETICS;
  private match: ActiveMatch | null = null;
  /** Shots fired (twin barrels alternate sides). */
  private shots = 0;
  /** Background drift outside matches (menus follow the "Reduzir efeitos" setting too). */
  private idleReducedEffects = false;
  private missFlash = 0;
  /** After a shot the cannon holds its aim while the beam is visible (beam and barrel stay aligned). */
  private aimHold = 0;
  private hudTimer = 0;
  /** Wall-clock animation time for pulses (keeps running while paused). */
  private animTime = 0;
  private lastTime: number | null = null;
  private rafId: number | null = null;

  constructor(canvas: HTMLCanvasElement, view: GameView, sound: SoundPlayer) {
    this.renderer = new Renderer(canvas);
    this.view = view;
    this.sound = sound;
  }

  /** Read-only view of the current match, null in menus (dev console / end-to-end checks). */
  get state(): Readonly<MatchState> | null {
    return this.match?.state ?? null;
  }

  /** Starts the render loop (idle until `startMatch`). */
  start(): void {
    if (this.rafId !== null) return;
    this.renderer.attach();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.lastTime = null;
    this.rafId = requestAnimationFrame(this.frame);
  }

  setIdleReducedEffects(reduced: boolean): void {
    this.idleReducedEffects = reduced;
  }

  /** Equipped cosmetics (visual only; may change at any time, even mid-match). */
  setCosmetics(cosmetics: ResolvedCosmetics): void {
    this.cosmetics = cosmetics;
    this.renderer.setCosmetics(cosmetics);
    this.effects.explosionStyle = cosmetics.explosion;
  }

  startMatch(config: MatchConfig): void {
    const words = getWordList(config.lang);
    this.effects = new Effects(config.reduceEffects, undefined, this.cosmetics.explosion);
    this.match = {
      config,
      words,
      typing: { requireAccents: config.requireAccents },
      state: this.createState(config),
      spawner: this.createSpawner(config, words),
    };
    this.resetMatchVisuals();
    this.input.attach(window);
    this.view.onMatchStart(this.match.state);
    this.view.sync(this.match.state);
  }

  /** Same settings, fresh match (Tab, "Jogar de novo"). */
  restart(): void {
    if (this.match) this.startMatch(this.match.config);
  }

  /** Leaves the match and goes back to the idle station. */
  stopMatch(): void {
    this.input.detach();
    this.match = null;
    this.resetMatchVisuals();
  }

  togglePause(): void {
    if (!this.match) return;
    togglePause(this.match.state, this.events);
    this.flushEvents();
  }

  /** Ends the match early (pause → "Encerrar"): goes to the Mission Report. */
  quit(): void {
    if (!this.match) return;
    endMatch(this.match.state, 'quit', this.events);
    this.flushEvents();
  }

  private createState(config: MatchConfig): MatchState {
    return createMatchState({ mode: config.mode, difficulty: config.difficulty });
  }

  private createSpawner(config: MatchConfig, words: WordList): Spawner {
    return new Spawner(config.seed ?? Date.now(), words, {
      spawn: applyDifficulty(CONFIG.spawn, CONFIG.difficulty[config.difficulty]),
      waves: CONFIG.waves,
      specials: CONFIG.specials,
      waveBreak: config.mode.waveBreak,
    });
  }

  private resetMatchVisuals(): void {
    this.cannon.reset();
    this.lasers.clear();
    this.effects.clear();
    this.missFlash = 0;
    this.aimHold = 0;
    this.hudTimer = 0;
    this.events.length = 0;
    this.timestep.reset();
  }

  private readonly frame = (now: number): void => {
    const dt = this.lastTime === null ? 0 : (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.animTime += dt;

    const steps = this.timestep.advance(dt);
    for (let i = 0; i < steps; i++) this.update(this.timestep.step);
    this.render(this.timestep.alpha);

    this.rafId = requestAnimationFrame(this.frame);
  };

  /** One fixed update. While paused only input is processed. */
  private update(dt: number): void {
    const match = this.match;
    if (!match) {
      this.idle(dt);
      return;
    }
    this.input.drain(this.handleAction);
    // Input may have restarted or left the match.
    if (this.match !== match) return;

    const state = match.state;
    if (state.status === 'paused') {
      this.flushEvents();
      return;
    }
    this.cannon.beginStep();
    stepMatch(state, dt, match.spawner, this.events);
    this.aimCannon(state, dt);
    this.cannon.recover(dt);
    this.lasers.update(dt);
    // Effects and background keep animating after game over.
    this.effects.update(dt);
    if (!match.config.reduceEffects) this.background.update(dt);
    this.missFlash = Math.max(0, this.missFlash - dt);
    this.flushEvents();

    // Continuously changing HUD values (time, WPM, countdowns).
    if (state.status === 'playing') {
      this.hudTimer += dt;
      if (this.hudTimer >= HUD_REFRESH) {
        this.hudTimer = 0;
        this.view.sync(state);
      }
    }
  }

  /** Menus: the station idles over the drifting background. */
  private idle(dt: number): void {
    this.cannon.beginStep();
    this.cannon.turnTowards(0, dt);
    this.cannon.recover(dt);
    this.effects.update(dt);
    if (!this.idleReducedEffects) this.background.update(dt);
  }

  private readonly handleAction = (action: InputAction): void => {
    const match = this.match;
    if (!match) return;
    const state = match.state;
    switch (action.type) {
      case 'char':
        typeChar(state, action.char, match.typing, this.events);
        break;
      case 'unlock':
        unlockTarget(state, this.events);
        break;
      case 'emp':
        activateEmp(state, this.events);
        break;
      case 'pause':
        // Esc pauses during play; on the Mission Report it goes back to the menu.
        if (state.status === 'gameover') this.view.onExitRequest();
        else togglePause(state, this.events);
        break;
      case 'restart':
        this.restart();
        break;
      case 'confirm':
        if (state.status === 'gameover') this.restart();
        else if (state.status === 'paused') endMatch(state, 'quit', this.events);
        break;
    }
  };

  /** Tracks the next letter of the locked word; rests upright otherwise. */
  private aimCannon(state: MatchState, dt: number): void {
    if (this.aimHold > 0) {
      this.aimHold = Math.max(0, this.aimHold - dt);
      return;
    }
    const word = lockedWord(state);
    let target = 0;
    if (word) {
      const { layout, charWidth } = this.renderer;
      const index = Math.min(word.typed, word.text.length - 1);
      const x = letterCenterX(layout, word.x, word.text.length, index, charWidth);
      target = aimAngle(layout.cannonX, layout.cannonY, x, toScreenY(layout, word.y));
    }
    this.cannon.turnTowards(target, dt);
  }

  /** Turns logic events into lasers, particles, shake/flash, sounds and HUD updates. */
  private flushEvents(): void {
    const match = this.match;
    if (!match || this.events.length === 0) return;
    const { layout, charWidth } = this.renderer;
    let viewDirty = false;

    for (const event of this.events) {
      switch (event.type) {
        case 'hit':
          this.fire(event);
          break;
        case 'miss':
          this.missFlash = MISS_FLASH_SECONDS;
          this.sound.play('miss');
          viewDirty = true;
          break;
        case 'unlock':
          this.sound.play('unlock');
          break;
        case 'armorBreak': {
          const startX = wordStartX(layout, event.x, event.length, charWidth);
          this.effects.armorBreak(startX, event.length * charWidth, toScreenY(layout, event.y));
          this.sound.play('armor');
          break;
        }
        case 'destroy': {
          const startX = wordStartX(layout, event.x, event.text.length, charWidth);
          const y = toScreenY(layout, event.y);
          const area = event.cause !== 'typed';
          this.effects.explosion(event.text, startX, charWidth, y, area);
          if (event.points > 0) {
            this.effects.scorePopup(startX + (event.text.length * charWidth) / 2, y, event.points);
          }
          // Bomb/EMP kills are covered by the blast sound.
          if (!area) this.sound.play('explosion');
          viewDirty = true;
          break;
        }
        case 'bomb':
          this.effects.bomb(toScreenX(layout, event.x), toScreenY(layout, event.y), bombRadiusPx(layout));
          this.sound.play('bomb');
          break;
        case 'emp':
          this.effects.emp(layout.cannonX, layout.cannonY, Math.hypot(layout.width, layout.height));
          this.sound.play('emp');
          viewDirty = true;
          break;
        case 'empDenied':
          this.sound.play('miss');
          break;
        case 'empReady':
          this.sound.play('empReady');
          viewDirty = true;
          break;
        case 'multiplier':
          this.sound.play('multiplier');
          viewDirty = true;
          break;
        case 'slow':
          this.sound.play('freeze');
          viewDirty = true;
          break;
        case 'shieldUp':
          this.effects.shieldUp(layout.cannonX, layout.cannonY - SHIELD_GLOW_OFFSET);
          this.sound.play('shieldUp');
          viewDirty = true;
          break;
        case 'breach': {
          const startX = wordStartX(layout, event.x, event.text.length, charWidth);
          this.effects.breach(event.text, startX, charWidth, layout.perimeterY, event.damage);
          this.sound.play(event.damage ? 'breach' : 'unlock');
          viewDirty = true;
          break;
        }
        case 'wave':
          this.sound.play('wave');
          viewDirty = true;
          break;
        case 'gameover':
          this.sound.play('gameover');
          viewDirty = true;
          break;
        case 'pause':
        case 'resume':
          viewDirty = true;
          break;
        case 'spawn':
        case 'lock':
          break;
      }
    }
    this.view.onEvents(this.events, match.state);
    this.events.length = 0;
    if (viewDirty) this.view.sync(match.state);
  }

  /** A correct letter: snap the cannon, kick it back, fire the beam, spark the letter. */
  private fire(hit: Extract<GameEvent, { type: 'hit' }>): void {
    const { layout, charWidth } = this.renderer;
    const tx = letterCenterX(layout, hit.x, hit.length, hit.index, charWidth);
    const ty = toScreenY(layout, hit.y);
    this.cannon.snapTo(aimAngle(layout.cannonX, layout.cannonY, tx, ty));
    this.cannon.kick();
    this.aimHold = LASER_LIFETIME;
    const muzzle = muzzlePosition(layout, this.cannon.angle);
    // Sideways offset (twin barrels): perpendicular to the barrel direction.
    const side = muzzleSideOffset(this.cosmetics.cannon, this.shots++);
    const mx = muzzle.x + Math.cos(this.cannon.angle) * side;
    const my = muzzle.y + Math.sin(this.cannon.angle) * side;
    this.lasers.fire(mx, my, tx, ty, LASER_LIFETIME);
    this.effects.impact(tx, ty, this.cannon.angle);
    this.sound.play('shot', 1 + Math.min(hit.index, SHOT_PITCH_MAX_STEPS) * SHOT_PITCH_STEP);
  }

  private render(alpha: number): void {
    const state = this.match?.state ?? null;
    const status = state?.status ?? 'playing';
    // Frozen things must not interpolate (they would jitter between two positions):
    // words freeze when the match is not running; everything freezes while paused.
    const wordAlpha = status === 'playing' ? alpha : 1;
    const fxAlpha = status === 'paused' ? 1 : alpha;
    this.renderer.draw({
      state,
      alpha: wordAlpha,
      fxAlpha,
      cannonAngle: this.cannon.interpolated(fxAlpha),
      recoil: this.cannon.interpolatedRecoil(fxAlpha),
      lasers: this.lasers,
      effects: this.effects,
      background: this.background,
      missFlash: this.missFlash > 0,
      time: this.animTime,
    });
  }

  /** Leaving the tab pauses the match; coming back does not count the time away. */
  private readonly onVisibilityChange = (): void => {
    this.lastTime = null;
    const state = this.match?.state;
    if (document.hidden && state?.status === 'playing') {
      togglePause(state, this.events);
      this.flushEvents();
    }
  };
}

/** Bomb blast radius on screen, matching the logical blast ellipse (its larger axis). */
function bombRadiusPx(layout: Layout): number {
  const { bombRadiusX, bombRadiusY } = CONFIG.specials;
  return Math.max(bombRadiusX * layout.fieldWidth, bombRadiusY * (layout.perimeterY - layout.fieldTop));
}
