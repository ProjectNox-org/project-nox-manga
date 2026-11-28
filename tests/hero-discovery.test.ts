import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  HERO_COOLDOWN_SLOTS,
  HERO_ROTATION_MS,
  HERO_SIZE,
  MIN_SYNOPSIS_CHARS,
  currentSlot,
  isValidSynopsis,
  nextSlotAt,
  weightedKey
} from '../src/lib/server/hero-discovery';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

describe('hero discovery selection', () => {
  it('rotates every 15 minutes and keeps 10 works with 24-slot cooldown', () => {
    expect(HERO_ROTATION_MS).toBe(900000);
    expect(HERO_SIZE).toBe(10);
    expect(HERO_COOLDOWN_SLOTS).toBe(24);
    expect(MIN_SYNOPSIS_CHARS).toBe(40);
    expect(currentSlot(0)).toBe(0);
    expect(currentSlot(HERO_ROTATION_MS - 1)).toBe(0);
    expect(currentSlot(HERO_ROTATION_MS)).toBe(1);
    expect(nextSlotAt(HERO_ROTATION_MS + 1)).toBe(2 * HERO_ROTATION_MS);
  });

  it('weights low-view works ahead of popular ones for the same random draw', () => {
    expect(weightedKey(0.5, 0)).toBeLessThan(weightedKey(0.5, 100));
    expect(weightedKey(0.9, 0)).toBeLessThan(weightedKey(0.9, 5));
  });

  it('accepts real synopsis text and rejects junk', () => {
    expect(isValidSynopsis('Uma historia completa sobre um guerreiro que retorna e precisa reconstruir sua vida.')).toBe(true);
    for (const bad of [
      '',
      'curta',
      'Fansub: Euphoria Scan',
      'Para evitar violar as regras do Mangadex, leia no site',
      'https://exemplo.com/obra',
      '<strong>texto</strong> com html e mais caracteres para passar do limite minimo',
      'a'.repeat(300)
    ]) {
      expect(isValidSynopsis(bad)).toBe(false);
    }
  });
});

describe('hero discovery wiring', () => {
  it('serves the hero from the shared discovery selector and invalidates nothing per request', () => {
    const home = read('src/routes/+page.server.ts');
    expect(home).toContain("from '$lib/server/hero-discovery'");
    expect(home).toContain('await getHeroDiscovery(');
    expect(home).toContain('withFreshViews(');
    expect(home).not.toContain('ROUND 5');
  });

  it('does not cache featured works in the shared home cache', () => {
    const cache = read('src/lib/server/home-cache.ts');
    expect(cache).not.toContain('featuredList');
  });

  it('exposes a no-store hero endpoint with slot metadata', () => {
    const api = read('src/routes/api/hero/+server.ts');
    expect(api).toContain('private, no-cache');
    expect(api).toContain('expires_at');
    expect(api).toContain('slot');
  });

  it('refreshes the hero without polling or reloading', () => {
    const page = read('src/routes/+page.svelte');
    expect(page).toContain("fetch('/api/hero'");
    expect(page).toContain('heroLastInteraction');
    expect(page).toContain('scheduleHeroRefresh');
    expect(page).not.toContain('setInterval');
  });

  it('renders age rating, tags and chapter count in the carousel', () => {
    const hero = read('src/lib/components/HeroCarousel.svelte');
    expect(hero).toContain('badge-age');
    expect(hero).toContain('hero-tags');
    expect(hero).toContain('capítulos');
  });
});
