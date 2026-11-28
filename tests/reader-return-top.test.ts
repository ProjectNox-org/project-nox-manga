import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const obra = readFileSync('src/routes/obra/[slug]/+page.svelte', 'utf8');
const reader = readFileSync('src/lib/components/Reader.svelte', 'utf8');

describe('retorno do leitor para a obra', () => {
  it('o leitor marca a obra de origem para o retorno', () => {
    expect(reader).toContain("sessionStorage.setItem('nox:from-reader', data.chapter.work_id)");
  });

  it('a obra fixa o topo apenas quando vem do leitor e nao ha hash', () => {
    expect(obra).toContain("sessionStorage.getItem('nox:from-reader')");
    expect(obra).toContain("!window.location.hash");
    expect(obra).toContain('performance.now() - startedAt < 1600');
    expect(obra).toContain("for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const)");
  });
});
