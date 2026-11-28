import { executeYugabyteSql } from '$lib/server/yugabyte';

export const HERO_ROTATION_MS = 15 * 60 * 1000;
export const HERO_SIZE = 10;
export const HERO_COOLDOWN_SLOTS = 24; // 6 hours of 15-minute slots
export const MIN_SYNOPSIS_CHARS = 40;

// Quality gate: short synopses can be legitimate; junk is not.
const SYNOPSIS_JUNK = [
  /fansub/i,
  /mangadex/i,
  /para\s+evitar\s+violar/i,
  /https?:\/\//i,
  /<\/?(?:p|br|div|span|b|i|strong|em)\b/i,
  /&lt;|&gt;/i,
  /ler\s+online/i,
  /tankoubon/i,
  /hentai\s+ptbr/i,
  /\bptbr\b[^\n]{0,40}\bmanga\b/i
];

export function isValidSynopsis(text: unknown): boolean {
  const value = String(text ?? '').trim();
  if (value.length < MIN_SYNOPSIS_CHARS) return false;
  // Texto de verdade tem palavras: descarta spam de um token gigante.
  if (value.split(/\s+/).filter((word) => word.length > 1).length < 4) return false;
  return !SYNOPSIS_JUNK.some((pattern) => pattern.test(value));
}

export function currentSlot(now = Date.now()): number {
  return Math.floor(now / HERO_ROTATION_MS);
}

export function nextSlotAt(now = Date.now()): number {
  return (currentSlot(now) + 1) * HERO_ROTATION_MS;
}

// Exponential-key weighted sampling: lower key wins, popular works lose priority.
export function weightedKey(randomValue: number, views: number): number {
  return -Math.log(randomValue) * (1 + Math.max(0, views || 0));
}

export type HeroTag = { name: string; slug?: string };
export type HeroWork = Record<string, any>;

type CardCache = { key: string; works: HeroWork[] };

let cardCache: CardCache | null = null;
let lastKnownGood: HeroWork[] | null = null;

const ADULT_SLUGS = `('adulto','adulto-18','adult','hentai','nsfw','smut','futanari','incesto','incest','creampie','ahegao','orgia','orgy','gangbang','netorare','mindbreak','loli','lolicon','shotacon','shota','pedofilia')`;

function selectionSql(withSynopsis: boolean, withCooldown: boolean): string {
  return `
    SELECT w.id::text AS id
      FROM public.works w
     WHERE w.published = true
       AND w.cover_id IS NOT NULL
       ${withSynopsis ? `AND char_length(btrim(COALESCE(w.synopsis, ''))) >= ${MIN_SYNOPSIS_CHARS}
       AND w.synopsis !~* '(fansub|mangadex|para\\s+evitar\\s+violar|https?://|</?(p|br|div|span|b|i|strong|em)\\b|&lt;|&gt;)'` : ''}
       AND ($1::boolean OR (
         w.content_rating IS DISTINCT FROM 'ADULT_18'
         AND COALESCE(w.age_rating, 0) < 18
         AND NOT EXISTS (
           SELECT 1
             FROM public.work_tags wt
             JOIN public.tags t ON t.id = wt.tag_id
            WHERE wt.work_id = w.id
              AND (lower(t.slug) IN ${ADULT_SLUGS}
                   OR t.name ILIKE '%+18%' OR t.name ILIKE '%hentai%')
         )
       ))
       ${withCooldown ? `AND NOT EXISTS (
         SELECT 1
           FROM public.hero_discovery_selection h
           CROSS JOIN LATERAL unnest(h.work_ids) AS prior(work_id)
          WHERE prior.work_id = w.id
            AND h.rotation_slot >= $2::bigint - ${HERO_COOLDOWN_SLOTS}
            AND h.rotation_slot < $2::bigint
       )` : ''}
     ORDER BY -ln(random()) * (1 + GREATEST(COALESCE(w.views_total, 0), 0)) ASC
     LIMIT $3::int`;
}

async function pickIds(env: any, adultAllowed: boolean, slot: number, withSynopsis: boolean, withCooldown: boolean): Promise<string[]> {
  const res = await executeYugabyteSql<any>(selectionSql(withSynopsis, withCooldown), [adultAllowed, slot, HERO_SIZE], env);
  return (res.rows || []).map((row: any) => String(row.id)).filter(Boolean);
}

async function readManifest(env: any, slot: number, adultAllowed: boolean): Promise<string[]> {
  const res = await executeYugabyteSql<any>(
    `SELECT work_ids FROM public.hero_discovery_selection WHERE rotation_slot = $1::bigint AND adult_allowed = $2::boolean LIMIT 1`,
    [slot, adultAllowed],
    env
  );
  return (res.rows?.[0]?.work_ids || []).map((id: any) => String(id));
}

async function writeManifest(env: any, slot: number, adultAllowed: boolean, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await executeYugabyteSql<any>(
    `INSERT INTO public.hero_discovery_selection (rotation_slot, adult_allowed, work_ids)
     VALUES ($1::bigint, $2::boolean, $3::uuid[])
     ON CONFLICT (rotation_slot, adult_allowed) DO NOTHING`,
    [slot, adultAllowed, ids],
    env
  );
}

async function selectForSlot(env: any, adultAllowed: boolean, slot: number): Promise<string[]> {
  const existing = await readManifest(env, slot, adultAllowed);
  if (existing.length) return existing;

  let ids = await pickIds(env, adultAllowed, slot, true, true);
  if (ids.length < 2) ids = await pickIds(env, adultAllowed, slot, true, false);
  if (ids.length < 1) ids = await pickIds(env, adultAllowed, slot, false, false);
  if (!ids.length) return [];

  await writeManifest(env, slot, adultAllowed, ids);
  const winner = await readManifest(env, slot, adultAllowed);
  return winner.length ? winner : ids;
}

async function enrich(env: any, ids: string[]): Promise<HeroWork[]> {
  if (!ids.length) return [];
  const res = await executeYugabyteSql<any>(
    `SELECT w.id::text AS id,
            w.slug,
            w.title,
            LEFT(COALESCE(w.synopsis, ''), 600) AS synopsis,
            w.cover_id,
            w.kind,
            w.status,
            w.year,
            w.views_total,
            w.content_rating,
            w.age_rating,
            (SELECT COUNT(*)::int FROM public.chapters c WHERE c.work_id = w.id) AS chapter_count,
            COALESCE(tg.names, ARRAY[]::text[]) AS tag_names,
            COALESCE(tg.slugs, ARRAY[]::text[]) AS tag_slugs
       FROM public.works w
       LEFT JOIN LATERAL (
         SELECT array_agg(x.name ORDER BY x.name) AS names,
                array_agg(COALESCE(x.slug, '') ORDER BY x.name) AS slugs
           FROM (
             SELECT t.name, t.slug
               FROM public.work_tags wt
               JOIN public.tags t ON t.id = wt.tag_id
              WHERE wt.work_id = w.id
              ORDER BY t.name
              LIMIT 4
           ) x
       ) tg ON true
      WHERE w.id = ANY($1::uuid[])`,
    [ids],
    env
  );

  const byId = new Map<string, HeroWork>();
  for (const row of res.rows || []) {
    byId.set(String(row.id), {
      ...row,
      chapter_count: Number(row.chapter_count || 0),
      tags: (row.tag_names || []).map((name: string, index: number) => ({
        name,
        slug: (row.tag_slugs || [])[index] || undefined
      }))
    });
  }
  return ids.map((id) => byId.get(id)).filter(Boolean) as HeroWork[];
}

export async function getHeroViews(ids: string[], env: any): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const res = await executeYugabyteSql<any>(
    `SELECT id::text AS id, views_total FROM public.works WHERE id = ANY($1::uuid[])`,
    [ids],
    env
  );
  const map: Record<string, number> = {};
  for (const row of res.rows || []) map[String(row.id)] = Number(row.views_total || 0);
  return map;
}

export async function withFreshViews(works: HeroWork[], env: any): Promise<HeroWork[]> {
  if (!works?.length) return works || [];
  try {
    const views = await getHeroViews(works.map((work) => String(work.id)), env);
    return works.map((work) => ({ ...work, views_total: views[String(work.id)] ?? work.views_total }));
  } catch {
    return works;
  }
}

export async function getHeroDiscovery(
  env: any,
  { adultAllowed = false, now = Date.now() }: { adultAllowed?: boolean; now?: number } = {}
): Promise<HeroWork[]> {
  const slot = currentSlot(now);
  const key = `${slot}:${adultAllowed ? 'adult' : 'general'}`;
  if (cardCache?.key === key) return cardCache.works;

  try {
    const ids = await selectForSlot(env, adultAllowed, slot);
    const works = await enrich(env, ids);
    if (works.length) {
      cardCache = { key, works };
      lastKnownGood = works;
      return works;
    }
  } catch (error: any) {
    console.warn('[HERO_DISCOVERY_ERROR]', error?.message || error);
  }

  return cardCache?.works?.length ? cardCache.works : lastKnownGood || [];
}
