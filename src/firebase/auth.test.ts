import { describe, expect, it } from 'vitest';
import { readFirebaseConfig } from './app.ts';
import { AuthService, errorCode, type AuthBackend, type AuthUser } from './auth.ts';
import type { AccountState } from './types.ts';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const fail = (code: string) => Object.assign(new Error(code), { code });

/** Firebase Auth stand-in: records calls, lets each test script the outcome. */
class FakeAuth implements AuthBackend {
  private listener: ((user: AuthUser | null) => void) | null = null;
  current: AuthUser | null = null;
  anonymousCalls = 0;
  linkCalls = 0;
  refreshes = 0;
  anonymousError: Error | null = null;
  linkResult: () => Promise<AuthUser> = async () => ({ uid: this.current?.uid ?? '?', google: true });
  credentialUser: AuthUser | null = { uid: 'google-uid', google: true };

  emit(user: AuthUser | null): void {
    this.current = user;
    this.listener?.(user);
  }

  onUserChanged(listener: (user: AuthUser | null) => void): void {
    this.listener = listener;
    listener(this.current);
  }

  async signInAnonymously(): Promise<void> {
    this.anonymousCalls++;
    if (this.anonymousError) throw this.anonymousError;
    this.emit({ uid: 'anon-uid', google: false });
  }

  linkWithGoogle(): Promise<AuthUser> {
    this.linkCalls++;
    return this.linkResult();
  }

  async signInWithLinkError(): Promise<AuthUser | null> {
    if (this.credentialUser) this.emit(this.credentialUser);
    return this.credentialUser;
  }

  async refreshToken(): Promise<void> {
    this.refreshes++;
  }
}

async function started(backend = new FakeAuth()) {
  const service = new AuthService(async () => backend);
  const states: AccountState[] = [];
  service.subscribe((state) => states.push(state));
  await service.start();
  await flush();
  return { service, backend, states };
}

describe('readFirebaseConfig', () => {
  const env = {
    VITE_FIREBASE_API_KEY: 'key',
    VITE_FIREBASE_AUTH_DOMAIN: 'x.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'x',
    VITE_FIREBASE_STORAGE_BUCKET: 'x.appspot.com',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '1',
    VITE_FIREBASE_APP_ID: 'app',
  };

  it('reads all six variables', () => {
    expect(readFirebaseConfig(env)).toEqual({
      apiKey: 'key',
      authDomain: 'x.firebaseapp.com',
      projectId: 'x',
      storageBucket: 'x.appspot.com',
      messagingSenderId: '1',
      appId: 'app',
    });
  });

  it('is null when any variable is missing or blank (offline build)', () => {
    expect(readFirebaseConfig({})).toBeNull();
    expect(readFirebaseConfig({ ...env, VITE_FIREBASE_APP_ID: '' })).toBeNull();
    expect(readFirebaseConfig({ ...env, VITE_FIREBASE_API_KEY: '  ' })).toBeNull();
    const { VITE_FIREBASE_PROJECT_ID: _, ...missing } = env;
    expect(readFirebaseConfig(missing)).toBeNull();
  });
});

describe('errorCode', () => {
  it('reads Firebase error codes', () => {
    expect(errorCode(fail('auth/popup-blocked'))).toBe('auth/popup-blocked');
    expect(errorCode(new Error('x'))).toBe('');
    expect(errorCode(null)).toBe('');
  });
});

describe('AuthService', () => {
  it('is unavailable without a Firebase config, and never throws', async () => {
    const service = new AuthService(null);
    await service.start();
    expect(service.account).toEqual({ status: 'unavailable', uid: null });
    expect(await service.linkGoogle()).toEqual({ kind: 'unavailable' });
  });

  it('signs in anonymously by itself', async () => {
    const { service, backend } = await started();
    expect(backend.anonymousCalls).toBe(1);
    expect(service.account).toEqual({ status: 'anonymous', uid: 'anon-uid' });
  });

  it('keeps an existing session (Google already linked)', async () => {
    const backend = new FakeAuth();
    backend.current = { uid: 'g1', google: true };
    const { service } = await started(backend);
    expect(backend.anonymousCalls).toBe(0);
    expect(service.account).toEqual({ status: 'google', uid: 'g1' });
  });

  it('reports an error when sign-in fails and can retry', async () => {
    const backend = new FakeAuth();
    backend.anonymousError = new Error('offline');
    const { service } = await started(backend);
    expect(service.account.status).toBe('error');
    backend.anonymousError = null;
    service.retry();
    await flush();
    expect(service.account).toEqual({ status: 'anonymous', uid: 'anon-uid' });
  });

  it('reports an error when the SDK cannot be downloaded', async () => {
    const service = new AuthService(() => Promise.reject(new Error('offline')));
    await service.start();
    expect(service.account.status).toBe('error');
  });

  it('links Google: popup opened synchronously, then a fresh token', async () => {
    const { service, backend } = await started();
    const pending = service.linkGoogle();
    expect(backend.linkCalls).toBe(1); // called before any await (inside the click)
    expect(await pending).toEqual({ kind: 'linked', user: { uid: 'anon-uid', google: true } });
    expect(backend.refreshes).toBe(1);
    expect(service.account).toEqual({ status: 'google', uid: 'anon-uid' });
  });

  it('credential already in use: signs into the existing Google account', async () => {
    const { service, backend } = await started();
    backend.linkResult = () => Promise.reject(fail('auth/credential-already-in-use'));
    expect(await service.linkGoogle()).toEqual({ kind: 'switched', user: { uid: 'google-uid', google: true } });
    expect(service.account).toEqual({ status: 'google', uid: 'google-uid' });
  });

  it('credential already in use without a credential is an error', async () => {
    const { service, backend } = await started();
    backend.linkResult = () => Promise.reject(fail('auth/credential-already-in-use'));
    backend.credentialUser = null;
    expect(await service.linkGoogle()).toEqual({ kind: 'error', code: 'auth/credential-already-in-use' });
    expect(service.account.status).toBe('anonymous');
  });

  it('closing the popup is a silent cancel; a blocked popup is reported', async () => {
    const { service, backend } = await started();
    backend.linkResult = () => Promise.reject(fail('auth/popup-closed-by-user'));
    expect(await service.linkGoogle()).toEqual({ kind: 'cancelled' });
    backend.linkResult = () => Promise.reject(fail('auth/popup-blocked'));
    expect(await service.linkGoogle()).toEqual({ kind: 'blocked' });
    backend.linkResult = () => Promise.reject(fail('auth/network-request-failed'));
    expect(await service.linkGoogle()).toEqual({ kind: 'error', code: 'auth/network-request-failed' });
    expect(service.account.status).toBe('anonymous');
  });

  it('does not link twice', async () => {
    const backend = new FakeAuth();
    backend.current = { uid: 'g1', google: true };
    const { service } = await started(backend);
    expect(await service.linkGoogle()).toEqual({ kind: 'unavailable' });
    expect(backend.linkCalls).toBe(0);
  });
});
