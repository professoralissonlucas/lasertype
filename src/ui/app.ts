// Screen switching: menu ↔ settings ↔ match (HUD, pause, Mission Report).
// Owns the persisted settings and applies them (volume, effects, language).
import type { AudioEngine } from '../audio/AudioEngine.ts';
import { Game, type GameView, type MatchConfig } from '../game/Game.ts';
import { buildReport } from '../game/report.ts';
import type { MatchState } from '../game/state.ts';
import { MODES } from '../modes/index.ts';
import { saveSettings, type Settings } from '../settings/settings.ts';
import { createIntegerFormatter } from '../utils/format.ts';
import type { KeyValueStore } from '../utils/storage.ts';
import { el } from './dom.ts';
import { Hud } from './hud.ts';
import { createTranslator } from './i18n.ts';
import { MenuScreen, type MenuChoice } from './menu.ts';
import { PauseScreen } from './pause.ts';
import { ReportScreen } from './report.ts';
import { SettingsScreen } from './settings.ts';

export interface AppOptions {
  readonly root: HTMLElement;
  readonly store: KeyValueStore | null;
  readonly audio: AudioEngine;
  readonly settings: Settings;
  /** Fixed match seed for testing (`?seed=`), null for a new one every match. */
  readonly seed: string | null;
}

type Screen = 'menu' | 'settings' | 'match';

interface Screens {
  readonly hud: Hud;
  readonly pause: PauseScreen;
  readonly report: ReportScreen;
  readonly menu: MenuScreen;
  readonly settings: SettingsScreen;
}

export class App {
  private readonly store: KeyValueStore | null;
  private readonly audio: AudioEngine;
  private readonly seed: string | null;
  private readonly canvas: HTMLCanvasElement;
  private readonly layer: HTMLElement;
  private readonly gameInstance: Game;
  private settings: Settings;
  private screens: Screens;
  private screen: Screen = 'menu';
  private reportShown = false;

  constructor(options: AppOptions) {
    this.store = options.store;
    this.audio = options.audio;
    this.seed = options.seed;
    this.settings = options.settings;

    this.canvas = el('canvas', 'game-canvas');
    this.canvas.setAttribute('role', 'img');
    this.layer = el('div', 'ui');
    options.root.replaceChildren(this.canvas, this.layer);

    this.gameInstance = new Game(this.canvas, this.view, this.audio);
    this.screens = this.buildScreens();
    this.applySettings();
  }

  /** The running game (dev console / end-to-end checks). */
  get game(): Game {
    return this.gameInstance;
  }

  start(): void {
    this.gameInstance.start();
    this.show('menu');
  }

  // ---------- Game → UI ----------

  private readonly view: GameView = {
    onMatchStart: () => {
      this.screens.hud.reset();
      this.screens.report.hide();
      this.screens.pause.setVisible(false);
      this.reportShown = false;
    },
    sync: (state) => this.syncMatch(state),
    onEvents: (events) => this.screens.hud.onEvents(events),
    onExitRequest: () => this.toMenu(),
  };

  private syncMatch(state: Readonly<MatchState>): void {
    const { hud, pause, report } = this.screens;
    hud.update(state);
    pause.setVisible(state.status === 'paused');
    if (state.status === 'gameover') {
      if (!this.reportShown) {
        report.show(buildReport(state));
        this.reportShown = true;
      }
    } else if (this.reportShown) {
      report.hide();
      this.reportShown = false;
    }
  }

  // ---------- Navigation ----------

  private show(screen: Screen): void {
    this.screen = screen;
    const { hud, pause, report, menu, settings } = this.screens;
    menu.setVisible(screen === 'menu');
    settings.setVisible(screen === 'settings');
    hud.setVisible(screen === 'match');
    if (screen !== 'match') {
      pause.setVisible(false);
      report.hide();
      this.reportShown = false;
    }
    if (screen === 'menu') menu.focus();
    if (screen === 'settings') settings.focus();
  }

  private startMatch(): void {
    // Keyboard goes to the game now: drop focus from the menu buttons.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.show('match');
    const s = this.settings;
    const config: MatchConfig = {
      lang: s.language,
      mode: MODES[s.mode],
      difficulty: s.difficulty,
      seed: this.seed,
      requireAccents: s.requireAccents,
      reduceEffects: s.reduceEffects,
    };
    this.gameInstance.startMatch(config);
  }

  private toMenu(): void {
    this.gameInstance.stopMatch();
    this.show('menu');
  }

  // ---------- Settings ----------

  private updateSettings(next: Settings): void {
    const languageChanged = next.language !== this.settings.language;
    this.settings = next;
    saveSettings(this.store, next);
    this.applySettings();
    if (languageChanged) this.rebuildScreens();
  }

  private applySettings(): void {
    const s = this.settings;
    this.audio.setVolume(s.sfxVolume);
    this.gameInstance.setIdleReducedEffects(s.reduceEffects);
    document.documentElement.lang = s.language;
  }

  // ---------- Building the screens ----------

  private menuChoice(): MenuChoice {
    const { mode, difficulty, language } = this.settings;
    return { mode, difficulty, language };
  }

  private buildScreens(): Screens {
    const t = createTranslator(this.settings.language);
    const formatScore = createIntegerFormatter(this.settings.language);
    this.canvas.setAttribute('aria-label', t('canvasLabel'));

    const screens: Screens = {
      hud: new Hud(t, formatScore),
      pause: new PauseScreen(t, {
        onResume: () => this.gameInstance.togglePause(),
        onRestart: () => this.gameInstance.restart(),
        onQuit: () => this.gameInstance.quit(),
      }),
      report: new ReportScreen(t, formatScore, {
        onPlayAgain: () => this.gameInstance.restart(),
        onMenu: () => this.toMenu(),
      }),
      menu: new MenuScreen(t, this.menuChoice(), {
        onPlay: (choice) => {
          this.updateSettings({ ...this.settings, ...choice });
          this.startMatch();
        },
        onChange: (choice) => this.updateSettings({ ...this.settings, ...choice }),
        onSettings: () => this.show('settings'),
      }),
      settings: new SettingsScreen(t, this.settings, {
        onChange: (next) => this.updateSettings(next),
        onVolumePreview: () => this.audio.play('shot'),
        onBack: () => this.show('menu'),
      }),
    };
    this.layer.replaceChildren(
      screens.hud.root,
      screens.pause.root,
      screens.report.root,
      screens.menu.root,
      screens.settings.root,
    );
    return screens;
  }

  /** Language changed: rebuild every screen in the new language and stay where we were. */
  private rebuildScreens(): void {
    // Detach the old screens' keyboard listeners (menu Enter, settings Esc).
    this.screens.menu.setVisible(false);
    this.screens.settings.setVisible(false);
    this.screens = this.buildScreens();
    this.show(this.screen);
    if (this.screen === 'menu') this.screens.menu.focusGroup('language');
  }
}
