import type { APIRoute } from 'astro';
export const prerender = false;
const SITE = 'https://projectnox.org';
const PAGS = ['/', '/catalogo', '/ranking', '/ranking/hall-da-fama', '/loja', '/lancamentos', '/sobre', '/privacidade', '/downloads', '/scan', '/scans'];
export const GET: APIRoute = async () => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    PAGS.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join('\n') + `\n</urlset>\n`;
  return new Response(body, { headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=3600' } });
};
