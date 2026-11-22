// Firebase init. The config comes from VITE_FIREBASE_* (.env.local / GitHub secrets).
// Without it the SDK is never downloaded and the game runs offline, without errors.
// The SDK is loaded on demand (dynamic import), so it never weighs on the game's first load.
// App Check (reCAPTCHA v3) joins it when VITE_RECAPTCHA_SITE_KEY is set (CLAUDE.md §9).
import type { FirebaseOptions } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore/lite';

const ENV_KEYS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
} as const;

const RECAPTCHA_KEY = 'VITE_RECAPTCHA_SITE_KEY';

export type FirebaseWebConfig = Required<Pick<FirebaseOptions, keyof typeof ENV_KEYS>>;

/** The web config, or null when any variable is missing or blank. */
export function readFirebaseConfig(env: Readonly<Record<string, unknown>>): FirebaseWebConfig | null {
  const config: Partial<Record<keyof typeof ENV_KEYS, string>> = {};
  for (const [field, key] of Object.entries(ENV_KEYS) as [keyof typeof ENV_KEYS, string][]) {
    const value = env[key];
    if (typeof value !== 'string' || value.trim() === '') return null;
    config[field] = value.trim();
  }
  return config as FirebaseWebConfig;
}

/** The reCAPTCHA v3 site key for App Check, or null (missing or blank = no App Check). */
export function readAppCheckKey(env: Readonly<Record<string, unknown>>): string | null {
  const value = env[RECAPTCHA_KEY];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** This build's config (null = offline build). */
export function firebaseConfig(): FirebaseWebConfig | null {
  return readFirebaseConfig(import.meta.env);
}

/** This build's App Check site key (null = no App Check). */
export function appCheckKey(): string | null {
  return readAppCheckKey(import.meta.env);
}

/** The loaded SDK: instances plus the module functions (kept to call them synchronously). */
export interface FirebaseSdk {
  readonly auth: Auth;
  readonly db: Firestore;
  readonly appApi: typeof import('firebase/app');
  readonly authApi: typeof import('firebase/auth');
  readonly dbApi: typeof import('firebase/firestore/lite');
}

let loading: Promise<FirebaseSdk> | null = null;

/**
 * Loads and initializes Firebase once (Firestore *lite*: plain reads/writes, no realtime).
 * With `appCheckSiteKey`, App Check starts right after the app and before Auth/Firestore,
 * so not a single request goes out without its token.
 */
export function loadFirebase(config: FirebaseWebConfig, appCheckSiteKey: string | null = null): Promise<FirebaseSdk> {
  loading ??= (async () => {
    const [appApi, authApi, dbApi, checkApi] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore/lite'),
      appCheckSiteKey === null ? null : import('firebase/app-check'),
    ]);
    const app = appApi.initializeApp(config);
    if (checkApi && appCheckSiteKey !== null) {
      // Dev builds use a debug token instead of reCAPTCHA (it is printed in the browser
      // console; register it in the Firebase console, CLAUDE.md §9). Stripped from production.
      if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      checkApi.initializeAppCheck(app, {
        provider: new checkApi.ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
    return { auth: authApi.getAuth(app), db: dbApi.getFirestore(app), appApi, authApi, dbApi };
  })().catch((error: unknown) => {
    // A failed download (offline) can be retried later.
    loading = null;
    throw error;
  });
  return loading;
}
