import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { coverVariantUrl, resolveOriginalCoverUrl } from '../src/lib/covers';

describe('hero cover variants', () => {
  it('builds a width-limited variant URL from a media id', () => {
    expect(coverVariantUrl('abc-123', 650)).toBe('/media/abc-123?v=3&w=650');
    expect(coverVariantUrl('abc-123', 325)).toBe('/media/abc-123?v=3&w=325');
  });

  it('rejects unknown widths and non media-id inputs', () => {
    expect(coverVariantUrl('abc', 9999)).toBe('/media/abc?v=3&w=650');
    expect(coverVariantUrl('', 650)).toBeNull();
    expect(coverVariantUrl('/brand/nox-symbol.webp?v=3', 650)).toBeNull();
    expect(coverVariantUrl(null, 650)).toBeNull();
  });

  it('strips the width param when falling back to the original', () => {
    expect(resolveOriginalCoverUrl('/media/abc?v=3&w=650')).toBe('/media/abc');
  });

  it('hero renders srcset with 325/650 variants and clears it on error', () => {
    const src = readFileSync('src/lib/components/HeroCarousel.svelte', 'utf8');
    expect(src).toContain('srcset={`${heroVariant(325) ?? heroCover} 325w');
    expect(src).toContain('sizes="(max-width: 640px) 260px, 325px"');
    expect(src).toContain("node.removeAttribute('srcset')");
    expect(src).toContain('imagesrcset');
  });
});
