
-- CR STORE — Setup inicial do banco (Supabase / PostgreSQL)


create extension if not exists "pgcrypto";


create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;


-- LOGIN / ACESSO

create table public.whitelist (
  id         uuid        primary key default gen_random_uuid(),
  email      text        not null unique,
  nome       text,
  ativo      boolean     not null default true,
  criado_em  timestamptz not null default now()
);

create table public.usuarios (
  id                        uuid        primary key references auth.users(id) on delete cascade,
  nome                      text,
  username                  text        unique,
  email                     text        not null unique,
  primeiro_acesso_concluido boolean     not null default false,
  ativo                     boolean     not null default true,
  criado_em                 timestamptz not null default now(),
  atualizado_em             timestamptz not null default now()
);

create index idx_usuarios_username on public.usuarios (username);
create index idx_usuarios_email    on public.usuarios (email);

create trigger trg_usuarios_atualizado_em
  before update on public.usuarios
  for each row execute function public.set_atualizado_em();


-- PERMISSÕES / CARGOS

create table public.cargos (
  id     uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome   text not null
);

insert into public.cargos (codigo, nome) values
  ('admin',     'Administrador'),
  ('estoque',   'Repositor de estoque'),
  ('campanhas', 'Criador de campanhas'),
  ('cliente',   'Cliente');

create table public.usuario_cargos (
  id          uuid        primary key default gen_random_uuid(),
  usuario_id  uuid        not null references public.usuarios(id) on delete cascade,
  cargo_id    uuid        not null references public.cargos(id) on delete cascade,
  criado_em   timestamptz not null default now(),
  unique (usuario_id, cargo_id)
);

-- CARTEIRA

create table public.carteiras (
  id            uuid        primary key default gen_random_uuid(),
  usuario_id    uuid        not null unique references public.usuarios(id) on delete cascade,
  saldo         integer     not null default 0 check (saldo >= 0),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger trg_carteiras_atualizado_em
  before update on public.carteiras
  for each row execute function public.set_atualizado_em();

create or replace function public.criar_carteira_para_usuario()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.carteiras (usuario_id)
  values (new.id)
  on conflict (usuario_id) do nothing;
  return new;
end;
$$;

create trigger trg_criar_carteira
  after insert on public.usuarios
  for each row execute function public.criar_carteira_para_usuario();

create table public.transacoes_carteira (
  id              uuid        primary key default gen_random_uuid(),
  usuario_id      uuid        not null references public.usuarios(id) on delete cascade,
  tipo            text        not null check (tipo in (
                                'credito',
                                'debito',
                                'transferencia_enviada',
                                'transferencia_recebida',
                                'compra_loja',
                                'resgate_codigo',
                                'ajuste_admin'
                              )),
  valor           integer     not null,
  saldo_anterior  integer     not null,
  saldo_posterior integer     not null,
  descricao       text,
  referencia_id   uuid,
  criado_em       timestamptz not null default now()
);

create index idx_transacoes_usuario_data
  on public.transacoes_carteira (usuario_id, criado_em desc);

create table public.transferencias_pontos (
  id              uuid        primary key default gen_random_uuid(),
  remetente_id    uuid        not null references public.usuarios(id) on delete set null,
  destinatario_id uuid        not null references public.usuarios(id) on delete set null,
  valor           integer     not null check (valor > 0),
  mensagem        text,
  criado_em       timestamptz not null default now(),
  check (remetente_id <> destinatario_id)
);

create table public.codigos_resgatados (
  id              uuid        primary key default gen_random_uuid(),
  usuario_id      uuid        not null references public.usuarios(id) on delete cascade,
  codigo          text        not null,
  valor_creditado integer,
  resgatado_em    timestamptz not null default now(),
  unique (usuario_id, codigo)
);


-- LOJA


create table public.produtos (
  id            uuid        primary key default gen_random_uuid(),
  nome          text        not null,
  descricao     text,
  preco         integer     not null check (preco >= 0),
  estoque       integer     not null default 0 check (estoque >= 0),
  imagem_url    text,
  ativo         boolean     not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger trg_produtos_atualizado_em
  before update on public.produtos
  for each row execute function public.set_atualizado_em();

create table public.pedidos (
  id          uuid        primary key default gen_random_uuid(),
  usuario_id  uuid        not null references public.usuarios(id),
  status      text        not null default 'pendente' check (
                            status in ('pendente', 'confirmado', 'cancelado', 'entregue')
                          ),
  total       integer     not null check (total >= 0),
  criado_em   timestamptz not null default now()
);

create index idx_pedidos_usuario on public.pedidos (usuario_id, criado_em desc);

create table public.pedido_itens (
  id             uuid    primary key default gen_random_uuid(),
  pedido_id      uuid    not null references public.pedidos(id) on delete cascade,
  produto_id     uuid    not null references public.produtos(id),
  quantidade     integer not null check (quantidade > 0),
  preco_unitario integer not null check (preco_unitario >= 0)
);


-- FUNÇÕES


create or replace function public.tem_cargo(p_codigo text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.usuario_cargos uc
    join public.cargos c on c.id = uc.cargo_id
    where uc.usuario_id = auth.uid()
      and c.codigo = p_codigo
  );
$$;

create or replace function public.registrar_primeiro_acesso()
returns void
language plpgsql
security definer
as $$
declare
  v_email      text;
  v_autorizado boolean;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    raise exception 'Usuário não autenticado';
  end if;

  select exists (
    select 1 from public.whitelist
    where lower(email) = lower(v_email) and ativo = true
  ) into v_autorizado;

  if not v_autorizado then
    raise exception 'E-mail não autorizado';
  end if;

  insert into public.usuarios (id, email, primeiro_acesso_concluido)
  values (auth.uid(), v_email, true)
  on conflict (id) do update set primeiro_acesso_concluido = true;

  insert into public.usuario_cargos (usuario_id, cargo_id)
  select auth.uid(), c.id from public.cargos c where c.codigo = 'cliente'
  on conflict (usuario_id, cargo_id) do nothing;
end;
$$;

create or replace function public.transferir_pontos(
  p_destinatario_id uuid,
  p_valor           integer,
  p_mensagem        text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_remetente_id       uuid := auth.uid();
  v_saldo_remetente    integer;
  v_saldo_destinatario integer;
  v_transferencia_id   uuid;
begin
  if v_remetente_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_valor <= 0 then
    raise exception 'O valor da transferência deve ser positivo';
  end if;

  if v_remetente_id = p_destinatario_id then
    raise exception 'Não é possível transferir para si mesmo';
  end if;

  select saldo into v_saldo_remetente
  from public.carteiras
  where usuario_id = v_remetente_id
  for update;

  if not found then
    raise exception 'Carteira do remetente não encontrada';
  end if;

  if v_saldo_remetente < p_valor then
    raise exception 'Saldo insuficiente';
  end if;

  select saldo into v_saldo_destinatario
  from public.carteiras
  where usuario_id = p_destinatario_id
  for update;

  if not found then
    raise exception 'Carteira do destinatário não encontrada';
  end if;

  update public.carteiras
  set saldo = saldo - p_valor
  where usuario_id = v_remetente_id;

  update public.carteiras
  set saldo = saldo + p_valor
  where usuario_id = p_destinatario_id;

  insert into public.transferencias_pontos (remetente_id, destinatario_id, valor, mensagem)
  values (v_remetente_id, p_destinatario_id, p_valor, p_mensagem)
  returning id into v_transferencia_id;

  insert into public.transacoes_carteira
    (usuario_id, tipo, valor, saldo_anterior, saldo_posterior, descricao, referencia_id)
  values
    (v_remetente_id, 'transferencia_enviada', p_valor,
     v_saldo_remetente, v_saldo_remetente - p_valor, p_mensagem, v_transferencia_id);

  insert into public.transacoes_carteira
    (usuario_id, tipo, valor, saldo_anterior, saldo_posterior, descricao, referencia_id)
  values
    (p_destinatario_id, 'transferencia_recebida', p_valor,
     v_saldo_destinatario, v_saldo_destinatario + p_valor, p_mensagem, v_transferencia_id);

  return v_transferencia_id;
end;
$$;

create or replace function public.comprar_produto(
  p_produto_id uuid,
  p_quantidade integer default 1
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_saldo      integer;
  v_preco      integer;
  v_estoque    integer;
  v_total      integer;
  v_pedido_id  uuid;
begin
  if v_usuario_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_quantidade <= 0 then
    raise exception 'Quantidade deve ser positiva';
  end if;

  select saldo into v_saldo
  from public.carteiras
  where usuario_id = v_usuario_id
  for update;

  if not found then
    raise exception 'Carteira não encontrada';
  end if;

  select preco, estoque into v_preco, v_estoque
  from public.produtos
  where id = p_produto_id and ativo = true
  for update;

  if not found then
    raise exception 'Produto não encontrado ou inativo';
  end if;

  if v_estoque < p_quantidade then
    raise exception 'Estoque insuficiente';
  end if;

  v_total := v_preco * p_quantidade;

  if v_saldo < v_total then
    raise exception 'Saldo insuficiente';
  end if;

  insert into public.pedidos (usuario_id, status, total)
  values (v_usuario_id, 'confirmado', v_total)
  returning id into v_pedido_id;

  insert into public.pedido_itens (pedido_id, produto_id, quantidade, preco_unitario)
  values (v_pedido_id, p_produto_id, p_quantidade, v_preco);

  update public.carteiras
  set saldo = saldo - v_total
  where usuario_id = v_usuario_id;

  update public.produtos
  set estoque = estoque - p_quantidade
  where id = p_produto_id;

  insert into public.transacoes_carteira
    (usuario_id, tipo, valor, saldo_anterior, saldo_posterior, descricao, referencia_id)
  values
    (v_usuario_id, 'compra_loja', v_total, v_saldo, v_saldo - v_total, null, v_pedido_id);

  return v_pedido_id;
end;
$$;

create or replace function public.ajustar_saldo(
  p_usuario_id uuid,
  p_valor      integer,
  p_descricao  text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_saldo integer;
begin
  if not public.tem_cargo('admin') then
    raise exception 'Acesso restrito a administradores';
  end if;

  if p_valor = 0 then
    raise exception 'O valor do ajuste não pode ser zero';
  end if;

  select saldo into v_saldo
  from public.carteiras
  where usuario_id = p_usuario_id
  for update;

  if not found then
    raise exception 'Carteira não encontrada';
  end if;

  if v_saldo + p_valor < 0 then
    raise exception 'O ajuste deixaria o saldo negativo';
  end if;

  update public.carteiras
  set saldo = saldo + p_valor
  where usuario_id = p_usuario_id;

  insert into public.transacoes_carteira
    (usuario_id, tipo, valor, saldo_anterior, saldo_posterior, descricao)
  values
    (p_usuario_id, 'ajuste_admin', p_valor, v_saldo, v_saldo + p_valor, p_descricao);
end;
$$;

-- ROW LEVEL SECURITY

alter table public.whitelist             enable row level security;
alter table public.usuarios               enable row level security;
alter table public.cargos                 enable row level security;
alter table public.usuario_cargos         enable row level security;
alter table public.carteiras              enable row level security;
alter table public.transacoes_carteira    enable row level security;
alter table public.transferencias_pontos  enable row level security;
alter table public.codigos_resgatados     enable row level security;
alter table public.produtos               enable row level security;
alter table public.pedidos                enable row level security;
alter table public.pedido_itens           enable row level security;

-- whitelist: nenhum acesso pelo client (somente backend service_role) ---
create policy "whitelist_sem_acesso_client"
  on public.whitelist for all
  using (false);

-- usuarios: vê o próprio perfil; pode procurar outros para transferir ----
create policy "usuarios_select_own"
  on public.usuarios for select
  using (auth.uid() = id);

create policy "usuarios_select_para_transferir"
  on public.usuarios for select
  using (auth.role() = 'authenticated' and ativo = true);

create policy "usuarios_update_own"
  on public.usuarios for update
  using (auth.uid() = id);

-- cargos: leitura para autenticados ------------------------------------
create policy "cargos_select_autenticado"
  on public.cargos for select
  using (auth.role() = 'authenticated');

-- usuario_cargos: usuário vê os próprios cargos ------------------------
create policy "usuario_cargos_select_own"
  on public.usuario_cargos for select
  using (auth.uid() = usuario_id);

-- carteiras: usuário vê apenas a própria carteira ----------------------
create policy "carteiras_select_own"
  on public.carteiras for select
  using (auth.uid() = usuario_id);

-- transacoes_carteira: usuário vê apenas o próprio extrato -------------
create policy "transacoes_select_own"
  on public.transacoes_carteira for select
  using (auth.uid() = usuario_id);

-- transferencias_pontos: vê as que enviou ou recebeu -------------------
create policy "transferencias_select_own"
  on public.transferencias_pontos for select
  using (auth.uid() = remetente_id or auth.uid() = destinatario_id);

-- codigos_resgatados: usuário vê apenas os seus ------------------------
create policy "codigos_select_own"
  on public.codigos_resgatados for select
  using (auth.uid() = usuario_id);

-- produtos: leitura dos ativos para autenticados -----------------------
create policy "produtos_select_autenticado"
  on public.produtos for select
  using (auth.role() = 'authenticated' and ativo = true);

-- pedidos: usuário vê apenas os próprios -------------------------------
create policy "pedidos_select_own"
  on public.pedidos for select
  using (auth.uid() = usuario_id);

-- pedido_itens: usuário vê itens dos próprios pedidos ------------------
create policy "pedido_itens_select_own"
  on public.pedido_itens for select
  using (
    exists (
      select 1 from public.pedidos p
      where p.id = pedido_id and p.usuario_id = auth.uid()
    )
  );


