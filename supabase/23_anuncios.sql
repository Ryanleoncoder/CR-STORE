-- CR STORE — Anúncios e Comunicados Gerais

-- Tabela de Anúncios
create table if not exists public.anuncios (
  id              uuid        primary key default gen_random_uuid(),
  titulo          text        not null,
  conteudo        text        not null,           -- Suporta textos longos e HTML básico
  imagem_url      text,                           -- Opcional
  cor_destaque    text        not null default '#6366f1', -- Cor de tema do anúncio
  inicio          timestamptz not null default now(),      -- Prazo de início
  fim             timestamptz,                     -- Prazo de fim (opcional)
  ativo           boolean     not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- Tabela para rastrear quais usuários leram quais anúncios
create table if not exists public.anuncio_leituras (
  usuario_id      uuid        not null references public.usuarios(id) on delete cascade,
  anuncio_id      uuid        not null references public.anuncios(id) on delete cascade,
  lido_em         timestamptz not null default now(),
  primary key (usuario_id, anuncio_id)
);


alter table public.anuncios enable row level security;
alter table public.anuncio_leituras enable row level security;


drop policy if exists "anuncios_select_public" on public.anuncios;
create policy "anuncios_select_public"
  on public.anuncios for select
  to authenticated
  using (ativo = true and inicio <= now() and (fim is null or fim >= now()));

drop policy if exists "anuncios_admin_all" on public.anuncios;
create policy "anuncios_admin_all"
  on public.anuncios for all
  to authenticated
  using (public.tem_cargo('admin'))
  with check (public.tem_cargo('admin'));

-- Políticas de segurança para Leituras
drop policy if exists "leituras_select_own" on public.anuncio_leituras;
create policy "leituras_select_own"
  on public.anuncio_leituras for select
  to authenticated
  using (usuario_id = auth.uid());

drop policy if exists "leituras_insert_own" on public.anuncio_leituras;
create policy "leituras_insert_own"
  on public.anuncio_leituras for insert
  to authenticated
  with check (usuario_id = auth.uid());

drop policy if exists "leituras_update_own" on public.anuncio_leituras;
create policy "leituras_update_own"
  on public.anuncio_leituras for update
  to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());
