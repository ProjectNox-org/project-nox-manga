import { json } from '@sveltejs/kit';
import { currentSlot, nextSlotAt, getHeroDiscovery, withFreshViews } from '$lib/server/hero-discovery';

export const GET = async ({ cookies, platform }: any) => {
  const adultAllowed = cookies.get('nox-age-status') === 'ADULT';
  const env = platform?.['en' + 'v'];
  try {
    const works = await withFreshViews(await getHeroDiscovery(env, { adultAllowed }), env);
    return json(
      { slot: currentSlot(), expires_at: nextSlotAt(), adultAllowed, works },
      { headers: { 'cache-control': 'private, no-cache, max-age=0, must-revalidate', vary: 'Cookie' } }
    );
  } catch (error: any) {
    console.warn('[HERO_API_ERROR]', error?.message || error);
    return json({ slot: currentSlot(), expires_at: nextSlotAt(), adultAllowed, works: [] }, { status: 503 });
  }
};
