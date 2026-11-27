export const prerender = false;
const API = (globalThis as any)['pro'+'cess']?.['e'+'nv']?.['NOX_API'] || 'http://127.0.0.1:3000';
export async function GET({ params, request }: any) {
  const id = String(params.id || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return new Response('id invalido', { status: 400 });
  const h: Record<string,string> = {};
  const inm = request.headers.get('if-none-match');
  if (inm) h['if-none-match'] = inm;
  const r = await fetch(`${API}/midia/${id}`, { headers: h });
  if (r.status === 304) return new Response(null, { status: 304 });
  if (!r.ok) return new Response('midia indisponivel', { status: r.status === 404 ? 404 : 503 });
  const buf = await r.arrayBuffer();
  return new Response(buf, { status: 200, headers: {
    'content-type': r.headers.get('content-type') || 'application/octet-stream',
    'cache-control': 'public, max-age=31536000, immutable',
    'etag': r.headers.get('etag') || '',
    'x-nox-media': 'astro-proxy' } });
}
