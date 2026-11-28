-- CONSOLIDACAO MANUAL (nao versionar em supabase/migrations: exige aprovacao explicita)
-- 1) remove capitulos stub (0 paginas) que duplicam um irmao com paginas
-- 2) remove duplicatas com paginas identicas (mesmo media_id por posicao)
-- 3) normaliza rotulos inteiros .0+ que ficaram sem irmao
-- Idempotente: usa chapter_redirects como marcador e backups *_bak_20261128.
-- Executar: psql -v ON_ERROR_STOP=1 -f este_arquivo (BEGIN/COMMIT no proprio script).

\set ON_ERROR_STOP on
BEGIN;
\set ON_ERROR_STOP on

create table if not exists public.chapter_redirects (
  old_id uuid primary key,
  new_id uuid not null,
  reason text not null default 'legacy_duplicate',
  created_at timestamptz not null default now()
);

create table if not exists public.chapters_consolidation_bak_20261128 (
  like public.chapters including defaults,
  bak_reason text,
  bak_new_id uuid,
  bak_at timestamptz default now()
);

create temp table _pairs on commit drop as
with base as (
  select c.id, c.work_id, c.display_number, c.canonical_chapter_key,
         regexp_replace(c.display_number,'\.0+$','') as norm
  from public.chapters c where c.display_number ~ '^[0-9]'
), grp as (
  select work_id, norm from base group by 1,2
  having count(*) = 2 and count(*) filter (where display_number ~ '\.0+$') = 1
), pair as (
  select b.id, b.work_id, b.norm, b.display_number, b.canonical_chapter_key,
         (select count(*) from public.pages p where p.chapter_id=b.id) as npages
  from base b join grp g on g.work_id=b.work_id and g.norm=b.norm
)
select s.id as stub_id, r.id as keep_id
from pair s join pair r on r.work_id = s.work_id and r.norm = s.norm and r.id <> s.id
where s.npages = 0 and r.npages > 0
  and not exists (select 1 from public.chapter_redirects cr where cr.old_id = s.id);

do $$
declare bad int;
begin
  select count(*) into bad from _pairs p where exists (
    select 1 from public.reading r where r.chapter_id=p.stub_id
    union all select 1 from public.chapter_views v where v.chapter_id=p.stub_id
    union all select 1 from public.chapter_reactions cr where cr.chapter_id=p.stub_id
    union all select 1 from public.comments c where c.chapter_id=p.stub_id
    union all select 1 from public.xp_awards x where x.chapter_id=p.stub_id
    union all select 1 from public.media m where m.chapter_id=p.stub_id
    union all select 1 from public.reports rp where rp.chapter_id=p.stub_id
    union all select 1 from public.chapter_scans cs where cs.chapter_id=p.stub_id
    union all select 1 from public.importer_chapter_mappings ic where ic.chapter_id=p.stub_id
    union all select 1 from public.upload_sessions us where us.chapter_id=p.stub_id
    union all select 1 from public.reading_sessions rs where rs.chapter_id=p.stub_id
  );
  if bad > 0 then raise exception 'ABORTADO: % stubs possuem referencias', bad; end if;
end $$;

insert into public.chapters_consolidation_bak_20261128
select c.*, 'stub_legacy_duplicate', p.keep_id, now()
from public.chapters c join _pairs p on p.stub_id = c.id
where not exists (select 1 from public.chapters_consolidation_bak_20261128 b where b.id = c.id);

insert into public.chapter_redirects (old_id, new_id, reason)
select stub_id, keep_id, 'legacy_stub_duplicate' from _pairs
on conflict (old_id) do nothing;

delete from public.chapters c using _pairs p where c.id = p.stub_id;

select count(*) as stubs_removidos from public.chapter_redirects where reason='legacy_stub_duplicate';

\set ON_ERROR_STOP on

create table if not exists public.chapter_redirects (
  old_id uuid primary key,
  new_id uuid not null,
  reason text not null default 'legacy_duplicate',
  created_at timestamptz not null default now()
);
create table if not exists public.chapters_consolidation_bak_20261128 (
  like public.chapters including defaults,
  bak_reason text, bak_new_id uuid, bak_at timestamptz default now()
);
create table if not exists public.pages_consolidation_bak_20261128 (
  like public.pages including defaults,
  bak_chapter_id uuid, bak_new_chapter_id uuid, bak_at timestamptz default now()
);

-- todos os ids envolvidos em colisao de rotulo inteiro
create temp table _coll on commit preserve rows as
with base as (
  select c.id, c.work_id, c.display_number, c.canonical_chapter_key,
         regexp_replace(c.display_number,'\.0+$','') as norm
  from public.chapters c where c.display_number ~ '^[0-9]'
), grp as (
  select work_id, norm from base group by 1,2
  having count(*) > 1 and count(*) filter (where display_number ~ '\.0+$') > 0
)
select b.id, b.work_id, b.norm, b.display_number, b.canonical_chapter_key, cnt.n
from base b join grp g on g.work_id=b.work_id and g.norm=b.norm
join lateral (select count(*) as n from base b2 where b2.work_id=b.work_id and b2.norm=b.norm) cnt on true;

create index on _coll (id);

-- paginas e assinatura por capitulo (so para os capitulos em colisao)
create temp table _sig on commit preserve rows as
select c.id,
       count(p.position) as npages,
       md5(coalesce(string_agg(p.media_id::text, ',' order by p.position), '')) as msig
from _coll c left join public.pages p on p.chapter_id = c.id
group by c.id;

-- pares consolidaveis: exatamente 2 capitulos, um rotulo .0+, paginas identicas (mesmo media_id por posicao)
create temp table _pairs on commit preserve rows as
select d.id as dup_id, k.id as keep_id, d.work_id, d.norm
from _coll d
join _coll k on k.work_id = d.work_id and k.norm = d.norm and k.id <> d.id
join _sig sd on sd.id = d.id
join _sig sk on sk.id = k.id
where d.n = 2
  and d.display_number ~ '\.0+$'
  and sd.npages > 0 and sd.npages = sk.npages and sd.msig = sk.msig
  and not exists (select 1 from public.chapter_redirects r where r.old_id = d.id);

-- guarda: nenhuma referencia nos capitulos a remover
do $$
declare bad int;
begin
  select count(*) into bad from _pairs p where exists (
    select 1 from public.reading r where r.chapter_id=p.dup_id
    union all select 1 from public.chapter_views v where v.chapter_id=p.dup_id
    union all select 1 from public.chapter_reactions c where c.chapter_id=p.dup_id
    union all select 1 from public.comments c where c.chapter_id=p.dup_id
    union all select 1 from public.xp_awards x where x.chapter_id=p.dup_id
    union all select 1 from public.reading_sessions s where s.chapter_id=p.dup_id
    union all select 1 from public.reports r where r.chapter_id=p.dup_id
    union all select 1 from public.chapter_scans c where c.chapter_id=p.dup_id
    union all select 1 from public.upload_sessions u where u.chapter_id=p.dup_id
  );
  if bad > 0 then raise exception 'ABORTADO: % duplicatas possuem referencias', bad; end if;
end $$;

insert into public.chapters_consolidation_bak_20261128
select c.*, 'identical_pages', p.keep_id, now()
from public.chapters c join _pairs p on p.dup_id = c.id
where not exists (select 1 from public.chapters_consolidation_bak_20261128 b where b.id=c.id);

insert into public.pages_consolidation_bak_20261128
select pg.*, pg.chapter_id, p.keep_id, now()
from public.pages pg join _pairs p on p.dup_id = pg.chapter_id
where not exists (
  select 1 from public.pages_consolidation_bak_20261128 b
  where b.chapter_id=b.bak_chapter_id and b.position=pg.position and b.bak_chapter_id=pg.chapter_id
);

insert into public.chapter_redirects (old_id, new_id, reason)
select dup_id, keep_id, 'identical_pages' from _pairs
on conflict (old_id) do nothing;

delete from public.pages pg using _pairs p where pg.chapter_id = p.dup_id;
delete from public.chapters c using _pairs p where c.id = p.dup_id;

select 'pares_consolidados' as k, count(*)::text as v from public.chapter_redirects where reason='identical_pages'
union all select 'chapters_bak', count(*)::text from public.chapters_consolidation_bak_20261128
union all select 'pages_bak', count(*)::text from public.pages_consolidation_bak_20261128
union all select 'dot00_restantes', count(*)::text from public.chapters where display_number ~ '\.0+$';
-- 3) rotulos .00 que ficaram sem irmao apos a consolidacao: normalizacao segura
create table if not exists public.chapters_display_bak_20261128_after as
select c.id, c.work_id, c.display_number, now() as bak_at
from public.chapters c where false;

with alvo as (
  select c.id, c.work_id, regexp_replace(c.display_number,'\.0+$','') as norm
  from public.chapters c
  where c.display_number ~ '^[0-9]+\.0+$'
    and c.canonical_chapter_key like 'legacy:%'
    and not exists (
      select 1 from public.chapters o
      where o.work_id = c.work_id and o.id <> c.id
        and regexp_replace(o.display_number,'\.0+$','') = regexp_replace(c.display_number,'\.0+$','')
        and o.display_number ~ '^[0-9]'
    )
), ins as (
  insert into public.chapters_display_bak_20261128_after (id, work_id, display_number, bak_at)
  select c.id, c.work_id, c.display_number, now() from public.chapters c join alvo a on a.id=c.id
  where not exists (select 1 from public.chapters_display_bak_20261128_after x where x.id=c.id)
  returning id
)
update public.chapters c set display_number = a.norm from alvo a where c.id = a.id;

select 'stubs' as k, count(*)::text as v from public.chapter_redirects where reason='legacy_stub_duplicate'
union all select 'identicos', count(*)::text from public.chapter_redirects where reason='identical_pages'
union all select 'chapters_bak', count(*)::text from public.chapters_consolidation_bak_20261128
union all select 'pages_bak', count(*)::text from public.pages_consolidation_bak_20261128
union all select 'dot00_restantes', count(*)::text from public.chapters where display_number ~ '\.0+$'
union all select 'obras_dot00', count(distinct work_id)::text from public.chapters where display_number ~ '\.0+$';
COMMIT;
