import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('PWA shell', () => {
  it('provides installable icons declared in the manifest', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8')) as {
      display: string;
      icons: Array<{ src: string; sizes: string }>;
    };
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.some((icon) => icon.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((icon) => icon.sizes === '512x512')).toBe(true);
    manifest.icons.forEach((icon) => expect(existsSync(join(root, 'public', icon.src))).toBe(true));
  });

  it('explicitly excludes API responses from service worker caching', () => {
    const worker = readFileSync(join(root, 'public/sw.js'), 'utf8');
    expect(worker).toContain("url.pathname.startsWith('/api/')");
    expect(worker).toContain('return;');
  });
});
