import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildWorkSearchCondition,
  buildWorkSearchRelevanceOrder,
  foldAccents,
} from '../services/nox-api/search-helper.js';

describe('Universal work title & alias search', () => {
  it('folds Portuguese diacritics identically to public.index_work_search()', () => {
    expect(foldAccents('O Começo Depois do Fim')).toBe('o comeco depois do fim');
    expect(foldAccents('Nível Único')).toBe('nivel unico');
  });

  it('builds parameterized conditions matching search_text and exact slug', () => {
    const cond = buildWorkSearchCondition('w.', 'O Começo Depois do Fim', 3);
    expect(cond.clause).toBe('(w.search_text ILIKE $3 OR w.search_text ILIKE $4 OR w.slug = $5)');
    expect(cond.params).toEqual([
      '%O Começo Depois do Fim%',
      '%o comeco depois do fim%',
      'o-comeco-depois-do-fim',
    ]);

    const rank = buildWorkSearchRelevanceOrder('w.', 'Solo Leveling', 5);
    expect(rank.params).toEqual(['solo leveling', 'Solo Leveling%', 'solo-leveling']);
    expect(rank.orderPrefix).toContain('lower(w.title) = $5 OR w.slug = $7');
  });

  it('ensures nox-api routes and SvelteKit search endpoints query search_text', () => {
    const catalogJs = readFileSync('services/nox-api/catalog.js', 'utf8');
    const mihonJs = readFileSync('services/nox-api/mihon.js', 'utf8');
    const servicoJs = readFileSync('services/nox-api/servico.js', 'utf8');
    const scan2Js = readFileSync('services/nox-api/scan2.js', 'utf8');
    const adminObras = readFileSync('src/routes/admin/obras/+page.server.ts', 'utf8');
    const importerSearch = readFileSync('src/routes/api/internal/importer/search-candidates/+server.ts', 'utf8');

    expect(catalogJs).toContain('buildWorkSearchCondition');
    expect(catalogJs).toContain('buildWorkSearchRelevanceOrder');
    expect(mihonJs).toContain('buildWorkSearchCondition');
    expect(servicoJs).toContain('buildWorkSearchCondition');
    expect(scan2Js).toContain('buildWorkSearchCondition');
    expect(adminObras).toContain('search_text ILIKE');
    expect(importerSearch).toContain('w.search_text ILIKE');
  });
});
