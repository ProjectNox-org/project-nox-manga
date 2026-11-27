# Migração SvelteKit → Astro — estado e retomada

Branch: `feat/astro-frontend` (base `02cb14e`)
Produção NÃO publicada a partir desta branch. `main` intocada.

## Feito
- `34cc1fb` base Astro em `frontend/`: `astro.config.mjs` (output server, `@astrojs/node` standalone), `tsconfig.json`,
  `src/styles/app.css` = cópia literal das 1.322 linhas do design system, `public/` copiado de `static/`,
  `src/layouts/Base.astro`.
- `f919da6` `npm install` + `npm run build` RC=0 (`dist/server/entry.mjs`).

## Referência visual obrigatória
`relatorios/frontend-legado-ref/` — 10 PNGs (d-*/m-*), 1440×900 e 390×844, capturados do SvelteKit em 127.0.0.1:4322
(home 2.961 px, catálogo 2.851, obra 3.731, leitor 28.078, entrar 1.181).

## Próximos blocos (ordem)
1. Tokens/utilitários de `app.css` expostos como variáveis + `Base.astro` com header/nav/footer originais.
2. Home: `HeroCarousel` (ilha TS, autoplay/teclado/dots), `ParticleBackground`, `WorkShelf`, `RecentReleases`, `WorkCard`.
3. Catálogo com filtros/pesquisa/paginação; obra e capítulos.
4. Leitor: `Reader`, `ReaderPage`, `ReaderSettingsModal`, `ReadingProgressBar`.
5. Auth (login/cadastro/recuperação), perfil, biblioteca, notificações, loja, convites, admin.
6. Playwright comparativo em 1920/1440/390; corrigir divergências; PR.

## Integração
Consumir `http://127.0.0.1:3000` (`/api/*`, `/midia/*`) via proxy do nginx; nenhuma lógica de auth duplicada;
sem Svelte/SvelteKit, sem bindings de Worker, sem YugabyteDB.

## Retomada
```bash
cd ~/.local/share/opencode/nox-workspace/laboratorios/nox-manga
git switch feat/astro-frontend && git log --oneline -3
cd frontend && npm run build
```
