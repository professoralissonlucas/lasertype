// Absolute addresses for the share tags of index.html (og:url, og:image, twitter:image):
// link previews (WhatsApp, social networks) only follow absolute URLs. Used by vite.config.ts.

/**
 * Where the site is published: SITE_ORIGIN when set (another host), else GitHub Pages of the
 * repository owner (GITHUB_REPOSITORY_OWNER is set by GitHub Actions). null = unknown (local
 * build): the tags keep their root-relative paths.
 */
export function siteOrigin(env: Readonly<Record<string, string | undefined>>): string | null {
  const explicit = env.SITE_ORIGIN?.trim();
  if (explicit) return new URL(explicit).origin;
  const owner = env.GITHUB_REPOSITORY_OWNER?.trim();
  return owner ? `https://${owner.toLowerCase()}.github.io` : null;
}

const SHARE_TAG = /(<meta\s+(?:property="og:(?:url|image)"|name="twitter:image")\s+content=")([^"]*)(")/g;

/** Turns the share tags' URLs (already with the base, e.g. /lasertype/og-image.jpg) absolute. */
export function absoluteShareUrls(html: string, origin: string): string {
  return html.replace(SHARE_TAG, (_tag, open: string, url: string, close: string) => `${open}${new URL(url, origin).href}${close}`);
}
