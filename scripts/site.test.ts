import { describe, expect, it } from 'vitest';
import { absoluteShareUrls, siteOrigin } from './site.ts';

describe('siteOrigin', () => {
  it('is GitHub Pages of the repository owner in GitHub Actions (lower case)', () => {
    expect(siteOrigin({ GITHUB_REPOSITORY_OWNER: 'Some-Owner' })).toBe('https://some-owner.github.io');
  });

  it('SITE_ORIGIN wins (keeping only the origin)', () => {
    expect(siteOrigin({ SITE_ORIGIN: 'https://jogo.example.com/x/', GITHUB_REPOSITORY_OWNER: 'o' })).toBe(
      'https://jogo.example.com',
    );
  });

  it('is unknown in a local build', () => {
    expect(siteOrigin({})).toBeNull();
    expect(siteOrigin({ SITE_ORIGIN: ' ', GITHUB_REPOSITORY_OWNER: '' })).toBeNull();
  });
});

describe('absoluteShareUrls', () => {
  const html = [
    '<meta property="og:url" content="/lasertype/" />',
    '<meta property="og:image" content="/lasertype/og-image.jpg" />',
    '<meta property="og:image:width" content="1200" />',
    '<meta name="twitter:image" content="/lasertype/og-image.jpg" />',
    '<link rel="icon" href="/lasertype/favicon.svg" />',
  ].join('\n');

  it('makes og:url, og:image and twitter:image absolute, and nothing else', () => {
    expect(absoluteShareUrls(html, 'https://o.github.io')).toBe(
      [
        '<meta property="og:url" content="https://o.github.io/lasertype/" />',
        '<meta property="og:image" content="https://o.github.io/lasertype/og-image.jpg" />',
        '<meta property="og:image:width" content="1200" />',
        '<meta name="twitter:image" content="https://o.github.io/lasertype/og-image.jpg" />',
        '<link rel="icon" href="/lasertype/favicon.svg" />',
      ].join('\n'),
    );
  });

  it('leaves URLs that are already absolute alone', () => {
    const absolute = '<meta property="og:image" content="https://cdn.example.com/a.jpg" />';
    expect(absoluteShareUrls(absolute, 'https://o.github.io')).toBe(absolute);
  });
});
