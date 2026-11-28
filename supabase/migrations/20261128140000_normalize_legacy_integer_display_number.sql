-- Normaliza rotulos legados de capitulos inteiros ("1.00" -> "1").
-- Seguro e idempotente: so toca display_number de linhas com chave legada,
-- cujo valor e um inteiro com zeros a direita e que NAO possui irmao com o
-- mesmo numero ja normalizado (esses casos sao duplicatas/colisoes e exigem
-- revisao manual, nao conversao automatica). Fracionarios reais (1.5, 1.02,
-- 12.10, 3.50) e especiais textuais ficam intactos.
BEGIN;

UPDATE public.chapters c
SET display_number = regexp_replace(c.display_number, '\.0+$', '')
WHERE c.canonical_chapter_key LIKE 'legacy:%'
  AND c.display_number ~ '^[0-9]+\.0+$'
  AND NOT EXISTS (
    SELECT 1 FROM public.chapters s
    WHERE s.work_id = c.work_id
      AND s.id <> c.id
      AND s.display_number = regexp_replace(c.display_number, '\.0+$', '')
  );

COMMIT;
