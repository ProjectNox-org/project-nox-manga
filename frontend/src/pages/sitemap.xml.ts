import type { APIRoute } from 'astro';
export const prerender = false;
const SITE = 'https://projectnox.org';
const API = 'http://127.0.0.1:3000';
export const GET: APIRoute = async () => {
  const urls: string[] = ['/', '/catalogo', '/ranking', '/loja', '/lancamentos', '/sobre', '/privacidade', '/downloads', '/scan', '/scans'];
  let offset = 0;
  for (let p = 0; p < 50; p++) {
    const r = await fetch(`${API}/api/obras?limit=100&offset=${offset}`);
    if (!r.ok) break;
    const j = await r.json();
    const itens = j.itens || j.items || [];
    if (!itens.length) break;
    for (const o of itens) urls.push('/obra/' + o.slug);
    offset += itens.length;
    if (offset >= (j.total || 0)) break;
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join('\n') + `\n</urlset>\n`;
  return new Response(body, { headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=3600' } });
};
