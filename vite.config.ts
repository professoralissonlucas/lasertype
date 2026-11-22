import process from 'node:process';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { absoluteShareUrls, siteOrigin } from './scripts/site.ts';

/** Share tags with absolute URLs in the published build (scripts/site.ts). */
function shareUrls(origin: string | null): Plugin {
  return {
    name: 'lasertype:share-urls',
    apply: 'build',
    // 'post': after Vite has put the base in front of the public files' paths.
    transformIndexHtml: { order: 'post', handler: (html) => (origin ? absoluteShareUrls(html, origin) : html) },
  };
}

export default defineConfig({
  // GitHub Pages serves the project at https://<user>.github.io/lasertype/
  base: '/lasertype/',
  plugins: [shareUrls(siteOrigin(process.env))],
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
    // Vitest blanks CSS by default; palette.test.ts and page.test.ts read these via `?raw`.
    css: { include: [/tokens\.css/, /boot\.css/] },
  },
});
