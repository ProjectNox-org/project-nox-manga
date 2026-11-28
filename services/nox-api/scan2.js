
import { buildWorkSearchCondition } from './search-helper.js';

export default async function scan2Routes(app, pool) {
  async function usuario(req) {
    const tok = req.cookies?.['nox-auth-token'];
    if (!tok) return null;
    const { rows } = await pool.query(
      `SELECT u.id, u.email FROM public.api_session s JOIN auth.users u ON u.id = s.user_id
        WHERE s.token = $1 AND s.expires_at > now() LIMIT 1`, [tok]);
    return rows[0] || null;
  }
  async function papel(uid) {
    if (!uid) return null;
    const { rows } = await pool.query(
      `SELECT role FROM public.access_roles WHERE user_id = $1 AND COALESCE(suspended,false) = false LIMIT 1`, [uid]);
    return rows[0]?.role || null;
  }
  const GESTAO = ['ADMIN', 'STAFF_SITE', 'EDITOR', 'GERENTE'];

  app.get('/api/scan/works/search', async (req, reply) => {
    const u = await usuario(req);
    if (!u) return reply.code(401).send({ erro: 'sem_sessao' });
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return reply.code(400).send({ erro: 'busca_curta' });
    const s = buildWorkSearchCondition('', q, 1);
    const { rows } = await pool.query(
      `SELECT id, slug, title, kind, status FROM public.works
        WHERE ${s.clause} ORDER BY title LIMIT 20`, s.params);
    return { ok: true, total: rows.length, itens: rows };
  });

  app.post('/api/scan/cadastrar', async (req, reply) => {
    const u = await usuario(req);
    if (!u) return reply.code(401).send({ erro: 'sem_sessao' });
    const p = await papel(u.id);
    if (!GESTAO.includes(p)) return reply.code(403).send({ erro: 'sem_permissao' });
    const nome = String(req.body?.name || '').trim();
    if (nome.length < 3) return reply.code(400).send({ erro: 'nome_invalido' });
    const desc = String(req.body?.description || '').slice(0, 500);
    const base = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'scan';
    const { rows } = await pool.query(
      `INSERT INTO public.scans (id, name, slug, description, status, is_official, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE', false, now(), now()) RETURNING id, name, slug`,
      [nome, base + '-' + Math.random().toString(36).slice(2, 6), desc]);
    return reply.code(201).send({ ok: true, scan: rows[0] });
  });

  app.get('/api/scan/module', async (req, reply) => {
    const sid = String(req.query.scan_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(sid)) return reply.code(400).send({ erro: 'scan_invalido' });
    const etapa = req.query.stage ? String(req.query.stage) : null;
    const { rows } = await pool.query(
      `SELECT c.id, c.chapter_number, c.chapter_label, c.status, c.current_stage_slug, c.priority,
              w.slug AS obra_slug, w.title AS obra_titulo
         FROM public.scan_production_chapters c LEFT JOIN public.works w ON w.id = c.work_id
        WHERE c.scan_id = $1 AND ($2::text IS NULL OR c.current_stage_slug = $2::text)
        ORDER BY c.priority DESC NULLS LAST, c.updated_at DESC LIMIT 200`, [sid, etapa]);
    return { ok: true, total: rows.length, itens: rows };
  });

  app.post('/api/scan/pipeline/seen', async (req, reply) => {
    const u = await usuario(req);
    if (!u) return reply.code(401).send({ erro: 'sem_sessao' });
    const sid = String(req.body?.scan_id || '');
    const cap = String(req.body?.production_chapter_id || '');
    const etapa = String(req.body?.stage_slug || '');
    if (!/^[0-9a-f-]{36}$/i.test(sid) || !/^[0-9a-f-]{36}$/i.test(cap) || !etapa)
      return reply.code(400).send({ erro: 'dados_invalidos' });
    const { rows } = await pool.query(
      `INSERT INTO public.scan_pipeline_stage_seen
         (id, user_id, scan_id, production_chapter_id, chapter_stage_id, stage_slug, availability_version, seen_at)
       VALUES (gen_random_uuid(), $1, $2, COALESCE($5::uuid, gen_random_uuid()), $3, $4, 1, now())
       ON CONFLICT DO NOTHING RETURNING id`,
      [u.id, sid, cap, etapa, /^[0-9a-f-]{36}$/i.test(String(req.body?.chapter_stage_id || '')) ? req.body.chapter_stage_id : null]);
    return { ok: true, registrado: rows.length > 0 };
  });

  app.get('/api/scan/attachments', async (req, reply) => {
    const u = await usuario(req);
    if (!u) return reply.code(401).send({ erro: 'sem_sessao' });
    const sid = String(req.query.scan_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(sid)) return reply.code(400).send({ erro: 'scan_invalido' });
    const { rows } = await pool.query(
      `SELECT id, context_type, context_id, original_filename, mime_type, size, storage_provider, created_at
         FROM public.scan_attachments WHERE scan_id = $1 ORDER BY created_at DESC LIMIT 100`, [sid]);
    return { ok: true, total: rows.length, itens: rows };
  });

  app.get('/api/scan/production/files/:id', async (_req, reply) => reply.code(503).send({ erro: 'midia_sem_credencial' }));
  app.post('/api/scan/production/upload', async (_req, reply) => reply.code(503).send({ erro: 'midia_sem_credencial' }));
  app.post('/api/scan/attachments/upload', async (_req, reply) => reply.code(503).send({ erro: 'midia_sem_credencial' }));
}
