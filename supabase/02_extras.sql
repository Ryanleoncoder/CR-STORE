
-- CR STORE — Extras (favoritos, bucket de imagens, seed de produtos)

-- FAVORITOS
create table if not exists public.favoritos (
  id         uuid        primary key default gen_random_uuid(),
  usuario_id uuid        not null references public.usuarios(id) on delete cascade,
  produto_id uuid        not null references public.produtos(id) on delete cascade,
  criado_em  timestamptz not null default now(),
  unique (usuario_id, produto_id)
);

create index if not exists idx_favoritos_produto on public.favoritos (produto_id);

alter table public.favoritos enable row level security;

drop policy if exists "favoritos_select_own" on public.favoritos;
create policy "favoritos_select_own"
  on public.favoritos for select
  using (auth.uid() = usuario_id);

drop policy if exists "favoritos_insert_own" on public.favoritos;
create policy "favoritos_insert_own"
  on public.favoritos for insert
  with check (auth.uid() = usuario_id);

drop policy if exists "favoritos_delete_own" on public.favoritos;
create policy "favoritos_delete_own"
  on public.favoritos for delete
  using (auth.uid() = usuario_id);

-- Contagem pública de favoritos por produto (sem expor quem favoritou)
create or replace view public.produtos_favoritos as
  select produto_id, count(*)::int as total
  from public.favoritos
  group by produto_id;


-- STORAGE — imagens de produtos


-- Bucket público: as imagens são lidas via getPublicUrl (sem expiração).
insert into storage.buckets (id, name, public)
values ('produtos', 'produtos', true)
on conflict (id) do update set public = true;

-- leitura pública das imagens dos produtos
drop policy if exists "produtos_img_select" on storage.objects;
create policy "produtos_img_select"
  on storage.objects for select
  using (bucket_id = 'produtos');

-- upload/edição/remoção apenas para admin
drop policy if exists "produtos_img_admin" on storage.objects;
create policy "produtos_img_admin"
  on storage.objects for all
  using (bucket_id = 'produtos' and public.tem_cargo('admin'))
  with check (bucket_id = 'produtos' and public.tem_cargo('admin'));

-- SEED 

insert into public.produtos (nome, descricao, preco, estoque)
select v.nome, v.descricao, v.preco, v.estoque
from (values
  ('Caneca CR',          'Caneca de cerâmica com a marca CR',        120, 30),
  ('Camiseta Retrô',     'Camiseta de algodão, estampa retrô',       250, 20),
  ('Garrafa Térmica',    'Garrafa térmica 500ml',                    300, 15),
  ('Adesivos CR (kit)',  'Cartela de adesivos da equipe',             40, 100),
  ('Boné CR',            'Boné bordado',                             180, 25),
  ('Vale Folga',         'Um dia de folga (sujeito a aprovação)',   1500,  5)
) as v(nome, descricao, preco, estoque)
where not exists (select 1 from public.produtos);
