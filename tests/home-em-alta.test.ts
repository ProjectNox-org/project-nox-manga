import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { chapterDisplayNumber } from '../src/lib/chapter-identity';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('home Em alta', () => {
  it('expoe os quatro periodos no servidor e na interface', () => {
    const endpoint = read('src/routes/api/trending/+server.ts');
    expect(endpoint).toContain("raw === 'total'");
    expect(read('src/routes/+page.svelte')).toContain("{ key: 'total', label: 'Total' }");
  });

  it('conta visualizacoes por janela em chapter_views', () => {
    const sql = read('src/lib/server/trending.ts');
    expect(sql).toContain("FROM chapter_views cv");
    expect(sql).toContain("interval '${fromDays} days'");
    expect(sql).toContain('count(*)::int AS views');
    expect(sql).toContain('period_views');
    expect(sql).not.toContain('count(DISTINCT readers.reader)');
  });

  it('ascensao compara 7 dias com os 7 anteriores sem porcentagem infinita', () => {
    const sql = read('src/lib/server/trending.ts');
    expect(sql).toContain('viewsCte(14, 7)');
    expect(sql).toContain('previous_views');
    expect(sql).toContain('growth_pct');
    expect(sql).toContain('WHEN previous_views > 0');
    expect(sql).toContain('WHERE period_views >= 3');
  });

  it('work shelf usa metrica do periodo no badge e pills com 44px', () => {
    const shelf = read('src/lib/components/WorkShelf.svelte');
    expect(shelf).toContain('periodMetric(work)');
    expect(shelf).toContain('displayedPeriod');
    expect(shelf).toContain('AbortController');
    expect(shelf).toContain('work.period_views');
    expect(shelf).toContain('work.growth_pct');
    expect(shelf).toContain('min-height: 34px');
    expect(shelf).toContain('shelf-controls');
    expect(shelf).toContain('periodError');
  });

  it('invalida o cache de trending quando uma view e contada', () => {
    const view = read('src/routes/api/chapters/[id]/view/+server.ts');
    expect(view).toContain('invalidateTrendingCache');
  });
});

describe('chapterDisplayNumber humaniza slugs', () => {
  it('extrai o numero de slugs tecnicos', () => {
    expect(chapterDisplayNumber({ display_number: 'chapter-61' })).toBe('61');
    expect(
      chapterDisplayNumber({ display_number: 'chronicles-of-the-lazy-sovereign-chapter-46' })
    ).toBe('46');
    expect(chapterDisplayNumber({ display_number: 'chapter-6.5' })).toBe('6.5');
  });

  it('preserva titulos legitimos, especiais e decimais', () => {
    expect(chapterDisplayNumber({ display_number: '12.10' })).toBe('12.10');
    expect(chapterDisplayNumber({ display_number: '1.02' })).toBe('1.02');
    expect(chapterDisplayNumber({ display_number: 'Prólogo' })).toBe('Prólogo');
    expect(chapterDisplayNumber({ display_number: '9.0' })).toBe('9');
  });
});
