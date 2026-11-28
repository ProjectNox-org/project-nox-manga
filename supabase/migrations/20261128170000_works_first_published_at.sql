-- Primeira disponibilizacao publica da obra (imutavel apos o insert).
-- Backfill usa created_at, unica evidencia historica confiavel no catalogo atual
-- (importer_publication_events tem apenas 11 eventos e nao cobre o acervo).
BEGIN;
ALTER TABLE public.works ADD COLUMN IF NOT EXISTS first_published_at timestamptz;
UPDATE public.works SET first_published_at = COALESCE(first_published_at, created_at);
ALTER TABLE public.works ALTER COLUMN first_published_at SET DEFAULT now();
ALTER TABLE public.works ALTER COLUMN first_published_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.works_preserve_first_published()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.first_published_at IS DISTINCT FROM OLD.first_published_at THEN
    NEW.first_published_at := OLD.first_published_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS works_preserve_first_published_trg ON public.works;
CREATE TRIGGER works_preserve_first_published_trg
BEFORE UPDATE ON public.works
FOR EACH ROW EXECUTE FUNCTION public.works_preserve_first_published();

CREATE INDEX IF NOT EXISTS idx_works_first_published
  ON public.works (first_published_at DESC, id DESC) WHERE published = true;
COMMIT;
