// Safe key-value storage. localStorage can be missing or throw (private mode, blocked
// site data, quota): every access is guarded and failures fall back to defaults.

/** The part of the Web Storage API we use (lets tests pass an in-memory store). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** `window.localStorage`, or null when the browser refuses access. */
export function browserStore(): KeyValueStore | null {
  try {
    const store = window.localStorage;
    const probe = '__lasertype_probe__';
    store.setItem(probe, probe);
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

/** Parsed JSON at `key`, or undefined when missing, unreadable or not valid JSON. */
export function loadJson(store: KeyValueStore | null, key: string): unknown {
  if (!store) return undefined;
  try {
    const raw = store.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

/** Saves `value` as JSON; returns false when the store refused it. */
export function saveJson(store: KeyValueStore | null, key: string, value: unknown): boolean {
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** In-memory store (tests, or a fallback that lasts for the session). */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}
