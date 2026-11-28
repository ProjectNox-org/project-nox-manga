-- Grants para tabelas de consolidacao/redirect de capitulos legados.
-- Idempotente: so concede se a tabela existir.

do $$
declare t text;
begin
  foreach t in array array['chapter_redirects','chapters_consolidation_bak_20261128','pages_consolidation_bak_20261128','media_chapter_repoint_bak_20261128']
  loop
    if to_regclass('public.'||t) is not null then
      execute format('grant select on public.%I to cloud_ro, nox_app, nox_importer, nox_readonly, nox_worker', t);
    end if;
  end loop;
end $$;
