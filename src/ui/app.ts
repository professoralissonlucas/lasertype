// Screen switching: menu ↔ settings ↔ shop ↔ ranking ↔ match (HUD, pause, Mission Report).
// Owns the persisted settings, the economy and the online account, and applies them
// (volume, effects, language, equipped cosmetics, nickname, ranking submissions).
import type { AudioEngine } from '../audio/AudioEngine.ts';
import { resolveCosmetics } from '../cosmetics/equip.ts';
import type { ResolvedCosmetics } from '../cosmetics/types.ts';
import { Economy } from '../economy/Economy.ts';
import type { FirestoreInventoryRepository } from '../economy/firestoreRepository.ts';
import { sameEquipped } from '../economy/inventory.ts';
import type { InventoryRepository } from '../economy/repository.ts';
import type { AuthService, LinkOutcome } from '../firebase/auth.ts';
import { isRankedMode, type Leaderboard, type MatchResult, type SubmitResult, type Submitter } from '../firebase/leaderboard.ts';
import type { Board } from '../firebase/types.ts';
import { Game, type GameView, type MatchConfig } from '../game/Game.ts';
import { buildReport, type MatchReport } from '../game/report.ts';
import type { MatchState } from '../game/state.ts';
import { MODES } from '../modes/index.ts';
import { defaultNickname } from '../profile/nickname.ts';
import { saveSettings, type Settings } from '../settings/settings.ts';
import { createIntegerFormatter } from '../utils/format.ts';
import type { KeyValueStore } from '../utils/storage.ts';
import type { Language } from '../words/types.ts';
import { AccountBadge, type AccountCallbacks } from './account.ts';
import { el } from './dom.ts';
import { Hud } from './hud.ts';
import { createTranslator, type Translate } from './i18n.ts';
import { MenuScreen, type MenuChoice } from './menu.ts';
import { NicknameDialog } from './nicknameDialog.ts';
import { PauseScreen } from './pause.ts';
import { RankingScreen } from './ranking.ts';
import { ReportScreen, type RankingLine } from './report.ts';
import { SettingsScreen } from './settings.ts';
import { ShopScreen } from './shop.ts';
import { Toasts } from './toast.ts';

export interface AppOptions {
  readonly root: HTMLElement;
  readonly store: KeyValueStore | null;
  readonly audio: AudioEngine;
  readonly settings: Settings;
  /** Fixed match seed for testing (`?seed=`), null for a new one every match. */
  readonly seed: string | null;
  readonly auth: AuthService;
  readonly leaderboard: Leaderboard;
  /** Where coins and cosmetics live (local, or Firestore with a local cache). */
  readonly inventory: InventoryRepository;
  /** users/{uid} sync (nickname, account switch); null in offline builds. */
  readonly cloud: FirestoreInventoryRepository | null;
  /** App Check runs on reCAPTCHA v3: the menu credits it (its badge stays hidden). */
  readonly recaptchaNotice: boolean;
}

type Screen = 'menu' | 'settings' | 'shop' | 'ranking' | 'match';

interface Screens {
  readonly hud: Hud;
  readonly pause: PauseScreen;
  readonly report: ReportScreen;
  readonly menu: MenuScreen;
  readonly settings: SettingsScreen;
  readonly shop: ShopScreen;
  readonly ranking: RankingScreen;
  readonly nickname: NicknameDialog;
  readonly badges: readonly AccountBadge[];
}

/** The last finished match, kept to send it again after signing in from the report. */
interface FinishedMatch {
  readonly serial: number;
  readonly match: MatchResult;
  outcome: SubmitResult | null;
}

export class App {
  private readonly store: KeyValueStore | null;
  private readonly audio: AudioEngine;
  private readonly seed: string | null;
  private readonly canvas: HTMLCanvasElement;
  private readonly layer: HTMLElement;
  private readonly gameInstance: Game;
  private readonly economyInstance: Economy;
  private readonly authService: AuthService;
  private readonly leaderboardService: Leaderboard;
  private readonly cloudSync: FirestoreInventoryRepository | null;
  private readonly recaptchaNotice: boolean;
  private readonly toasts = new Toasts();
  private settings: Settings;
  private t: Translate;
  private formatScore: (value: number) => string;
  private screens: Screens;
  private screen: Screen = 'menu';
  private reportShown = false;
  /** Increments every match: late answers from the ranking never touch a newer report. */
  private matchSerial = 0;
  private matchLang: Language;
  private finished: FinishedMatch | null = null;

  constructor(options: AppOptions) {
    this.store = options.store;
    this.audio = options.audio;
    this.seed = options.seed;
    this.settings = options.settings;
    this.authService = options.auth;
    this.leaderboardService = options.leaderboard;
    this.cloudSync = options.cloud;
    this.recaptchaNotice = options.recaptchaNotice;
    this.matchLang = options.settings.language;
    this.t = createTranslator(this.settings.language);
    this.formatScore = createIntegerFormatter(this.settings.language);

    this.canvas = el('canvas', 'game-canvas');
    this.canvas.setAttribute('role', 'img');
    this.layer = el('div', 'ui');
    options.root.replaceChildren(this.canvas, this.layer);

    this.gameInstance = new Game(this.canvas, this.view, this.audio);
    this.economyInstance = new Economy(options.inventory);
    this.gameInstance.setCosmetics(this.cosmetics());
    // Rebuilding the skin is not free (sprites, nebula): only when the equipment changed
    // (equipped here, or a cloud version / another account arrived).
    let equipped = this.economyInstance.inventory.equipped;
    this.economyInstance.subscribe((inventory) => {
      if (!sameEquipped(inventory.equipped, equipped)) {
        equipped = inventory.equipped;
        this.gameInstance.setCosmetics(this.cosmetics());
      }
      this.screens.menu.setCoins(inventory.coins);
    });
    this.screens = this.buildScreens();
    this.authService.subscribe(() => this.onAccountChange());
    // users/{uid} answered (nickname loaded or edited, account switched): refresh the badges.
    this.cloudSync?.subscribe(() => this.refreshAccount());
    this.applySettings();
  }

  /** The running game (dev console / end-to-end checks). */
  get game(): Game {
    return this.gameInstance;
  }

  /** Coins, inventory and shop (dev console / end-to-end checks). */
  get economy(): Economy {
    return this.economyInstance;
  }

  /** Account (dev console / end-to-end checks). */
  get auth(): AuthService {
    return this.authService;
  }

  /** Global ranking (dev console / end-to-end checks). */
  get leaderboard(): Leaderboard {
    return this.leaderboardService;
  }

  /** users/{uid} sync, null offline (dev console / end-to-end checks). */
  get cloud(): FirestoreInventoryRepository | null {
    return this.cloudSync;
  }

  /** What the player has equipped, resolved for the renderers. */
  private cosmetics(): ResolvedCosmetics {
    const economy = this.economyInstance;
    return resolveCosmetics(economy.inventory.equipped, (id) => economy.owns(id));
  }

  start(): void {
    this.gameInstance.start();
    this.show('menu');
    this.onAccountChange();
    // Anonymous sign-in happens in the background; the game never waits for it.
    void this.authService.start();
  }

  // ---------- Game → UI ----------

  private readonly view: GameView = {
    onMatchStart: () => {
      this.matchSerial++;
      this.finished = null;
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
        // Once per match: credit the coins, show them, then try the global ranking.
        const summary = buildReport(state);
        const reward = this.economyInstance.rewardMatch(summary);
        report.show(summary, reward, this.economyInstance.coins);
        this.reportShown = true;
        this.submitMatch(summary);
      }
    } else if (this.reportShown) {
      report.hide();
      this.reportShown = false;
    }
  }

  // ---------- Global ranking ----------

  private submitMatch(summary: MatchReport): void {
    this.finished = {
      serial: this.matchSerial,
      match: {
        mode: summary.mode,
        difficulty: summary.difficulty,
        lang: this.matchLang,
        score: summary.score,
        wpm: summary.wpm,
        accuracy: summary.accuracy,
        elapsed: summary.elapsed,
      },
      outcome: null,
    };
    this.send(this.finished);
  }

  private send(finished: FinishedMatch): void {
    const { report } = this.screens;
    if (!this.leaderboardService.available) {
      report.setRanking(null);
      return;
    }
    if (isRankedMode(finished.match.mode)) {
      report.setRanking({ text: this.t('reportRankSending'), tone: 'info', signIn: false });
    }
    void this.leaderboardService.submit(finished.match, this.submitter()).then((outcome) => {
      if (finished.serial !== this.matchSerial || !this.reportShown) return;
      finished.outcome = outcome;
      this.screens.report.setRanking(this.rankingLine(outcome));
    });
  }

  private submitter(): Submitter | null {
    const { status, uid } = this.authService.account;
    if (!uid) return null;
    return { uid, google: status === 'google', name: this.nickname(uid) };
  }

  private rankingLine(outcome: SubmitResult): RankingLine | null {
    const t = this.t;
    switch (outcome.kind) {
      case 'unavailable':
        return null;
      case 'notRanked':
        return { text: t('reportRankZen'), tone: 'info', signIn: false };
      case 'signIn':
        return {
          text: t('reportRankSignIn'),
          tone: 'info',
          signIn: this.authService.account.status === 'anonymous',
        };
      case 'invalid':
        return { text: t('reportRankInvalid'), tone: 'info', signIn: false };
      case 'notRecord':
        return { text: t('reportRankNotRecord', { n: this.formatScore(outcome.best) }), tone: 'info', signIn: false };
      case 'record':
        return { text: t('reportRankRecord'), tone: 'record', signIn: false };
      case 'error':
        return { text: t('reportRankError'), tone: 'error', signIn: false };
    }
  }

  // ---------- Account ----------

  /** Called straight from a click: AuthService opens the Google popup before any await. */
  private readonly signIn = (): void => {
    void this.authService.linkGoogle().then((outcome) => this.afterLink(outcome));
  };

  private async afterLink(outcome: LinkOutcome): Promise<void> {
    const t = this.t;
    switch (outcome.kind) {
      case 'linked':
        this.toasts.show(t('authLinked'));
        break;
      case 'switched':
        this.toasts.show(t('authSwitched'), 'warn');
        break;
      case 'blocked':
        this.toasts.show(t('authBlocked'), 'warn');
        return;
      case 'error':
        this.toasts.show(t('authError'), 'warn');
        return;
      case 'cancelled':
      case 'unavailable':
        return;
    }
    this.audio.play('equip');
    // First link of this account: pick the ranking nickname (an existing Google account has one).
    if (outcome.kind === 'linked') await this.askNickname(outcome.user.uid);
    // Signed in from the Mission Report: this match can enter the ranking now.
    const finished = this.finished;
    if (this.reportShown && finished?.outcome?.kind === 'signIn') this.send(finished);
  }

  /** First Google link: ask for a nickname (cancel keeps the current one, "Piloto" + 4 digits). */
  private askNickname(uid: string): Promise<void> {
    return new Promise((resolve) => {
      this.screens.nickname.open({
        initial: this.nickname(uid),
        first: true,
        onSave: (name) => {
          this.storeNickname(name);
          resolve();
        },
        onCancel: () => resolve(),
      });
    });
  }

  private readonly editNickname = (): void => {
    const { uid } = this.authService.account;
    if (!uid) return;
    this.screens.nickname.open({
      initial: this.nickname(uid),
      first: false,
      onSave: (name) => this.storeNickname(name),
      onCancel: () => undefined,
    });
  };

  /** The ranking name: users/{uid}.name, or the "Piloto" default until it was read. */
  private nickname(uid: string): string {
    return this.cloudSync?.name ?? defaultNickname(uid);
  }

  /** Profile write (users/{uid}.name), shown at once. */
  private storeNickname(name: string): void {
    this.cloudSync?.rename(name);
    this.refreshAccount();
  }

  private onAccountChange(): void {
    // The economy follows the signed-in account (its own users/{uid}).
    this.cloudSync?.setUser(this.authService.account.uid);
    this.refreshAccount();
  }

  private refreshAccount(): void {
    const account = this.authService.account;
    const nickname = account.status === 'google' && account.uid ? this.nickname(account.uid) : null;
    for (const badge of this.screens.badges) badge.update(account, nickname);
    this.screens.ranking.onAccountChange();
    // A report waiting on "Entrar com Google" shows the button only while it can work.
    const finished = this.finished;
    if (this.reportShown && finished?.outcome?.kind === 'signIn') {
      this.screens.report.setRanking(this.rankingLine(finished.outcome));
    }
  }

  // ---------- Navigation ----------

  private show(screen: Screen): void {
    this.screen = screen;
    const { hud, pause, report, menu, settings, shop, ranking } = this.screens;
    menu.setVisible(screen === 'menu');
    settings.setVisible(screen === 'settings');
    shop.setVisible(screen === 'shop');
    ranking.setVisible(screen === 'ranking');
    hud.setVisible(screen === 'match');
    if (screen !== 'match') {
      pause.setVisible(false);
      report.hide();
      this.reportShown = false;
    }
    if (screen === 'menu') menu.focus();
    if (screen === 'settings') settings.focus();
    if (screen === 'shop') shop.focus();
    if (screen === 'ranking') ranking.focus();
  }

  private startMatch(): void {
    // Keyboard goes to the game now: drop focus from the menu buttons.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.show('match');
    const s = this.settings;
    this.matchLang = s.language;
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
    this.screens.shop.setReducedEffects(s.reduceEffects);
    document.documentElement.lang = s.language;
  }

  // ---------- Building the screens ----------

  private menuChoice(): MenuChoice {
    const { mode, difficulty, language } = this.settings;
    return { mode, difficulty, language };
  }

  /** The ranking opens on the menu's choices (Zen has no ranking: Survival instead). */
  private initialBoard(): Board {
    const { mode, difficulty, language } = this.settings;
    return { mode: isRankedMode(mode) ? mode : 'survival', diff: difficulty, lang: language, day: 0 };
  }

  private buildScreens(): Screens {
    const t = createTranslator(this.settings.language);
    const formatScore = createIntegerFormatter(this.settings.language);
    this.t = t;
    this.formatScore = formatScore;
    this.canvas.setAttribute('aria-label', t('canvasLabel'));

    const accountCallbacks: AccountCallbacks = {
      onSignIn: this.signIn,
      onEditNickname: this.editNickname,
      onRetry: () => this.authService.retry(),
    };
    const menuAccount = new AccountBadge(t, accountCallbacks, 'menu__account');
    const rankingAccount = new AccountBadge(t, accountCallbacks);

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
        onSignIn: this.signIn,
      }),
      menu: new MenuScreen(t, formatScore, this.menuChoice(), this.economyInstance.coins, menuAccount.root, this.recaptchaNotice, {
        onPlay: (choice) => {
          this.updateSettings({ ...this.settings, ...choice });
          this.startMatch();
        },
        onChange: (choice) => this.updateSettings({ ...this.settings, ...choice }),
        onSettings: () => this.show('settings'),
        onShop: () => this.show('shop'),
        onRanking: () => this.show('ranking'),
      }),
      settings: new SettingsScreen(t, this.settings, {
        onChange: (next) => this.updateSettings(next),
        onVolumePreview: () => this.audio.play('shot'),
        onBack: () => this.show('menu'),
      }),
      shop: new ShopScreen({
        t,
        language: this.settings.language,
        formatNumber: formatScore,
        economy: this.economyInstance,
        sound: this.audio,
        reduceEffects: this.settings.reduceEffects,
        equipped: () => this.cosmetics(),
        onBack: () => this.show('menu'),
      }),
      ranking: new RankingScreen({
        t,
        formatNumber: formatScore,
        leaderboard: this.leaderboardService,
        account: () => this.authService.account,
        accountBadge: rankingAccount,
        initial: this.initialBoard(),
        onBack: () => this.show('menu'),
      }),
      nickname: new NicknameDialog(t),
      badges: [menuAccount, rankingAccount],
    };
    this.layer.replaceChildren(
      screens.hud.root,
      screens.pause.root,
      screens.report.root,
      screens.menu.root,
      screens.settings.root,
      screens.shop.root,
      screens.ranking.root,
      screens.nickname.root,
      this.toasts.root,
    );
    return screens;
  }

  /** Language changed: rebuild every screen in the new language and stay where we were. */
  private rebuildScreens(): void {
    // Detach the old screens' keyboard listeners (menu Enter, settings/shop/ranking Esc).
    this.screens.menu.setVisible(false);
    this.screens.settings.setVisible(false);
    this.screens.shop.setVisible(false);
    this.screens.ranking.setVisible(false);
    this.screens = this.buildScreens();
    this.refreshAccount();
    this.show(this.screen);
    if (this.screen === 'menu') this.screens.menu.focusGroup('language');
  }
}
