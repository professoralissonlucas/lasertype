// Bootstrap. Phase 1 has a single screen (the match); menus arrive in Phase 4.
import './styles/main.css';
import { CONFIG } from './config.ts';
import { Game } from './game/Game.ts';
import { GameOverScreen } from './ui/gameOver.ts';
import { Hud } from './ui/hud.ts';
import { createTranslator } from './ui/i18n.ts';
import { isLanguage } from './words/index.ts';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app not found');

// Dev/testing switches until the settings screen exists: ?lang=en&seed=abc&accents=1
const params = new URLSearchParams(window.location.search);
const langParam = params.get('lang');
const lang = langParam !== null && isLanguage(langParam) ? langParam : CONFIG.defaultLanguage;
document.documentElement.lang = lang;

const t = createTranslator(lang);
const canvas = document.createElement('canvas');
canvas.className = 'game-canvas';
canvas.setAttribute('role', 'img');
canvas.setAttribute('aria-label', t('canvasLabel'));

const hud = new Hud(t);
const gameOver = new GameOverScreen(t);
app.replaceChildren(canvas, hud.root, gameOver.root);

const game = new Game(
  canvas,
  {
    sync(state) {
      hud.update(state.shield, state.maxShield, state.stats.destroyed);
      if (state.status === 'gameover') gameOver.show(state);
      else gameOver.hide();
    },
  },
  {
    lang,
    seed: params.get('seed'),
    requireAccents: params.get('accents') === '1',
  },
);
game.start();
