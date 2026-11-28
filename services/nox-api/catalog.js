// Rotas de catálogo (somente leitura) — consumidas pelo Astro SSR.
import { buildWorkSearchCondition, buildWorkSearchRelevanceOrder } from './search-helper.js';

const LIM_MAX = 100;

function intOr(v, d, min, max) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return d;
  return Math.min(Math.max(n, min), max);
}

export default async function catalog(app, pool) {
  // lista com busca opcional, paginação por offset
  // nox:filtros-v2
  app.get('/api/obras', async (req) => {
    const limit = intOr(req.query.limit, 20, 1, LIM_MAX);
    const offset = intOr(req.query.offset, 0, 0, 1_000_000);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const kind = typeof req.query.kind === 'string' ? req.query.kind.toUpperCase() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
    const sort = ['recentes', 'populares', 'az'].includes(String(req.query.sort)) ? String(req.query.sort) : 'recentes';

    // placeholders da lista começam em $3 (1 = limit, 2 = offset)
    const cond = [];
    const fp = [];
    if (q) {
      const s = buildWorkSearchCondition('w.', q, fp.length + 3);
      if (s.clause) {
        fp.push(...s.params);
        cond.push(s.clause);
      }
    }
    if (kind) { fp.push(kind); cond.push('w.kind::text = $' + (fp.length + 2)); }
    if (status) { fp.push(status); cond.push('w.status::text = $' + (fp.length + 2)); }

    const filtro = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    const filtroTot = filtro.replace(/\$(\d+)/g, (_, d) => '$' + (Number(d) - 2));
    const ordem = sort === 'populares' ? 'w.views_total DESC NULLS LAST'
      : sort === 'az' ? 'w.title ASC'
      : 'w.updated_at DESC NULLS LAST';
    const rank = q && sort === 'recentes'
      ? buildWorkSearchRelevanceOrder('w.', q, fp.length + 3)
      : { orderPrefix: '', params: [] };
    const ordemFinal = rank.orderPrefix ? `${rank.orderPrefix}${ordem}` : ordem;

    const { rows } = await pool.query(
      `SELECT w.id, w.slug, w.title, w.kind, w.status, w.year, w.cover_id,
              w.latest_chapter_published_at, w.views_total,
              (SELECT count(*) FROM chapters c WHERE c.work_id = w.id) AS capitulos
         FROM works w
         ${filtro}
        ORDER BY ${ordemFinal}
        LIMIT $1 OFFSET $2`,
      [limit, offset, ...fp, ...rank.params]
    );
    const tot = await pool.query(
      `SELECT count(*)::int AS n FROM works w ${filtroTot}`,
      fp
    );
    return { total: tot.rows[0].n, limit, offset, kind, status, sort, itens: rows };
  });

  app.get('/api/filtros', async () => {
    const kinds = await pool.query(
      "SELECT kind AS valor, count(*)::int AS n FROM works WHERE kind IS NOT NULL AND kind <> '' GROUP BY kind ORDER BY n DESC"
    );
    const status = await pool.query(
      "SELECT status AS valor, count(*)::int AS n FROM works WHERE status IS NOT NULL AND status <> '' GROUP BY status ORDER BY n DESC"
    );
    return { kinds: kinds.rows, status: status.rows };
  });

  app.get('/api/obras/:slug', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT w.id, w.slug, w.title, w.aliases, w.synopsis, w.description, w.author, w.artist,
              w.kind, w.status, w.year, w.age_rating, w.published, w.cover_id, w.views_total,
              w.latest_chapter_published_at,
              (SELECT count(*) FROM chapters c WHERE c.work_id = w.id) AS capitulos
         FROM works w WHERE w.slug = $1 LIMIT 1`,
      [req.params.slug]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'obra_nao_encontrada' });
    return rows[0];
  });

  // capítulos publicados da obra, ordem de leitura
  app.get('/api/obras/:slug/capitulos', async (req, reply) => {
    const limit = intOr(req.query.limit, 50, 1, LIM_MAX);
    const offset = intOr(req.query.offset, 0, 0, 1_000_000);
    const obra = await pool.query('SELECT id FROM works WHERE slug = $1 LIMIT 1', [req.params.slug]);
    if (!obra.rows[0]) return reply.code(404).send({ error: 'obra_nao_encontrada' });
    const { rows } = await pool.query(
      `SELECT c.id, c.number, c.display_number, c.title, c.published_at, c.views_total,
              (SELECT count(*) FROM pages p WHERE p.chapter_id = c.id) AS paginas
         FROM chapters c
        WHERE c.work_id = $1 AND c.published_at IS NOT NULL
        ORDER BY c.number ASC NULLS LAST
        LIMIT $2 OFFSET $3`,
      [obra.rows[0].id, limit, offset]
    );
    return { total: rows.length, limit, offset, itens: rows };
  });

  // capítulo isolado (cabeçalho do leitor)
  app.get('/api/capitulos/:id', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.number, c.display_number, c.title, c.published_at, c.language,
              w.slug AS obra_slug, w.title AS obra_titulo,
              (SELECT count(*) FROM pages p WHERE p.chapter_id = c.id) AS paginas,
              (SELECT c2.id FROM chapters c2
                WHERE c2.work_id = c.work_id AND c2.published_at IS NOT NULL
                  AND c2.number < c.number
                ORDER BY c2.number DESC LIMIT 1) AS prev_id,
              (SELECT c2.id FROM chapters c2
                WHERE c2.work_id = c.work_id AND c2.published_at IS NOT NULL
                  AND c2.number > c.number
                ORDER BY c2.number ASC LIMIT 1) AS next_id
         FROM chapters c JOIN works w ON w.id = c.work_id
        WHERE c.id = $1 LIMIT 1`,
      [req.params.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'capitulo_nao_encontrado' });
    return rows[0];
  });

  // páginas na ordem de leitura, com metadados de mídia (a mídia em si vem pelo gateway)
  app.get('/api/capitulos/:id/paginas', async (req, reply) => {
    const cap = await pool.query('SELECT id FROM chapters WHERE id = $1 LIMIT 1', [req.params.id]);
    if (!cap.rows[0]) return reply.code(404).send({ error: 'capitulo_nao_encontrado' });
    const { rows } = await pool.query(
      `SELECT p.position, p.media_id, p.width, p.height,
              m.mime, m.bytes, m.storage_ready, m.access_class
         FROM pages p LEFT JOIN media m ON m.id = p.media_id
        WHERE p.chapter_id = $1
        ORDER BY p.position ASC`,
      [req.params.id]
    );
    return { capitulo: req.params.id, paginas: rows.length, itens: rows };
  });
}
