// Anonymous auth and Google linking.
// - Everyone signs in anonymously and automatically (when the build has a Firebase config).
// - "Entrar com Google" links the anonymous account with linkWithPopup, called straight from
//   the click handler (no redirect: browsers only allow popups inside the user gesture),
//   then forces a fresh ID token so the rules see the google.com identity.
// - auth/credential-already-in-use: that Google account already exists → sign into it with
//   GoogleAuthProvider.credentialFromError, keep its progress and tell the player the
//   anonymous progress was discarded.
import type { User } from 'firebase/auth';
import type { FirebaseSdk } from './app.ts';
import type { AccountState } from './types.ts';

export interface AuthUser {
  readonly uid: string;
  /** Linked to Google (may enter the ranking). */
  readonly google: boolean;
}

/** What AuthService needs from Firebase Auth (lets tests use a fake). */
export interface AuthBackend {
  onUserChanged(listener: (user: AuthUser | null) => void): void;
  signInAnonymously(): Promise<void>;
  /** Opens the Google popup right away: call it synchronously inside the click handler. */
  linkWithGoogle(): Promise<AuthUser>;
  /** After auth/credential-already-in-use: signs into that Google account (null without a credential). */
  signInWithLinkError(error: unknown): Promise<AuthUser | null>;
  /** Forces a fresh ID token (the rules read the Google identity from it). */
  refreshToken(): Promise<void>;
}

export type LinkOutcome =
  /** The anonymous account is now linked to Google (same uid). */
  | { readonly kind: 'linked'; readonly user: AuthUser }
  /** The Google account already existed: now signed into it; the anonymous progress was discarded. */
  | { readonly kind: 'switched'; readonly user: AuthUser }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'blocked' }
  /** Not signed in anonymously yet (offline build, still connecting, error) or already linked. */
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'error'; readonly code: string };

/** `error.code` of a Firebase error ('' for anything else). */
export function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return '';
}

const CANCELLED = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

function toAuthUser(user: User): AuthUser {
  return { uid: user.uid, google: user.providerData.some((info) => info.providerId === 'google.com') };
}

export function firebaseAuthBackend(sdk: FirebaseSdk): AuthBackend {
  const { auth, authApi, appApi } = sdk;
  return {
    onUserChanged: (listener) => {
      authApi.onAuthStateChanged(auth, (user) => listener(user ? toAuthUser(user) : null));
    },
    signInAnonymously: async () => {
      await authApi.signInAnonymously(auth);
    },
    linkWithGoogle: () => {
      const user = auth.currentUser;
      if (!user) return Promise.reject(Object.assign(new Error('Not signed in'), { code: 'app/no-user' }));
      // No await before this call: the popup must open inside the click.
      return authApi.linkWithPopup(user, new authApi.GoogleAuthProvider()).then((result) => toAuthUser(result.user));
    },
    signInWithLinkError: async (error) => {
      if (!(error instanceof appApi.FirebaseError)) return null;
      const credential = authApi.GoogleAuthProvider.credentialFromError(error);
      if (!credential) return null;
      const result = await authApi.signInWithCredential(auth, credential);
      return toAuthUser(result.user);
    },
    refreshToken: async () => {
      await auth.currentUser?.getIdToken(true);
    },
  };
}

export type AccountListener = (state: AccountState) => void;

export class AuthService {
  private readonly load: (() => Promise<AuthBackend>) | null;
  private readonly listeners = new Set<AccountListener>();
  private backend: AuthBackend | null = null;
  private state: AccountState;
  private started = false;
  private signingIn = false;

  /** `load` = null for an offline build (no Firebase config). */
  constructor(load: (() => Promise<AuthBackend>) | null) {
    this.load = load;
    this.state = { status: load ? 'connecting' : 'unavailable', uid: null };
  }

  get account(): AccountState {
    return this.state;
  }

  /** Loads Firebase and signs in anonymously when nobody is signed in. Never throws. */
  async start(): Promise<void> {
    if (!this.load || this.started) return;
    this.started = true;
    this.set({ status: 'connecting', uid: null });
    try {
      this.backend = await this.load();
    } catch {
      this.started = false; // the SDK download failed: retry later
      this.set({ status: 'error', uid: null });
      return;
    }
    this.backend.onUserChanged((user) => {
      if (user) this.set({ status: user.google ? 'google' : 'anonymous', uid: user.uid });
      else this.signInAnonymously();
    });
  }

  /** Tries again after an error (e.g. the network came back). */
  retry(): void {
    if (this.state.status !== 'error') return;
    if (!this.backend) void this.start();
    else this.signInAnonymously();
  }

  /**
   * Links the anonymous account to Google. Call it directly from the click handler: the
   * popup opens synchronously, before any await.
   */
  linkGoogle(): Promise<LinkOutcome> {
    const backend = this.backend;
    if (!backend || this.state.status !== 'anonymous') return Promise.resolve({ kind: 'unavailable' });
    return backend.linkWithGoogle().then(
      async (user): Promise<LinkOutcome> => {
        await backend.refreshToken().catch(() => undefined);
        this.set({ status: 'google', uid: user.uid });
        return { kind: 'linked', user };
      },
      (error: unknown) => this.onLinkError(backend, error),
    );
  }

  subscribe(listener: AccountListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async onLinkError(backend: AuthBackend, error: unknown): Promise<LinkOutcome> {
    const code = errorCode(error);
    if (CANCELLED.has(code)) return { kind: 'cancelled' };
    if (code === 'auth/popup-blocked') return { kind: 'blocked' };
    if (code !== 'auth/credential-already-in-use') return { kind: 'error', code };
    try {
      const user = await backend.signInWithLinkError(error);
      if (!user) return { kind: 'error', code };
      await backend.refreshToken().catch(() => undefined);
      this.set({ status: user.google ? 'google' : 'anonymous', uid: user.uid });
      return { kind: 'switched', user };
    } catch (signInError) {
      return { kind: 'error', code: errorCode(signInError) };
    }
  }

  private signInAnonymously(): void {
    const backend = this.backend;
    if (!backend || this.signingIn) return;
    this.signingIn = true;
    this.set({ status: 'connecting', uid: null });
    backend
      .signInAnonymously()
      .catch(() => this.set({ status: 'error', uid: null }))
      .finally(() => {
        this.signingIn = false;
      });
  }

  private set(next: AccountState): void {
    if (next.status === this.state.status && next.uid === this.state.uid) return;
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }
}
