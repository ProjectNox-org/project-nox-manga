// Cache publico da home, compartilhado com o endpoint de views para invalidacao imediata.
export type HomeCachePayload = {
  timestamp: number;
  works: any[];
  recentReleases: any[];
  mostReadWorks: any[];
};

export const HOME_CACHE_TTL_MS = 60_000;
export const MAX_LKG_FALLBACK_AGE_MS = 15 * 60 * 1000; // 15-minute maximum safe stale fallback window

let homePublicCache: HomeCachePayload | null = null;

export function readHomePublicCache(): HomeCachePayload | null {
  return homePublicCache;
}

export function writeHomePublicCache(payload: HomeCachePayload): void {
  homePublicCache = payload;
}

export function invalidateHomePublicCache(): void {
  homePublicCache = null;
}
