import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const obraPage = readFileSync('src/routes/obra/[slug]/+page.svelte', 'utf8');
const covers = readFileSync('src/lib/covers.ts', 'utf8');

describe('contadores de visualizacao frescos', () => {
  it('revalida a obra quando a pagina volta do cache de historico', () => {
    expect(obraPage).toContain("window.addEventListener('pageshow', onPageShow)");
    expect(obraPage).toContain('event.persisted');
  });

  it('revalida quando a aba volta a ficar visivel', () => {
    expect(obraPage).toContain("document.addEventListener('visibilitychange', onVisible)");
    expect(obraPage).toContain("document.visibilityState === 'visible'");
  });

  it('usa um unico URL por midia para nao baixar a mesma capa duas vezes', () => {
    expect(covers).toContain('return `/media/${trimmed}?v=3`');
    expect(covers).not.toContain('size=${size}');
  });
});
