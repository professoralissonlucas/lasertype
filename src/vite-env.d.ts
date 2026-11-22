/// <reference types="vite/client" />

// Firebase web config (CLAUDE.md §10): `.env.local` in development, GitHub secrets in CI.
// Any of them missing = the game runs offline (no account, no ranking).
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** reCAPTCHA v3 site key for App Check; missing = no App Check (CLAUDE.md §9). */
  readonly VITE_RECAPTCHA_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Read by firebase/app-check when it starts: `true` = debug token (dev builds only, firebase/app.ts). */
declare var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined;
