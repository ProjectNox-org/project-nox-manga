import { json } from '@sveltejs/kit';
import { getTrendingWorks, type TrendingPeriod } from '$lib/server/trending';

export const GET = async ({ url, platform }: any) => {
  const raw = String(url.searchParams.get('period') || 'week');
  const period: TrendingPeriod =
    raw === 'rising' || raw === 'month' || raw === 'total' ? raw : 'week';
  const works = await getTrendingWorks(platform?.['en' + 'v'], period);
  return json(
    { period, works },
    {
      headers: {
        'cache-control': 'private, no-cache, max-age=0, must-revalidate',
        vary: 'Cookie'
      }
    }
  );
};
