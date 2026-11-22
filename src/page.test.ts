// index.html: share/metadata tags and the boot guard (fallback notice), checked against
// the files and constants they depend on.
import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';
import bootCss from '../public/boot.css?raw';
import ogImage from '../public/og-image.jpg?inline';
import { PALETTE } from './game/render/palette.ts';
import main from './main.ts?raw';
import { SETTINGS_KEY } from './settings/settings.ts';

const PUBLIC_FILES = Object.keys(import.meta.glob('../public/*')).map((path) => path.replace('../public', ''));

function meta(attribute: 'name' | 'property', key: string): string | undefined {
  return new RegExp(`<meta\\s+${attribute}="${key}"\\s+content="([^"]*)"`).exec(html)?.[1];
}

/** Width and height from a JPEG's start-of-frame segment. */
function jpegSize(dataUrl: string): { width: number; height: number } {
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1] ?? ''), (char) => char.charCodeAt(0));
  let i = 2;
  while (i + 9 < bytes.length) {
    const marker = bytes[i + 1] ?? 0;
    const length = ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: ((bytes[i + 5] ?? 0) << 8) | (bytes[i + 6] ?? 0), width: ((bytes[i + 7] ?? 0) << 8) | (bytes[i + 8] ?? 0) };
    }
    i += 2 + length;
  }
  throw new Error('no JPEG frame header');
}

describe('index.html metadata', () => {
  it('has the title, a description of a search-result size and the theme color', () => {
    expect(html).toContain('<html lang="pt-BR">');
    expect(/<title>([^<]*)<\/title>/.exec(html)?.[1]).toMatch(/^Laser Type/);
    const description = meta('name', 'description') ?? '';
    expect(description.length).toBeGreaterThanOrEqual(50);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(meta('name', 'theme-color')?.toLowerCase()).toBe(PALETTE.bg.toLowerCase());
  });

  it('links icons that exist in public/', () => {
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(PUBLIC_FILES).toEqual(expect.arrayContaining(['/favicon.svg', '/apple-touch-icon.png', '/og-image.jpg']));
  });

  it('has the Open Graph tags, with the real size of the preview image', () => {
    expect(meta('property', 'og:type')).toBe('website');
    expect(meta('property', 'og:title')).toMatch(/^Laser Type/);
    expect(meta('property', 'og:description')).toBeTruthy();
    expect(meta('property', 'og:image:alt')).toBeTruthy();
    // Made absolute at build time (vite.config.ts → scripts/site.ts).
    expect(meta('property', 'og:url')).toBe('%BASE_URL%');
    expect(meta('property', 'og:image')).toBe('/og-image.jpg');
    expect(meta('name', 'twitter:image')).toBe('/og-image.jpg');
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(meta('property', 'og:image:type')).toBe('image/jpeg');
    const size = jpegSize(ogImage);
    expect(meta('property', 'og:image:width')).toBe(String(size.width));
    expect(meta('property', 'og:image:height')).toBe(String(size.height));
    expect(size).toEqual({ width: 1200, height: 630 });
  });

  it('tells visitors without JavaScript to turn it on', () => {
    expect(html).toMatch(/<noscript>[\s\S]*Ative o JavaScript[\s\S]*<\/noscript>/);
  });
});

// ---------- Boot guard ----------

const GUARD = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

interface FakePage {
  readonly attributes: Map<string, string>;
  readonly title: { textContent: string };
  readonly text: { textContent: string };
  readonly reload: { textContent: string; hidden: boolean };
  /** Fires the error listener the guard registered (target = what failed). */
  error(target: unknown): void;
}

/** Runs the guard against a minimal fake DOM. */
function runGuard(options: { supported?: boolean; savedSettings?: string | null } = {}): FakePage {
  const supported = options.supported ?? true;
  const attributes = new Map<string, string>();
  const title = { textContent: '' };
  const text = { textContent: '' };
  const reload = { textContent: '', hidden: false, onclick: null };
  const listeners: ((event: { target: unknown }) => void)[] = [];
  const elements: Record<string, unknown> = { 'boot-title': title, 'boot-text': text, 'boot-reload': reload };
  const window: Record<string, unknown> = {
    DOMMatrix: function DOMMatrix() {},
    ResizeObserver: function ResizeObserver() {},
    localStorage: { getItem: (key: string) => (key === SETTINGS_KEY ? (options.savedSettings ?? null) : null) },
    location: { reload: () => {} },
    addEventListener: (_type: string, listener: (event: { target: unknown }) => void) => listeners.push(listener),
  };
  const document = {
    documentElement: {
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => attributes.set(name, value),
    },
    body: { replaceChildren: () => {} },
    createElement: (tag: string) => {
      if (tag === 'script') return { noModule: false };
      if (tag === 'form') return { requestSubmit: () => {} };
      return { getContext: () => (supported ? { roundRect: () => {} } : {}) };
    },
    getElementById: (id: string) => elements[id],
  };
  new Function('window', 'document', GUARD)(window, document);
  return {
    attributes,
    title,
    text,
    reload,
    error: (target) => {
      for (const listener of listeners) listener({ target: target === 'window' ? window : target });
    },
  };
}

describe('boot guard', () => {
  it('is plain ES5, so it runs in the old browsers it is there for', () => {
    expect(GUARD).toContain('data-boot');
    for (const modern of [/=>/, /\blet\s/, /\bconst\s/, /`/, /\.\.\./, /\bclass\s/, /,\s*\)/]) expect(GUARD).not.toMatch(modern);
  });

  it('styles the notice with old-browser CSS from a public file (the build leaves it untouched)', () => {
    expect(html).toContain('<link rel="stylesheet" href="/boot.css" />');
    expect(html).not.toContain('<style');
    expect(bootCss).toContain("html[data-boot='unsupported'] #boot-notice");
    expect(bootCss).toContain("html[data-boot='failed'] #boot-notice");
    expect(bootCss).toContain("html[data-boot='ready'] .boot");
    for (const modern of [/\binset\s*:/, /var\(/, /#[0-9a-f]{8}\b/i, /:has\(/]) expect(bootCss).not.toMatch(modern);
  });

  it('does nothing in a browser that has what the game needs', () => {
    const page = runGuard();
    expect(page.attributes.get('data-boot')).toBeUndefined();
  });

  it('shows "unsupported" (no reload button) when something is missing', () => {
    const page = runGuard({ supported: false });
    expect(page.attributes.get('data-boot')).toBe('unsupported');
    expect(page.title.textContent).toBe('Navegador sem suporte');
    expect(page.reload.hidden).toBe(true);
    // Final: a later error does not turn it into "failed".
    page.error('window');
    expect(page.attributes.get('data-boot')).toBe('unsupported');
  });

  it('shows "failed" with a reload button when the start throws or a script does not load', () => {
    const thrown = runGuard();
    thrown.error('window');
    expect(thrown.attributes.get('data-boot')).toBe('failed');
    expect(thrown.title.textContent).toBe('Não foi possível iniciar');
    expect(thrown.reload).toMatchObject({ hidden: false, textContent: 'Recarregar' });

    const missing = runGuard();
    missing.error({ tagName: 'SCRIPT' });
    expect(missing.attributes.get('data-boot')).toBe('failed');
  });

  it('ignores other resources and anything after the game started', () => {
    const image = runGuard();
    image.error({ tagName: 'IMG' });
    expect(image.attributes.get('data-boot')).toBeUndefined();

    const started = runGuard();
    started.attributes.set('data-boot', 'ready');
    started.error('window');
    expect(started.attributes.get('data-boot')).toBe('ready');
  });

  it('speaks the language saved in the settings (Portuguese by default)', () => {
    const english = runGuard({ supported: false, savedSettings: JSON.stringify({ language: 'en' }) });
    expect(english.title.textContent).toBe('Browser not supported');
    expect(english.attributes.get('lang')).toBe('en');
    const broken = runGuard({ supported: false, savedSettings: '{oops' });
    expect(broken.title.textContent).toBe('Navegador sem suporte');
  });

  it('agrees with main.ts on the boot states', () => {
    expect(main).toContain("html.dataset.boot !== 'unsupported'");
    expect(main).toContain("html.dataset.boot = 'ready'");
    expect(GUARD).toContain("state === 'ready' || state === 'unsupported'");
  });
});
