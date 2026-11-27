import type { APIRoute } from 'astro';
export const prerender = false;
const BASE = 'http://127.0.0.1:3000';
export const ALL: APIRoute = async ({ request, params }) => {
  const caminho = params.path ?? '';
  const alvo = new URL(request.url);
  const url = `${BASE}/api/${caminho}${alvo.search}`;
  const headers = new Headers();
  for (const [k, v] of request.headers) {
    if (['host', 'connection', 'content-length'].includes(k)) continue;
    headers.set(k, v);
  }
  const init: RequestInit = { method: request.method, headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.arrayBuffer();
  const r = await fetch(url, init);
  const out = new Headers();
  for (const [k, v] of r.headers) {
    if (['content-encoding', 'transfer-encoding', 'content-length'].includes(k)) continue;
    out.set(k, v);
  }
  return new Response(await r.arrayBuffer(), { status: r.status, headers: out });
};
