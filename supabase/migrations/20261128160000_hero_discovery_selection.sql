-- Hero discovery: one shared selection per rotation slot (all workers agree).
BEGIN;

CREATE TABLE IF NOT EXISTS public.hero_discovery_selection (
  rotation_slot bigint NOT NULL,
  adult_allowed boolean NOT NULL,
  work_ids uuid[] NOT NULL CHECK (cardinality(work_ids) BETWEEN 1 AND 10),
  selected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rotation_slot, adult_allowed)
);

CREATE INDEX IF NOT EXISTS hero_discovery_selection_selected_idx
  ON public.hero_discovery_selection (selected_at DESC);

DO $$
BEGIN
  IF to_regrole('nox_app') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.hero_discovery_selection TO nox_app';
  END IF;
  IF to_regrole('nox_readonly') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.hero_discovery_selection TO nox_readonly';
  END IF;
  IF to_regrole('nox_importer') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.hero_discovery_selection TO nox_importer';
  END IF;
END $$;

COMMIT;
