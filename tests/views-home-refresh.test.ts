import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('home view counters refresh', () => {
  it('exposes a shared home cache with invalidation', () => {
    const mod = read('src/lib/server/home-cache.ts');
    expect(mod).toContain('export function invalidateHomePublicCache');
    expect(mod).toContain('export function readHomePublicCache');
    expect(mod).toContain('export function writeHomePublicCache');
  });

  it('home load uses the shared cache and never serves cached HTML', () => {
    const page = read('src/routes/+page.server.ts');
    expect(page).toContain("from '$lib/server/home-cache'");
    expect(page).toContain('writeHomePublicCache({');
    expect(page).toContain('private, no-cache, max-age=0, must-revalidate');
    expect(page).not.toContain('s-maxage=30');
  });

  it('view endpoint invalidates home cache and home LKG bundles when counted', () => {
    const view = read('src/routes/api/chapters/[id]/view/+server.ts');
    expect(view).toContain('invalidateHomePublicCache()');
    expect(view).toContain("invalidateYugabyteLkgPrefix('home_bundle')");
    expect(view).toContain("invalidateYugabyteLkgPrefix('home_most_read')");
    expect(view).toContain("invalidateYugabyteLkgPrefix('recent_releases_')");
    const callIdx = view.indexOf('invalidateHomePublicCache()');
    const returnIdx = view.indexOf('if (yugabyteCounted)');
    expect(returnIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(returnIdx);
  });

  it('layout revalidates view counter routes on event, pageshow and visibility', () => {
    const layout = read('src/routes/+layout.svelte');
    expect(layout).toContain("window.addEventListener('nox:view-counted', handleViewCounted)");
    expect(layout).toContain("window.addEventListener('pageshow', handlePageShow)");
    expect(layout).toContain("document.addEventListener('visibilitychange', handleVisibilityChange)");
    expect(layout).toContain("currentPath === '/'");
    expect(layout).toContain("currentPath.startsWith('/obra/')");
  });
});
