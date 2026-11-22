// Firebase init. The config comes from VITE_FIREBASE_* (.env.local / GitHub secrets).
// Without it the SDK is never downloaded and the game runs offline, without errors.
// The SDK is loaded on demand (dynamic import), so it never weighs on the game's first load.
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

/** This build's config (null = offline build). */
export function firebaseConfig(): FirebaseWebConfig | null {
  return readFirebaseConfig(import.meta.env);
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

/** Loads and initializes Firebase once (Firestore *lite*: plain reads/writes, no realtime). */
export function loadFirebase(config: FirebaseWebConfig): Promise<FirebaseSdk> {
  loading ??= (async () => {
    const [appApi, authApi, dbApi] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore/lite'),
    ]);
    const app = appApi.initializeApp(config);
    return { auth: authApi.getAuth(app), db: dbApi.getFirestore(app), appApi, authApi, dbApi };
  })().catch((error: unknown) => {
    // A failed download (offline) can be retried later.
    loading = null;
    throw error;
  });
  return loading;
}
