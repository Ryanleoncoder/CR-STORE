
alter table public.produtos add column if not exists favoritos_total int not null default 0;

update public.produtos p
set favoritos_total = (
  select count(*) from public.favoritos f where f.produto_id = p.id
);


create or replace function public.sync_favoritos_total()
returns trigger
language plpgsql
security definer
as $$
begin
  if (tg_op = 'INSERT') then
    update public.produtos set favoritos_total = favoritos_total + 1 where id = new.produto_id;
  elsif (tg_op = 'DELETE') then
    update public.produtos set favoritos_total = greatest(0, favoritos_total - 1) where id = old.produto_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_favoritos_total on public.favoritos;
create trigger trg_favoritos_total
  after insert or delete on public.favoritos
  for each row execute function public.sync_favoritos_total();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'produtos'
  ) then
    alter publication supabase_realtime add table public.produtos;
  end if;
end $$;
