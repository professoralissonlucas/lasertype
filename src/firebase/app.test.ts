import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAppCheckKey, type FirebaseWebConfig } from './app.ts';

// The SDK modules, replaced by stand-ins that record the order of the calls.
const sdk = vi.hoisted(() => ({ calls: [] as string[], appCheckOptions: [] as unknown[] }));

vi.mock('firebase/app', () => ({
  initializeApp: (config: unknown) => {
    sdk.calls.push('initializeApp');
    return { name: '[DEFAULT]', options: config };
  },
}));
vi.mock('firebase/auth', () => ({
  getAuth: () => {
    sdk.calls.push('getAuth');
    return {};
  },
}));
vi.mock('firebase/firestore/lite', () => ({
  getFirestore: () => {
    sdk.calls.push('getFirestore');
    return {};
  },
}));
vi.mock('firebase/app-check', () => {
  sdk.calls.push('import app-check');
  return {
    ReCaptchaV3Provider: class {
      readonly siteKey: string;
      constructor(siteKey: string) {
        this.siteKey = siteKey;
      }
    },
    initializeAppCheck: (_app: unknown, options: unknown) => {
      sdk.calls.push('initializeAppCheck');
      sdk.appCheckOptions.push(options);
      return {};
    },
  };
});

const CONFIG: FirebaseWebConfig = {
  apiKey: 'k',
  authDomain: 'd',
  projectId: 'p',
  storageBucket: 'b',
  messagingSenderId: 'm',
  appId: 'a',
};

/** A fresh copy of app.ts (loadFirebase keeps its promise per module instance). */
async function freshLoader(): Promise<typeof import('./app.ts')> {
  vi.resetModules();
  return import('./app.ts');
}

describe('readAppCheckKey', () => {
  it('reads and trims VITE_RECAPTCHA_SITE_KEY; missing or blank = no App Check', () => {
    expect(readAppCheckKey({ VITE_RECAPTCHA_SITE_KEY: '  6Lc-key  ' })).toBe('6Lc-key');
    expect(readAppCheckKey({})).toBeNull();
    expect(readAppCheckKey({ VITE_RECAPTCHA_SITE_KEY: '   ' })).toBeNull();
    expect(readAppCheckKey({ VITE_RECAPTCHA_SITE_KEY: 42 })).toBeNull();
  });
});

describe('loadFirebase', () => {
  beforeEach(() => {
    sdk.calls.length = 0;
    sdk.appCheckOptions.length = 0;
    // The SDK reads the debug flag from `self` (the window in a browser).
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('FIREBASE_APPCHECK_DEBUG_TOKEN', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('without a site key App Check is not even downloaded', async () => {
    const { loadFirebase } = await freshLoader();
    await loadFirebase(CONFIG, null);
    expect(sdk.calls).toEqual(['initializeApp', 'getAuth', 'getFirestore']);
    expect(globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
  });

  it('with a site key, starts App Check (reCAPTCHA v3, auto refresh) before Auth and Firestore', async () => {
    const { loadFirebase } = await freshLoader();
    await loadFirebase(CONFIG, '6Lc-key');
    expect(sdk.calls).toEqual(['import app-check', 'initializeApp', 'initializeAppCheck', 'getAuth', 'getFirestore']);
    expect(sdk.appCheckOptions).toEqual([{ provider: { siteKey: '6Lc-key' }, isTokenAutoRefreshEnabled: true }]);
  });

  it('turns on the debug token in development (import.meta.env.DEV)', async () => {
    expect(import.meta.env.DEV).toBe(true);
    const { loadFirebase } = await freshLoader();
    await loadFirebase(CONFIG, '6Lc-key');
    expect(globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN).toBe(true);
  });

  it('initializes once, however many services ask for it', async () => {
    const { loadFirebase } = await freshLoader();
    const [a, b] = await Promise.all([loadFirebase(CONFIG, '6Lc-key'), loadFirebase(CONFIG, '6Lc-key')]);
    expect(a).toBe(b);
    expect(sdk.calls.filter((call) => call === 'initializeApp')).toHaveLength(1);
    expect(sdk.calls.filter((call) => call === 'initializeAppCheck')).toHaveLength(1);
  });
});
