-- CR STORE — Campanhas (códigos/links de resgate de CRcoins)


create table if not exists public.campanhas (
  id        uuid        primary key default gen_random_uuid(),
  nome      text        not null,
  tipo      text        not null default 'codigo' check (tipo in ('codigo', 'link')),
  codigo    text        not null unique,
  pontos    integer     not null check (pontos > 0),
  limite    integer,                       -- null = ilimitado
  usos      integer     not null default 0,
  validade  date,                          -- null = sem expiração
  ativo     boolean     not null default true,
  criado_em timestamptz not null default now()
);

alter table public.campanhas enable row level security;

-- admin gerencia tudo (criar/listar/editar)
drop policy if exists "campanhas_admin_all" on public.campanhas;
create policy "campanhas_admin_all"
  on public.campanhas for all
  using (public.tem_cargo('admin'))
  with check (public.tem_cargo('admin'));

-- Criar ou editar campanha (somente admin) -----------------------------
create or replace function public.salvar_campanha(
  p_id       uuid,
  p_nome     text,
  p_tipo     text,
  p_codigo   text,
  p_pontos   integer,
  p_limite   integer,
  p_validade date,
  p_ativo    boolean
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  if not public.tem_cargo('admin') then
    raise exception 'Acesso restrito a administradores';
  end if;

  if p_nome is null or length(trim(p_nome)) = 0 then
    raise exception 'O nome é obrigatório';
  end if;
  if p_codigo is null or length(trim(p_codigo)) = 0 then
    raise exception 'O código é obrigatório';
  end if;

  if p_id is null then
    insert into public.campanhas (nome, tipo, codigo, pontos, limite, validade, ativo)
    values (p_nome, p_tipo, upper(trim(p_codigo)), p_pontos, p_limite, p_validade, p_ativo)
    returning id into v_id;
  else
    update public.campanhas
       set nome = p_nome, tipo = p_tipo, codigo = upper(trim(p_codigo)),
           pontos = p_pontos, limite = p_limite, validade = p_validade, ativo = p_ativo
     where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- Resgatar um código (usuário logado) ----------------------------------
create or replace function public.resgatar_codigo(p_codigo text)
returns integer
language plpgsql
security definer
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_camp       public.campanhas%rowtype;
  v_saldo      integer;
begin
  if v_usuario_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  select * into v_camp
  from public.campanhas
  where upper(codigo) = upper(trim(p_codigo))
  for update;

  if not found then raise exception 'Código inválido'; end if;
  if not v_camp.ativo then raise exception 'Esta campanha não está ativa'; end if;
  if v_camp.validade is not null and v_camp.validade < current_date then
    raise exception 'Este código expirou';
  end if;
  if v_camp.limite is not null and v_camp.usos >= v_camp.limite then
    raise exception 'Este código atingiu o limite de usos';
  end if;

  if exists (
    select 1 from public.codigos_resgatados
    where usuario_id = v_usuario_id and upper(codigo) = upper(v_camp.codigo)
  ) then
    raise exception 'Você já resgatou este código';
  end if;

  select saldo into v_saldo from public.carteiras
  where usuario_id = v_usuario_id for update;
  if not found then raise exception 'Carteira não encontrada'; end if;

  update public.carteiras set saldo = saldo + v_camp.pontos
   where usuario_id = v_usuario_id;

  update public.campanhas set usos = usos + 1 where id = v_camp.id;

  insert into public.codigos_resgatados (usuario_id, codigo, valor_creditado)
  values (v_usuario_id, v_camp.codigo, v_camp.pontos);

  insert into public.transacoes_carteira
    (usuario_id, tipo, valor, saldo_anterior, saldo_posterior, descricao, referencia_id)
  values
    (v_usuario_id, 'resgate_codigo', v_camp.pontos, v_saldo, v_saldo + v_camp.pontos,
     'Resgate: ' || v_camp.nome, v_camp.id);

  return v_camp.pontos;
end;
$$;

revoke execute on function public.salvar_campanha(uuid, text, text, text, integer, integer, date, boolean) from public, anon;
grant execute on function public.salvar_campanha(uuid, text, text, text, integer, integer, date, boolean) to authenticated;
grant execute on function public.resgatar_codigo(text) to authenticated;
