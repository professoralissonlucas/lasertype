// Regenerates the share images in public/ (og-image.jpg, apple-touch-icon.png) from the
// game's own renderer: serves scripts/share/ with Vite, opens it in a headless Chromium
// browser already installed (Edge or Chrome; CHROME_PATH overrides) and saves what the
// page posts back. Run it after changing the look of the game or the favicon:
//   npm run share:images
// No new dependencies: Vite is the dev server, the browser does the drawing.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { createServer, type Plugin } from 'vite';

const ROOT = resolve(import.meta.dirname, '..');
const FILES = ['og-image.jpg', 'apple-touch-icon.png'];
const TIMEOUT_MS = 60_000;
/** WhatsApp skips preview images much larger than this. */
const OG_MAX_BYTES = 300 * 1024;

function fail(message: string): never {
  console.error(`share-images: ${message}`);
  process.exit(1);
}

function findBrowser(): string {
  const env = process.env;
  const candidates = [
    env.CHROME_PATH,
    env['PROGRAMFILES(X86)'] && join(env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
    env.PROGRAMFILES && join(env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe'),
    env.PROGRAMFILES && join(env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
  const found = candidates.find((path): path is string => typeof path === 'string' && existsSync(path));
  return found ?? fail('Edge/Chrome não encontrado. Defina CHROME_PATH com o caminho do executável.');
}

const received = new Map<string, Buffer>();
let settle: (error?: Error) => void = () => {};
const finished = new Promise<void>((resolveDone, reject) => {
  settle = (error) => (error ? reject(error) : resolveDone());
});

/** Receives the images (POST /__share?file=...) or the page's error (POST /__share?error=...). */
const receiver: Plugin = {
  name: 'lasertype:share-receiver',
  configureServer(server) {
    server.middlewares.use('/__share', (req, res) => {
      const params = new URL(req.url ?? '', 'http://localhost').searchParams;
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        res.statusCode = 204;
        res.end();
        const error = params.get('error');
        if (error !== null) return settle(new Error(`a página falhou: ${error}`));
        const file = params.get('file') ?? '';
        if (!FILES.includes(file)) return settle(new Error(`arquivo inesperado: ${file}`));
        received.set(file, Buffer.concat(chunks));
        if (FILES.every((name) => received.has(name))) settle();
      });
    });
  },
};

const server = await createServer({
  root: ROOT,
  configFile: join(ROOT, 'vite.config.ts'),
  logLevel: 'warn',
  server: { open: false },
  plugins: [receiver],
});
await server.listen();
const base = server.resolvedUrls?.local[0] ?? fail('o servidor do Vite não informou a URL');
const url = new URL('scripts/share/index.html', base).href;

const profile = mkdtempSync(join(tmpdir(), 'lasertype-share-'));
const browser = spawn(
  findBrowser(),
  [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    '--window-size=1200,630',
    url,
  ],
  { stdio: 'ignore' },
);
const browserExited = new Promise<void>((done) => browser.once('exit', () => done()));
const timer = setTimeout(() => settle(new Error(`sem resposta da página em ${TIMEOUT_MS / 1000} s (${url})`)), TIMEOUT_MS);

let failure: unknown = null;
try {
  await finished;
} catch (error) {
  failure = error;
} finally {
  clearTimeout(timer);
  browser.kill();
  await browserExited;
  await server.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
if (failure) fail(failure instanceof Error ? failure.message : String(failure));

for (const [file, data] of received) {
  writeFileSync(join(ROOT, 'public', file), data);
  console.log(`public/${file}  ${(data.length / 1024).toFixed(1)} KB`);
}
const og = received.get('og-image.jpg');
if (og && og.length > OG_MAX_BYTES) console.warn(`share-images: og-image.jpg passou de ${OG_MAX_BYTES / 1024} KB (o WhatsApp pode não mostrar)`);
