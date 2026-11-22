// Bootstrap: load settings, start audio, the online services and the app (screen
// switching lives in ui/app.ts).
import './styles/main.css';
import { AudioEngine } from './audio/AudioEngine.ts';
import { FirestoreInventoryRepository } from './economy/firestoreRepository.ts';
import { localInventoryRepository } from './economy/repository.ts';
import { firebaseConfig, loadFirebase } from './firebase/app.ts';
import { AuthService, firebaseAuthBackend } from './firebase/auth.ts';
import { firestoreLeaderboardBackend, Leaderboard } from './firebase/leaderboard.ts';
import { firestoreUserBackend } from './firebase/profile.ts';
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

// Online services. Without VITE_FIREBASE_* the SDK is never loaded: offline game, no errors,
// coins and cosmetics in localStorage. With it, they live in users/{uid} (localStorage = cache).
const firebase = firebaseConfig();
const sdk = firebase ? () => loadFirebase(firebase) : null;
const auth = new AuthService(sdk && (() => sdk().then(firebaseAuthBackend)));
const leaderboard = new Leaderboard(sdk && (() => sdk().then(firestoreLeaderboardBackend)));
const cloud = sdk && new FirestoreInventoryRepository({ store, backend: () => sdk().then(firestoreUserBackend) });
const inventory = cloud ?? localInventoryRepository(store);

const app = new App({ root, store, audio, settings, seed, auth, leaderboard, inventory, cloud });
app.start();

// Dev-only hook for the console and end-to-end checks (stripped from production builds).
if (import.meta.env.DEV) Object.assign(window, { __lasertype: app });
