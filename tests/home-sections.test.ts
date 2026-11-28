import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('home sections', () => {
  it('Novas Obras orders by immutable first_published_at, never updated_at', () => {
    const yb = read('src/lib/server/yugabyte.ts');
    expect(yb).toContain('ORDER BY first_published_at DESC, id DESC');
    const homeFetcher = yb.slice(yb.indexOf('export async function fetchHomeWorksFromYugabyte'), yb.indexOf('export async function fetchMostReadFromYugabyte'));
    expect(homeFetcher).not.toContain('updated_at DESC');
  });

  it('migration adds immutable first_published_at with backfill and trigger', () => {
    const sql = read('supabase/migrations/20261128170000_works_first_published_at.sql');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS first_published_at');
    expect(sql).toContain('COALESCE(first_published_at, created_at)');
    expect(sql).toContain('works_preserve_first_published');
    expect(sql).toContain('idx_works_first_published');
  });

  it('Em alta uses unique readers from reading and chapter_views windows', () => {
    const t = read('src/lib/server/trending.ts');
    expect(t).toContain('readersCte(7, 0)');
    expect(t).toContain('readersCte(14, 7)');
    expect(t).toContain("period === 'month' ? 30 : 7");
    expect(t).toContain('readersCte(days, 0)');
    expect(t).toMatch(/count\(DISTINCT reader\)/i);
    expect(t).toContain('previous_readers');
    expect(t).not.toContain('views_total DESC\n       LIMIT');
  });

  it('home renders Em alta with three filters and no Mais Lidos', () => {
    const page = read('src/routes/+page.svelte');
    expect(page).toContain('title="Em alta"');
    expect(page).not.toContain('title="Mais Lidos"');
    expect(page).toContain("label: 'Semana'");
    expect(page).toContain("label: 'Em ascensão'");
    expect(page).toContain("label: 'Mês'");
    expect(page).toContain('endpoint="/api/trending"');
  });

  it('shelf exposes accessible period filters with aria-pressed', () => {
    const shelf = read('src/lib/components/WorkShelf.svelte');
    expect(shelf).toContain('aria-pressed={activePeriod === period.key}');
    expect(shelf).toContain('selectPeriod(period.key)');
    expect(shelf).toContain('${endpoint}?period=');
    expect(shelf).toContain("role=\"group\"");
  });

  it('continue cards keep uniform height and two-line clamped title', () => {
    const page = read('src/routes/+page.svelte');
    expect(page).toMatch(/\.continue-card \{[^}]*height: 116px/s);
    expect(page).toMatch(/\.continue-work-title \{[^}]*line-clamp: 2/s);
    expect(page).toMatch(/\.continue-work-title \{[^}]*min-height: 2\.6em/s);
  });
});
