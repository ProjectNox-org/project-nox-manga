import { executeYugabyteSql } from './yugabyte';

export type TrendingPeriod = 'week' | 'rising' | 'month';

const TRENDING_TTL_MS = 5 * 60 * 1000;
const TRENDING_COLUMNS = `
  id, slug, title, author, kind, status, featured, cover_id, content_rating, views_total
`;

const readersCte = (fromDays: number, toDays: number) => `
  SELECT c.work_id, r.user_id::text AS reader, r.updated_at AS seen_at
    FROM reading r
    JOIN chapters c ON c.id = r.chapter_id
   WHERE r.user_id IS NOT NULL
     AND r.updated_at >= now() - interval '${fromDays} days'
     AND r.updated_at <  now() - interval '${toDays} days'
  UNION
  SELECT cv.work_id, COALESCE(cv.user_id::text, cv.anonymous_hash), cv.viewed_at
    FROM chapter_views cv
   WHERE cv.viewed_at >= now() - interval '${fromDays} days'
     AND cv.viewed_at <  now() - interval '${toDays} days'
     AND COALESCE(cv.user_id::text, cv.anonymous_hash) IS NOT NULL
`;

function periodSql(period: TrendingPeriod): string {
  if (period === 'rising') {
    return `
      WITH cur AS (${readersCte(7, 0)}),
           prev AS (${readersCte(14, 7)}),
           agg AS (
             SELECT w.id, w.slug, w.title, w.author, w.kind, w.status, w.featured,
                    w.cover_id, w.content_rating, w.views_total,
                    COALESCE(cur.n, 0)::int AS readers,
                    COALESCE(prev.n, 0)::int AS previous_readers
               FROM works w
               LEFT JOIN (SELECT work_id, count(DISTINCT reader) AS n FROM cur GROUP BY 1) cur
                      ON cur.work_id = w.id
               LEFT JOIN (SELECT work_id, count(DISTINCT reader) AS n FROM prev GROUP BY 1) prev
                      ON prev.work_id = w.id
              WHERE w.published = true
           )
      SELECT *, (readers - previous_readers)::int AS growth
        FROM agg
       WHERE readers >= 2
       ORDER BY growth DESC, ((readers + 1)::numeric / (previous_readers + 1)) DESC,
                readers DESC, views_total DESC, id
       LIMIT 24;
    `;
  }
  const days = period === 'month' ? 30 : 7;
  return `
    WITH readers AS (${readersCte(days, 0)})
    SELECT ${TRENDING_COLUMNS},
           count(DISTINCT readers.reader)::int AS readers
      FROM works w
      JOIN readers ON readers.work_id = w.id
     WHERE w.published = true
     GROUP BY w.id
     ORDER BY readers DESC, w.views_total DESC, w.id
     LIMIT 24;
  `;
}

type CacheEntry = { at: number; works: any[] };
const cache = new Map<TrendingPeriod, CacheEntry>();

export async function getTrendingWorks(platformEnv: any, period: TrendingPeriod): Promise<any[]> {
  const now = Date.now();
  const hit = cache.get(period);
  if (hit && now - hit.at < TRENDING_TTL_MS) return hit.works;
  try {
    const res = await executeYugabyteSql<any>(periodSql(period), [], platformEnv);
    const works = res.rows || [];
    if (works.length > 0) cache.set(period, { at: now, works });
    return works;
  } catch (err: any) {
    console.warn('[TRENDING_WARN]', period, err?.message || err);
    return hit?.works ?? [];
  }
}

export function invalidateTrendingCache(): void {
  cache.clear();
}
