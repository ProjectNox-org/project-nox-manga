import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('reading views hardening', () => {
  const view = read('src/routes/api/chapters/[id]/view/+server.ts');

  it('dedupe e permanente (sem janela de 30 minutos)', () => {
    expect(view).not.toMatch(/interval '30 minutes'/);
  });

  it('insert e idempotente', () => {
    expect(view).toMatch(/ON CONFLICT DO NOTHING/);
  });

  it('so conta capitulo publicado', () => {
    expect(view).toMatch(/published_at IS NOT NULL/);
  });

  it('emite cookie nox-vid quando ausente', () => {
    expect(view).toMatch(/cookies\.set\('nox-vid'/);
  });

  it('hash anonimo nao usa IP', () => {
    expect(view).not.toMatch(/getClientAddress\(\)/);
  });

  it('leitor chama o endpoint de view', () => {
    const reader = read('src/lib/components/Reader.svelte');
    expect(reader).toMatch(/\/api\/chapters\/' \+ data\.chapter\.id \+ '\/view'/);
  });

  it('migration cria indices unicos parciais', () => {
    const mig = read('supabase/migrations/20261128150000_chapter_views_unique.sql');
    expect(mig).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS ux_chapter_views_user/);
    expect(mig).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS ux_chapter_views_anon/);
  });
});
