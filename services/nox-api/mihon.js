// API Mihon — contrato compatível com o site original (SvelteKit).
import crypto from 'node:crypto';
import { buildWorkSearchCondition } from './search-helper.js';

const MAX_LIMIT = 50;

const lim = (v, def, max) => {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(1, n)) : def;
};

const first = (v, def) => (v ? String(v).split(',')[0].trim() : def);
const base = (req) => {
  const proto = first(req.headers['x-forwarded-proto'], 'http').replace(/[^a-z]/gi, '') || 'http';
  const host = first(req.headers['x-forwarded-host'], first(req.headers.host, '127.0.0.1')).replace(/[^a-z0-9.:[\]-]/gi, '');
  return `${proto}://${host}`;
};

async function usuarioToken(req, pool) {
  const m = (req.headers.authorization || '').match(/^Bearer\s+([A-Za-z0-9_-]+)$/i);
  if (!m) return null;
  const hash = crypto.createHash('sha256').update(m[1]).digest('hex');
  const { rows } = await pool.query(
    `SELECT t.user_id, t.expires_at, t.revoked, u.email
       FROM public.mihon_tokens t JOIN auth.users u ON u.id = t.user_id
      WHERE t.token_hash = $1 LIMIT 1`,
    [hash]
  );
  const r = rows[0];
  if (!r || r.revoked || (r.expires_at && new Date(r.expires_at) < new Date())) return null;
  return r;
}

export default async function mihonRoutes(app, pool) {
  app.get('/api/mihon/catalog', async (req, reply) => {
    const page = lim(req.query.page, 1, 10000);
    const limit = lim(req.query.limit, 24, MAX_LIMIT);
    const offset = (page - 1) * limit;
    const q = (req.query.query ?? req.query.search ?? '').trim();
    const status = (req.query.status ?? '').toUpperCase() || null;

    const cond = ['w.published IS NOT FALSE'];
    const args = [];
    if (q) {
      const s = buildWorkSearchCondition('w.', q, args.length + 1);
      if (s.clause) {
        args.push(...s.params);
        cond.push(s.clause);
      }
    }
    if (status) { args.push(status); cond.push(`w.status::text = $${args.length}`); }
    const where = `WHERE ${cond.join(' AND ')}`;

    args.push(limit, offset);
    const sql = `SELECT w.id, w.title, w.aliases, w.slug, w.kind::text AS kind, w.status::text AS status,
                        w.content_rating::text AS content_rating, w.synopsis, w.cover_id, w.updated_at,
                        count(*) OVER() AS total
                   FROM public.works w ${where}
                  ORDER BY w.updated_at DESC NULLS LAST
                  LIMIT $${args.length - 1} OFFSET $${args.length}`;
    const { rows } = await pool.query(sql, args);
    const total = rows.length ? Number(rows[0].total) : 0;
    const b = base(req);
    const works = rows.map((w) => ({
      id: w.id, title: w.title, alternative_titles: w.aliases || [], slug: w.slug,
      kind: w.kind, status: w.status, content_rating: w.content_rating || 'GENERAL',
      synopsis: w.synopsis, cover_url: w.cover_id ? `${b}/midia/${w.cover_id}` : null,
      updated_at: w.updated_at,
    }));
    reply.header('cache-control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    return { page, limit, total, has_more: offset + works.length < total, works };
  });

  app.get('/api/mihon/work/:slug', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT id, title, slug, kind::text AS kind, status::text AS status,
              content_rating::text AS content_rating, synopsis, author, artist, cover_id, updated_at
         FROM public.works WHERE slug = $1 LIMIT 1`,
      [req.params.slug]
    );
    const w = rows[0];
    if (!w) return reply.code(404).send({ error: 'Obra não encontrada' });

    const caps = await pool.query(
      `SELECT id, number, display_number, title, language, published_at, canonical_chapter_key, chapter_order_key
         FROM public.chapters
        WHERE work_id = $1 AND published_at IS NOT NULL
        ORDER BY number ASC NULLS LAST, display_number ASC`,
      [w.id]
    );
    const tags = await pool.query(
      `SELECT t.name, t.slug FROM public.work_tags wt JOIN public.tags t ON t.id = wt.tag_id WHERE wt.work_id = $1`,
      [w.id]
    );
    const latest = caps.rows.reduce((a, c) => Math.max(a, new Date(c.published_at).getTime() || 0), 0);
    const etag = `"${w.id}-${new Date(w.updated_at || 0).getTime()}-${caps.rows.length}-${latest}"`;
    const b = base(req);

    if (req.headers['if-none-match'] === etag) {
      reply.header('etag', etag).header('cache-control', 'public, max-age=300, s-maxage=3600');
      return reply.code(304).send();
    }
    reply.header('etag', etag).header('cache-control', 'public, max-age=300, s-maxage=3600');
    return {
      id: w.id, title: w.title, slug: w.slug, kind: w.kind, status: w.status,
      content_rating: w.content_rating || 'GENERAL', synopsis: w.synopsis,
      author: w.author, artist: w.artist, cover_url: w.cover_id ? `${b}/midia/${w.cover_id}` : null,
      updated_at: w.updated_at,
      genres: tags.rows.map((t) => t.name).filter(Boolean),
      chapters: caps.rows.map((c) => ({
        id: c.id, number: c.number, display_number: c.display_number || String(c.number ?? 'Especial'),
        title: c.title, language: c.language, published_at: c.published_at,
      })),
    };
  });

  app.get('/api/mihon/chapter/:id/pages', async (req, reply) => {
    const cap = await pool.query(
      `SELECT c.id, c.number, c.display_number, c.title, c.language, c.published_at
         FROM public.chapters c WHERE c.id = $1 LIMIT 1`,
      [req.params.id]
    );
    const c = cap.rows[0];
    if (!c) return reply.code(404).send({ error: 'Capítulo não encontrado' });

    const { rows } = await pool.query(
      `SELECT p.position, p.media_id, p.width, p.height, m.mime, m.bytes
         FROM public.pages p LEFT JOIN public.media m ON m.id = p.media_id
        WHERE p.chapter_id = $1 ORDER BY p.position ASC`,
      [c.id]
    );
    const etag = `"${c.id}-${rows.length}-${rows.reduce((a, p) => a + (p.bytes || 0), 0)}"`;
    if (req.headers['if-none-match'] === etag) {
      reply.header('etag', etag).header('cache-control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=3600');
      return reply.code(304).send();
    }
    const b = base(req);
    reply.header('etag', etag).header('cache-control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=3600');
    return {
      chapter_id: c.id,
      chapter_number: c.number,
      chapter_display_number: c.display_number || String(c.number ?? 'Especial'),
      chapter_title: c.title,
      language: c.language,
      pages: rows.map((p, i) => ({
        index: i, position: p.position, media_id: p.media_id,
        url: `${b}/midia/${p.media_id}`, width: p.width, height: p.height, mime: p.mime, bytes: p.bytes,
      })),
    };
  });

  app.post('/api/mihon/progress', async (req, reply) => {
    const u = await usuarioToken(req, pool);
    if (!u) return reply.code(401).send({ error: 'Token inválido ou ausente' });
    const body = req.body || {};
    const capId = body.chapter_id;
    const page = Number.isInteger(body.page) ? body.page : 1;
    if (!capId || page < 1) return reply.code(400).send({ error: 'Dados de progresso inválidos.' });

    const cap = await pool.query('SELECT id, work_id FROM public.chapters WHERE id = $1 LIMIT 1', [capId]);
    if (!cap.rows[0]) return reply.code(404).send({ error: 'Capítulo não encontrado' });
    const total = await pool.query('SELECT count(*)::int AS n FROM public.pages WHERE chapter_id = $1', [capId]);
    const n = total.rows[0]?.n || 0;
    const pg = Math.min(page, Math.max(n, 1));

    await pool.query(
      `INSERT INTO public.reading (user_id, chapter_id, page, max_page, started_at, updated_at)
       VALUES ($1,$2,$3,$3, now(), now())
       ON CONFLICT (user_id, chapter_id) DO UPDATE
         SET page = EXCLUDED.page,
             max_page = GREATEST(public.reading.max_page, EXCLUDED.page),
             updated_at = now()`,
      [u.user_id, capId, pg]
    );
    return { ok: true, chapter_id: capId, page: pg, total_pages: n };
  });
}
