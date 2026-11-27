import test from 'node:test';
import assert from 'node:assert';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const P = (f) => join(process.cwd(), f);

test('paginas essenciais existem', () => {
  const req = ['src/pages/index.astro','src/pages/catalogo.astro','src/pages/entrar.astro',
    'src/pages/cadastro.astro','src/pages/biblioteca.astro','src/pages/historico.astro',
    'src/pages/favoritos.astro','src/pages/perfil.astro','src/pages/loja.astro',
    'src/pages/ranking.astro','src/pages/notificacoes.astro','src/pages/obra/[slug].astro',
    'src/pages/ler/[id].astro','src/pages/admin/index.astro','src/pages/404.astro'];
  for (const f of req) assert.ok(existsSync(P(f)), 'faltando ' + f);
});

test('componentes portados existem', () => {
  const dir = P('src/components');
  const n = readdirSync(dir).filter(f => f.endsWith('.astro')).length;
  assert.ok(n >= 20, 'esperado >=20 componentes, achou ' + n);
  for (const c of ['HeroCarousel','WorkShelf','RecentReleases','Comments','WorkRating','Header'])
    assert.ok(existsSync(join(dir, c + '.astro')), 'faltando componente ' + c);
});

test('nenhuma dependencia de Svelte no app novo', () => {
  const walk = (d) => readdirSync(d).flatMap(f => {
    const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const bad = walk(P('src')).filter(f => /\.(astro|ts|js)$/.test(f))
    .filter(f => /from ['"](svelte|@sveltejs\/kit)/.test(readFileSync(f, 'utf8')));
  assert.deepStrictEqual(bad, [], 'imports de svelte encontrados: ' + bad.join(','));
});

test('paginas privadas possuem guard de sessao', () => {
  const priv = ['src/pages/biblioteca.astro','src/pages/perfil.astro','src/pages/favoritos.astro',
    'src/pages/historico.astro','src/pages/notificacoes.astro','src/pages/gamificacao.astro'];
  for (const f of priv) {
    const s = readFileSync(P(f), 'utf8');
    assert.ok(s.includes('nox-auth-token'), f + ' sem guard');
    assert.ok(s.includes("/entrar"), f + ' sem redirect');
  }
});
