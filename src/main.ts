// Bootstrap: load settings, start audio and the app (screen switching lives in ui/app.ts).
import './styles/main.css';
import { AudioEngine } from './audio/AudioEngine.ts';
import { defaultSettings, loadSettings } from './settings/settings.ts';
import { App } from './ui/app.ts';
import { browserStore } from './utils/storage.ts';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app not found');

const store = browserStore();
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const settings = loadSettings(store, defaultSettings(prefersReducedMotion));

const audio = new AudioEngine(settings.sfxVolume);
audio.attach(window);

// `?seed=abc` fixes the word sequence (testing); everything else lives in Settings.
const seed = new URLSearchParams(window.location.search).get('seed');

const app = new App({ root, store, audio, settings, seed });
app.start();

// Dev-only hook for the console and end-to-end checks (stripped from production builds).
if (import.meta.env.DEV) Object.assign(window, { __lasertype: app });
