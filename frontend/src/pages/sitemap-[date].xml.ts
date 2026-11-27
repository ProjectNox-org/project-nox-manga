import type { APIRoute } from 'astro';
export const prerender = false;
const SITE = 'https://projectnox.org';
const API = 'http://127.0.0.1:3000';
export const GET: APIRoute = async ({ params }) => {
  const data = params.date || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return new Response('data invalida', { status: 400 });
  const r = await fetch(`${API}/api/sitemap/dia?data=${data}`);
  if (!r.ok) return new Response('indisponivel', { status: 502 });
  const j = await r.json();
  const itens = j.itens || j.obras || [];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    itens.map((o: any) => `  <url><loc>${SITE}/obra/${o.slug}</loc></url>`).join('\n') + `\n</urlset>\n`;
  return new Response(body, { headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=300' } });
};
