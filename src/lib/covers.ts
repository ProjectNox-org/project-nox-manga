/**
 * Project Nox — Canonical Cover Resolver
 * Resolves covers strictly from database media IDs.
 * No hardcoded fixtures, mocks, or synthetic maps.
 */
export function resolveCoverUrl(
  coverId?: string | null,
  _slug?: string | null,
  _workId?: string | null,
  options?: { size?: 'thumb' | 'hero' | 'full' } | 'thumb' | 'hero' | 'full'
): string {
  if (coverId && typeof coverId === 'string' && coverId.trim()) {
    const trimmed = coverId.trim();
    if (trimmed.startsWith('/') || trimmed.startsWith('http')) return trimmed;
    // CACHE_KEY_UNICO: o endpoint de midia devolve o mesmo objeto para
    // thumb/hero/full; um unico URL por midia evita baixar a mesma capa duas
    // vezes (hero + thumb) e aproveita o cache imutavel do navegador.
    return `/media/${trimmed}?v=3`;
  }
  return '/brand/nox-symbol.webp?v=3';
}

/** Return the canonical original media URL for a failed derived variant. */
export function resolveOriginalCoverUrl(src: string): string {
  try {
    const url = new URL(src, 'https://project-nox.invalid');
    url.searchParams.delete('size');
    url.searchParams.delete('v');
    return url.origin === 'https://project-nox.invalid'
      ? `${url.pathname}${url.search}`
      : url.toString();
  } catch {
    return src.replace(/[?&]size=(?:thumb|hero)/, '').replace(/[?&]v=\d+/, '');
  }
}
