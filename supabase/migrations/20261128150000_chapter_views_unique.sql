-- Chapter views: uma visualizacao unica por leitor+capitulo (permanente)
-- Aplicado em producao em 2026-11-28: backup de 1025 linhas, 336 duplicatas removidas.
BEGIN;

CREATE TABLE IF NOT EXISTS public.chapter_views_dedup_bak_20261128 AS
  SELECT * FROM public.chapter_views;

DELETE FROM public.chapter_views a
USING public.chapter_views b
WHERE a.id > b.id
  AND a.chapter_id = b.chapter_id
  AND coalesce(a.user_id::text, a.anonymous_hash) = coalesce(b.user_id::text, b.anonymous_hash);

CREATE UNIQUE INDEX IF NOT EXISTS ux_chapter_views_user
  ON public.chapter_views (chapter_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_chapter_views_anon
  ON public.chapter_views (chapter_id, anonymous_hash)
  WHERE user_id IS NULL AND anonymous_hash IS NOT NULL;

UPDATE public.chapters c SET views_total = coalesce(v.n, 0)
FROM (SELECT chapter_id, count(*) AS n FROM public.chapter_views GROUP BY chapter_id) v
WHERE v.chapter_id = c.id;

UPDATE public.works w SET views_total = coalesce(v.n, 0)
FROM (SELECT c.work_id, count(*) AS n FROM public.chapter_views cv JOIN public.chapters c ON c.id = cv.chapter_id GROUP BY c.work_id) v
WHERE v.work_id = w.id;

COMMIT;
