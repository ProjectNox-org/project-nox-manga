import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/routes/ler/[id]/+page.server.ts', import.meta.url), 'utf8');

describe('legacy chapter redirect', () => {
  it('imports redirect from @sveltejs/kit', () => {
    expect(src).toContain("import { error, redirect } from '@sveltejs/kit';");
  });

  it('consults chapter_redirects before failing with 404', () => {
    const query = src.indexOf('SELECT new_id FROM public.chapter_redirects');
    const notFound = src.indexOf("if (!chapter) error(404, 'Capítulo indisponível');");
    expect(query).toBeGreaterThan(-1);
    expect(notFound).toBeGreaterThan(-1);
    expect(query).toBeLessThan(notFound);
    expect(src).toContain('redirect(301, `/ler/${redirectTo}`)');
  });
});
