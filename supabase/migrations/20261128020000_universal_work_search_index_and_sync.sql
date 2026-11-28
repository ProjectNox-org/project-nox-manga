-- Universal catalog work search across primary PT-BR titles, English titles,
-- multilingual aliases (KO/JA/ZH/Romaji), and accent-folded variants via search_text.
-- Safe to run online; CREATE INDEX CONCURRENTLY must run outside transaction blocks.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_works_search_text_all_trgm
  ON public.works USING gin (search_text gin_trgm_ops);

-- Backfill any stale search_text rows without altering updated_at (preserves optimistic locks).
DO $$
DECLARE
  v_updated int;
BEGIN
  LOOP
    WITH stale AS (
      SELECT w.id,
             CASE
               WHEN translate(lower(COALESCE(w.title, '') || ' ' || array_to_string(COALESCE(w.aliases, ARRAY[]::text[]), ' ')),
                              'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
                    <> lower(COALESCE(w.title, '') || ' ' || array_to_string(COALESCE(w.aliases, ARRAY[]::text[]), ' '))
               THEN (COALESCE(w.title, '') || ' ' || array_to_string(COALESCE(w.aliases, ARRAY[]::text[]), ' '))
                    || ' ' ||
                    translate(lower(COALESCE(w.title, '') || ' ' || array_to_string(COALESCE(w.aliases, ARRAY[]::text[]), ' ')),
                              'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
               ELSE (COALESCE(w.title, '') || ' ' || array_to_string(COALESCE(w.aliases, ARRAY[]::text[]), ' '))
             END AS next_search_text
      FROM public.works w
      WHERE w.search_text IS DISTINCT FROM (
        CASE
          WHEN translate(lower(COALESCE(w.title, '') || ' ' || array_to_string(COALESCE(w.aliases, ARRAY[]::text[]), ' ')),
                         'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
               <> lower(COALESCE(w.title, '') || ' ' || array_to_string(COALESCE(w.aliases, ARRAY[]::text[]), ' '))
          THEN (COALESCE(w.title, '') || ' ' || array_to_string(COALESCE(w.aliases, ARRAY[]::text[]), ' '))
               || ' ' ||
               translate(lower(COALESCE(w.title, '') || ' ' || array_to_string(COALESCE(w.aliases, ARRAY[]::text[]), ' ')),
                         'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
          ELSE (COALESCE(w.title, '') || ' ' || array_to_string(COALESCE(w.aliases, ARRAY[]::text[]), ' '))
        END
      )
      LIMIT 500
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public.works w
       SET search_text = s.next_search_text
      FROM stale s
     WHERE w.id = s.id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    EXIT WHEN v_updated = 0;
  END LOOP;
END $$;
