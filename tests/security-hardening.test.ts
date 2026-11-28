import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p: string) => readFileSync(root + p, 'utf8');
const scan = read('src/routes/scan/+page.server.ts');
const academia = read('src/routes/scan/components/AcademiaTab.svelte');
const kuro = read('src/routes/api/internal/importer/kuro-bridge/+server.ts');
const migration = read('supabase/migrations/20261128120000_security_definer_search_path.sql');
const fastifyPatch = read('security/fastify/server.js.patch');

describe('scan authorization', () => {
  it('saveWorkWorkflowOverride valida membership da scan com SQL parametrizado', () => {
    expect(scan).toContain('SELECT role FROM public.scan_members WHERE scan_id = $1 AND user_id = $2 LIMIT 1');
    expect(scan).not.toMatch(/scan_id =  AND/);
  });
  it('setPreAprovadoFixture exige ADMIN', () => {
    const i = scan.indexOf('setPreAprovadoFixture:');
    expect(i).toBeGreaterThan(-1);
    expect(scan.slice(i, i + 600)).toContain("locals.role !== 'ADMIN'");
  });
});

describe('markdown link scheme', () => {
  it('aceita apenas http/https/mailto e rejeita o replace ingenuo', () => {
    expect(academia).toContain('mailto:');
    expect(academia).not.toContain('.replace(/\\[(.*?)\\]\\((.*?)\\)/g, \'<a href="$2"');
  });
});

describe('kuro-bridge SSRF guard', () => {
  it('valida hostname exato e bloqueia redirects', () => {
    expect(kuro).toContain('target.protocol');
    expect(kuro).toContain("redirect: 'manual'");
    expect(kuro).not.toContain('allowedPrefixes');
  });
});

describe('security definer search_path', () => {
  it('fixa search_path nas duas funcoes', () => {
    expect(migration).toContain('ALTER FUNCTION public.commit_media_record');
    expect(migration).toContain('ALTER FUNCTION public.importer_active_connections_count()');
    expect(migration.match(/SET search_path = pg_catalog, public/g)?.length).toBe(2);
  });
});

describe('fastify token leak patch', () => {
  it('remove reset_token e confirm_token das respostas', () => {
    expect(fastifyPatch).toMatch(/^-.*reset_token/m);
    expect(fastifyPatch).toMatch(/^-.*confirm_token/m);
  });
});
