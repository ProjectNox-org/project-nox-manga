
// Autenticacao de servico (Worker -> API da VPS) por HMAC-SHA256 com janela de 60 s.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { buildWorkSearchCondition } from './search-helper.js';

const CONF = '/etc/nox/servico-api.conf';
const JANELA = 60;

function segredo() {
  if (process.env.NOX_SERVICO_SECRET) return String(process.env.NOX_SERVICO_SECRET).trim();
  try {
    const t = fs.readFileSync(CONF, 'utf8');
    const m = t.match(/^NOX_SERVICO_SECRET=(.+)$/m);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

export function assinar(secret, ts, metodo, caminho) {
  return crypto.createHmac('sha256', secret).update(`${ts}.${metodo}.${caminho}`).digest('hex');
}

function autorizado(req) {
  const s = segredo();
  if (!s) return { ok: false, motivo: 'servico_nao_configurado' };
  const ts = String(req.headers['x-nox-ts'] || '');
  const sig = String(req.headers['x-nox-sign'] || '');
  if (!/^\d{10,11}$/.test(ts) || !/^[0-9a-f]{64}$/.test(sig)) return { ok: false, motivo: 'assinatura_ausente' };
  if (Math.abs(Date.now() / 1000 - Number(ts)) > JANELA) return { ok: false, motivo: 'timestamp_fora_da_janela' };
  const esperado = assinar(s, ts, req.method, req.url.split('?')[0]);
  const a = Buffer.from(esperado, 'hex'), b = Buffer.from(sig, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, motivo: 'assinatura_invalida' };
  return { ok: true };
}

export default async function servicoRoutes(app, pool) {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/servico/')) return;
    const r = autorizado(req);
    if (!r.ok) return reply.code(401).send({ ok: false, erro: r.motivo });
  });

  app.get('/api/servico/health', async () => {
    const { rows } = await pool.query('SELECT count(*)::int AS obras FROM public.works');
    return { ok: true, papel: 'servico', obras: rows[0].obras };
  });

  app.get('/api/servico/obras', async (req) => {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const s = buildWorkSearchCondition('', q, 1);
    const where = s.clause ? `WHERE ${s.clause}` : '';
    const params = s.clause ? [...s.params, limit] : [limit];
    const limitParam = `$${params.length}`;
    const { rows } = await pool.query(
      `SELECT slug, title, kind::text AS kind, status::text AS status, updated_at
         FROM public.works
        ${where}
        ORDER BY updated_at DESC NULLS LAST
        LIMIT ${limitParam}`,
      params
    );
    return { ok: true, itens: rows };
  });

  app.get('/api/servico/capitulo/:id', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.number, c.display_number, c.title,
              w.slug AS obra_slug, w.title AS obra_titulo,
              (SELECT count(*)::int FROM public.pages p WHERE p.chapter_id = c.id) AS paginas
         FROM public.chapters c JOIN public.works w ON w.id = c.work_id
        WHERE c.id = $1 LIMIT 1`,
      [req.params.id]
    );
    if (!rows[0]) return reply.code(404).send({ ok: false, erro: 'capitulo_nao_encontrado' });
    return { ok: true, capitulo: rows[0] };
  });
}
