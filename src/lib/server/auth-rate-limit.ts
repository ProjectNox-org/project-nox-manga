import { getAuthSecret } from '$lib/server/yugabyte-auth';

type Limiter = { limit(input: { key: string }): Promise<{ success: boolean }> };
type Decision = 'allow' | 'limited' | 'unavailable';

const LOCAL_WINDOW_MS = 5 * 60 * 1000;
const LOCAL_ORIGIN_MAX = 60;
const LOCAL_SUBJECT_MAX = 10;
const UNATTRIBUTABLE_ORIGIN_MAX = 30;
const UNATTRIBUTABLE_SUBJECT_MAX = 5;
export const MAX_LOCAL_BUCKETS = 10_000;
const localHits = new Map<string, number[]>();

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEX_GROUP = /^[0-9a-f]{1,4}$/i;

function isIpv4(ip: string): boolean {
  const octets = IPV4.exec(ip)?.slice(1);
  return !!octets && octets.every((octet) => Number(octet) <= 255);
}

function isIpv6(ip: string): boolean {
  if (ip.includes(':::') || (ip.match(/::/g)?.length ?? 0) > 1) return false;
  const compressed = ip.includes('::');
  const groups = ip.split(':').filter(Boolean);
  if (!groups.length) return compressed;
  const ipv4 = groups.at(-1)?.includes('.');
  if (ipv4 && !isIpv4(groups.pop()!)) return false;
  const count = groups.length + (ipv4 ? 2 : 0);
  return groups.every((group) => HEX_GROUP.test(group)) && (compressed ? count < 8 : count === 8);
}

function parseIp(raw: string | null | undefined): string | undefined {
  const ip = raw?.trim();
  if (!ip || ip.length > 45 || (!isIpv4(ip) && !isIpv6(ip))) return undefined;
  return ip.toLowerCase();
}

// Non-loopback peers are only reachable through nginx/cloudflared, so these
// headers are set upstream. Values are still validated: a malformed header
// must not become an attacker-controlled bucket key.
function clientIp(request: Request): string | undefined {
  const headers = request.headers;
  return parseIp(headers?.get('cf-connecting-ip')) ?? parseIp(headers?.get('x-real-ip'));
}

function localAllow(ip: string | undefined, mode: string, email: string, now = Date.now()): boolean {
  const key = ip ?? 'unattributable';
  const originMax = ip ? LOCAL_ORIGIN_MAX : UNATTRIBUTABLE_ORIGIN_MAX;
  const subjectMax = ip ? LOCAL_SUBJECT_MAX : UNATTRIBUTABLE_SUBJECT_MAX;
  const buckets: Array<[string, number]> = [
    [`origin:${key}`, originMax],
    [`subject:${mode}:${key}:${email.trim().toLowerCase()}`, subjectMax],
  ];
  const fresh = buckets.map(([key]) => (localHits.get(key) ?? []).filter((t) => now - t < LOCAL_WINDOW_MS));
  const blocked = fresh.some((stamps, i) => stamps.length >= buckets[i][1]);
  if (!blocked) buckets.forEach(([key], i) => {
    if (!localHits.has(key) && localHits.size >= MAX_LOCAL_BUCKETS) {
      for (const [oldKey, stamps] of localHits) if (!stamps.some((t) => now - t < LOCAL_WINDOW_MS)) localHits.delete(oldKey);
      // Map insertion order makes the oldest bucket the least recently added fallback eviction.
      if (localHits.size >= MAX_LOCAL_BUCKETS) localHits.delete(localHits.keys().next().value!);
    }
    fresh[i].push(now);
    localHits.set(key, fresh[i]);
  });
  if (localHits.size > 5000) {
    for (const [key, stamps] of localHits) if (!stamps.some((t) => now - t < LOCAL_WINDOW_MS)) localHits.delete(key);
  }
  return !blocked;
}

export const localBucketCount = () => localHits.size;

/**
 * Optional Cloudflare rate-limit bindings. These counters are approximate and
 * local to each Cloudflare location; they are not a global security boundary.
 * Configure both bindings together only after choosing and verifying limits.
 */
export async function checkAuthRateLimit(
  request: Request,
  env: any,
  mode: string,
  email: string
): Promise<Decision> {
  if (email.length > 1024 || mode.length > 64) return 'limited';
  const origin: Limiter | undefined = env?.AUTH_ORIGIN_RATE_LIMIT;
  const identity: Limiter | undefined = env?.AUTH_IDENTITY_RATE_LIMIT;
  // Local development may not provide a platform environment. A deployed
  // Worker must not silently lose its abuse guard if bindings are absent.
  if (!origin && !identity) {
    // adapter-node has no Cloudflare bindings; a missing binding must not make
    // every login fail. Guard with a process-local sliding window instead.
    return localAllow(clientIp(request), mode, email) ? 'allow' : 'limited';
  }
  if (typeof origin?.limit !== 'function' || typeof identity?.limit !== 'function') return 'unavailable';

  // Cloudflare supplies this header. Do not trust X-Forwarded-For, which a
  // client may control. A missing trusted origin must not silently disable a
  // configured limiter.
  const ip = clientIp(request);
  if (!ip || ip.length > 64) return 'unavailable';

  try {
    const secret = getAuthSecret(env);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const digest = async (value: string) => {
      const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
      return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    };
    // Bind account attempts to origin to avoid an attacker locking out a
    // victim across all networks. The independent origin budget helps bound
    // attempts against many accounts. Raw IPs and emails never become keys.
    const originKey = await digest(`auth-origin\0${ip}`);
    const subjectKey = await digest(`auth-subject\0${mode}\0${ip}\0${email.trim().toLowerCase()}`);
    const first = await origin.limit({ key: originKey });
    if (first?.success === false) return 'limited';
    if (first?.success !== true) return 'unavailable';
    const second = await identity.limit({ key: subjectKey });
    if (second?.success === false) return 'limited';
    return second?.success === true ? 'allow' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
