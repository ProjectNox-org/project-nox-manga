# Plano de implementação — migração SvelteKit → Astro

Branch: `feat/astro-frontend` (base `02cb14e`). Alvo: `frontend/` (Astro 5 SSR, adapter-node standalone), sem dependência de Svelte nem de bindings de Worker, consumindo a API Fastify na VPS (`/api/*`) e o gateway de mídia (`/midia/*`).

## Objetivo
Portar as 29 rotas e os 22 componentes do site SvelteKit original para Astro, preservando design system (`src/app.css`, 1.322 linhas), estrutura de classes, responsividade e funcionalidades, com fidelidade visual comprovada por medição e screenshots.

## Etapas
1. Base: `Base.astro` com `Header`, `footer.site-footer`, `nav.mobile-bottom`, `XpProgressionToast`, import de `app.css` e `components.css`.
2. Home: `HeroCarousel` (backdrop + hero-container + barra cinematográfica), `WorkShelf` (novas obras, mais lidos), `RecentReleases` (15 lançamentos), `ParticleBackground`.
3. Catálogo: grade de 5 colunas com 256 px, capa 254×362, 20 itens por página, filtros por tipo/status/ordenação.
4. Obra: backdrop, breadcrumb, hero com capa/título/avaliação/ações, especificações, lista de capítulos, comentários, denúncia, age gate.
5. Leitor: páginas por `media_id`, `ReadingProgressBar`, `ReaderSettingsModal` (largura/tema/ajuste), navegação prev/next.
6. Conta: entrar, cadastro, recuperar, perfil, biblioteca, favoritos, histórico, notificações, gamificação.
7. Conteúdo: ranking + hall da fama, loja, lançamentos, institucionais, perfil público, convite, scans, admin (12 páginas), 404 e sitemaps.
8. Integração: proxy `pages/api/[...path].ts` e `pages/midia/[id].ts` para funcionar em staging sem nginx; em produção o nginx entrega `/api/` e `/midia/` ao Fastify.
9. Guards: cookie `nox-auth-token` com redirect 302 em 17 páginas privadas.
10. Testes: `tests/app.test.mjs` (páginas essenciais, componentes, ausência de Svelte, guards) via `npm test`.

## Critérios de aceite
- `npm test` verde e `npm run build` com `Complete!`, gerando `dist/server/entry.mjs`.
- Zero imports de `svelte`/`@sveltejs/kit` no app novo.
- Rotas públicas 200 e privadas 302 para anônimo, 200 autenticado (validado no staging `127.0.0.1:4331`).
- Fidelidade visual medida a 1440×900: home 2961 (Astro 2779), catálogo 2851 (2723), obra 3731 (3655), com capas, cards e tipografia equivalentes.
- Playwright nos três viewports sem `pageerror`, imagens carregando via `/midia`.

## Fora de escopo
Publicação em produção e merge na `main` (dependem de aprovação do proprietário). O SvelteKit legado permanece intocado como referência.
