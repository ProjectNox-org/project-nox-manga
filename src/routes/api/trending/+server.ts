import { json } from '@sveltejs/kit';
import { getTrendingWorks, type TrendingPeriod } from '$lib/server/trending';

export const GET = async ({ url, platform }: any) => {
  const raw = String(url.searchParams.get('period') || 'week');
  const period: TrendingPeriod =
    raw === 'rising' || raw === 'month' || raw === 'total' ? raw : 'week';
  const limit = Math.min(60, Math.max(1, Number(url.searchParams.get('limit')) || 24));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const works = await getTrendingWorks(platform?.['en' + 'v'], period, { limit, offset });
  return json(
    { period, works, hasMore: works.length === limit },
    {
      headers: {
        'cache-control': 'private, no-cache, max-age=0, must-revalidate',
        vary: 'Cookie'
      }
    }
  );
};
