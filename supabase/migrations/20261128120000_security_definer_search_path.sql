-- Corrige search_path de funcoes SECURITY DEFINER sem configuracao explicita.
-- Ja aplicado em producao (banco `nox`); versionado para reprodutibilidade.
BEGIN;

ALTER FUNCTION public.commit_media_record(uuid, uuid, text, text, text)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.importer_active_connections_count()
  SET search_path = pg_catalog, public;

COMMIT;
