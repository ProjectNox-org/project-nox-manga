import { executeYugabyteSql } from './yugabyte';

export type TrendingPeriod = 'week' | 'rising' | 'month' | 'total';

const TRENDING_TTL_MS = 5 * 60 * 1000;
const TRENDING_COLUMNS = `
  id, slug, title, author, kind, status, featured, cover_id, content_rating, views_total
`;

// Uma linha de chapter_views = uma visualizacao unica de leitor+capitulo.
const viewsCte = (fromDays: number, toDays: number) => `
  SELECT c.work_id, count(*)::int AS views
    FROM chapter_views cv
    JOIN chapters c ON c.id = cv.chapter_id
   WHERE cv.viewed_at >= now() - interval '${fromDays} days'
     AND cv.viewed_at <  now() - interval '${toDays} days'
   GROUP BY c.work_id
`;

function periodSql(period: TrendingPeriod, limit: number, offset: number): string {
  if (period === 'rising') {
    return `
      WITH cur AS (${viewsCte(7, 0)}),
           prev AS (${viewsCte(14, 7)}),
           agg AS (
             SELECT w.id, w.slug, w.title, w.author, w.kind, w.status, w.featured,
                    w.cover_id, w.content_rating, w.views_total,
                    COALESCE(cur.views, 0)::int AS period_views,
                    COALESCE(prev.views, 0)::int AS previous_views
               FROM works w
               LEFT JOIN cur ON cur.work_id = w.id
               LEFT JOIN prev ON prev.work_id = w.id
              WHERE w.published = true
           )
      SELECT *, (period_views - previous_views)::int AS growth,
             CASE WHEN previous_views > 0
                  THEN round((period_views - previous_views) * 100.0 / previous_views)
                  ELSE NULL END AS growth_pct
        FROM agg
       WHERE period_views >= 3
       ORDER BY growth DESC,
                CASE WHEN previous_views > 0
                     THEN (period_views::numeric / previous_views)
                     ELSE period_views END DESC,
                period_views DESC, views_total DESC, id
       LIMIT ${limit} OFFSET ${offset};
    `;
  }
  if (period === 'total') {
    return `
      SELECT ${TRENDING_COLUMNS}, views_total::int AS period_views
        FROM works
       WHERE published = true
       ORDER BY views_total DESC, id
       LIMIT ${limit} OFFSET ${offset};
    `;
  }
  const days = period === 'month' ? 30 : 7;
  return `
    WITH cur AS (${viewsCte(days, 0)})
    SELECT ${TRENDING_COLUMNS}, cur.views::int AS period_views
      FROM works w
      JOIN cur ON cur.work_id = w.id
     WHERE w.published = true
     ORDER BY cur.views DESC, w.views_total DESC, w.id
     LIMIT ${limit} OFFSET ${offset};
  `;
}

type CacheEntry = { at: number; works: any[] };
const cache = new Map<string, CacheEntry>();

export async function getTrendingWorks(
  platformEnv: any,
  period: TrendingPeriod,
  opts: { limit?: number; offset?: number } = {}
): Promise<any[]> {
  const limit = Math.min(60, Math.max(1, Number(opts.limit) || 24));
  const offset = Math.min(10_000, Math.max(0, Number(opts.offset) || 0));
  const key = `${period}:${limit}:${offset}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TRENDING_TTL_MS) return hit.works;
  try {
    const res = await executeYugabyteSql<any>(periodSql(period, limit, offset), [], platformEnv);
    const works = res.rows || [];
    if (works.length > 0) cache.set(key, { at: now, works });
    return works;
  } catch (err: any) {
    console.warn('[TRENDING_WARN]', period, err?.message || err);
    return hit?.works ?? [];
  }
}

export function invalidateTrendingCache(): void {
  cache.clear();
}
