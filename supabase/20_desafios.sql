create table if not exists public.campanhas_desafios (
  id              uuid        primary key default gen_random_uuid(),
  nome            text        not null,
  descricao       text,
  banner_url      text,                          
  cor_primaria    text        not null default '#1f1f1f',
  cor_secundaria  text        not null default '#f7c600',
  inicio          timestamptz,                 
  fim             timestamptz,                   
  ativo           boolean     not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

drop trigger if exists trg_campanhas_desafios_atualizado_em on public.campanhas_desafios;

create trigger trg_campanhas_desafios_atualizado_em
  before update on public.campanhas_desafios
  for each row execute function public.set_atualizado_em();



create table if not exists public.desafios (
  id                  uuid        primary key default gen_random_uuid(),
  campanha_id         uuid        not null references public.campanhas_desafios(id) on delete cascade,
  titulo              text        not null,
  descricao           text,
  imagem_url          text,
  tipo                text        not null default 'quiz'
                                  check (tipo in ('quiz', 'verdadeiro_falso', 'multipla_escolha')),
  tempo_segundos      integer,                     
  max_tentativas      integer,                     
  xp_recompensa       integer     not null default 0 check (xp_recompensa >= 0),
  pontos_recompensa   integer     not null default 0 check (pontos_recompensa >= 0),
  ordem               integer     not null default 0,
  ativo               boolean     not null default true,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

create index if not exists idx_desafios_campanha on public.desafios (campanha_id, ordem);

drop trigger if exists trg_desafios_atualizado_em on public.desafios;

create trigger trg_desafios_atualizado_em
  before update on public.desafios
  for each row execute function public.set_atualizado_em();



create table if not exists public.desafio_perguntas (
  id          uuid        primary key default gen_random_uuid(),
  desafio_id  uuid        not null references public.desafios(id) on delete cascade,
  texto       text        not null,
  imagem_url  text,
  ordem       integer     not null default 0
);

create index if not exists idx_perguntas_desafio on public.desafio_perguntas (desafio_id, ordem);



create table if not exists public.desafio_alternativas (
  id           uuid        primary key default gen_random_uuid(),
  pergunta_id  uuid        not null references public.desafio_perguntas(id) on delete cascade,
  texto        text        not null,
  correta      boolean     not null default false,
  ordem        integer     not null default 0
);

create index if not exists idx_alternativas_pergunta on public.desafio_alternativas (pergunta_id, ordem);



create table if not exists public.desafio_participacoes (
  id                    uuid        primary key default gen_random_uuid(),
  usuario_id            uuid        not null references public.usuarios(id) on delete cascade,
  desafio_id            uuid        not null references public.desafios(id) on delete cascade,
  campanha_id           uuid        not null references public.campanhas_desafios(id) on delete cascade,
  acertos               integer     not null default 0,
  total_perguntas       integer     not null default 0,
  pontuacao             integer     not null default 0,  
  xp_ganho              integer     not null default 0,
  pontos_ganhos         integer     not null default 0,
  completado            boolean     not null default false,
  tempo_gasto_segundos  integer,
  tentativa_num         integer     not null default 1,
  criado_em             timestamptz not null default now()
);

create index if not exists idx_participacoes_usuario on public.desafio_participacoes (usuario_id, desafio_id);
create index if not exists idx_participacoes_campanha on public.desafio_participacoes (campanha_id);



drop view if exists public.desafio_alternativas_seguras cascade;

create or replace view public.desafio_alternativas_seguras as
  select id, pergunta_id, texto, ordem
  from public.desafio_alternativas;



alter table public.campanhas_desafios   enable row level security;
alter table public.desafios             enable row level security;
alter table public.desafio_perguntas    enable row level security;
alter table public.desafio_alternativas enable row level security;
alter table public.desafio_participacoes enable row level security;


drop policy if exists "camp_desafios_select_auth" on public.campanhas_desafios;
create policy "camp_desafios_select_auth"
  on public.campanhas_desafios for select
  using (auth.role() = 'authenticated');

drop policy if exists "camp_desafios_admin_all" on public.campanhas_desafios;
create policy "camp_desafios_admin_all"
  on public.campanhas_desafios for all
  using (public.tem_cargo('admin'))
  with check (public.tem_cargo('admin'));


drop policy if exists "desafios_select_auth" on public.desafios;
create policy "desafios_select_auth"
  on public.desafios for select
  using (auth.role() = 'authenticated');

drop policy if exists "desafios_admin_all" on public.desafios;
create policy "desafios_admin_all"
  on public.desafios for all
  using (public.tem_cargo('admin'))
  with check (public.tem_cargo('admin'));


drop policy if exists "perguntas_select_auth" on public.desafio_perguntas;
create policy "perguntas_select_auth"
  on public.desafio_perguntas for select
  using (auth.role() = 'authenticated');

drop policy if exists "perguntas_admin_all" on public.desafio_perguntas;
create policy "perguntas_admin_all"
  on public.desafio_perguntas for all
  using (public.tem_cargo('admin'))
  with check (public.tem_cargo('admin'));


drop policy if exists "alternativas_admin_only" on public.desafio_alternativas;
create policy "alternativas_admin_only"
  on public.desafio_alternativas for all
  using (public.tem_cargo('admin'))
  with check (public.tem_cargo('admin'));


drop policy if exists "participacoes_select_own" on public.desafio_participacoes;
create policy "participacoes_select_own"
  on public.desafio_participacoes for select
  using (auth.uid() = usuario_id);

drop policy if exists "participacoes_admin_select" on public.desafio_participacoes;
create policy "participacoes_admin_select"
  on public.desafio_participacoes for select
  using (public.tem_cargo('admin'));




create or replace function public.iniciar_participacao_desafio(p_desafio_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_usuario_id     uuid := auth.uid();
  v_desafio        public.desafios%rowtype;
  v_tentativas     integer;
  v_existente      public.desafio_participacoes%rowtype;
  v_tempo_restante integer;
begin
  if v_usuario_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  select * into v_desafio from public.desafios where id = p_desafio_id and ativo = true;
  if not found then
    raise exception 'Desafio não encontrado ou inativo';
  end if;

  -- Verifica se já completou com sucesso
  if exists (
    select 1 from public.desafio_participacoes 
    where usuario_id = v_usuario_id and desafio_id = p_desafio_id and completado = true
  ) then
    raise exception 'Você já completou este desafio';
  end if;

  -- Busca se há uma participação não finalizada (pendente)
  select * into v_existente from public.desafio_participacoes
  where usuario_id = v_usuario_id and desafio_id = p_desafio_id and completado = false
  order by criado_em desc limit 1;

  if found then
    -- Se tem timer
    if v_desafio.tempo_segundos is not null then
      v_tempo_restante := v_desafio.tempo_segundos - extract(epoch from (now() - v_existente.criado_em))::integer;
      if v_tempo_restante <= 0 then
        -- Tempo expirou! Finaliza como completado mas com 0 acertos (falhado)
        update public.desafio_participacoes 
        set completado = true, acertos = 0, pontuacao = 0, xp_ganho = 0, pontos_ganhos = 0, tempo_gasto_segundos = v_desafio.tempo_segundos
        where id = v_existente.id;
        
        return json_build_object('status', 'expirado', 'mensagem', 'O tempo limite do desafio expirou!');
      else
        -- Retorna o tempo restante para continuar
        return json_build_object('status', 'continuar', 'tempo_restante', v_tempo_restante);
      end if;
    else
      -- Sem timer, apenas continua
      return json_build_object('status', 'continuar', 'tempo_restante', null);
    end if;
  end if;

  -- Se não há pendente, verifica limite de tentativas
  select count(*) into v_tentativas from public.desafio_participacoes
  where usuario_id = v_usuario_id and desafio_id = p_desafio_id;

  if v_desafio.max_tentativas is not null and v_tentativas >= v_desafio.max_tentativas then
    raise exception 'Você já atingiu o limite de tentativas para este desafio';
  end if;

  -- Cria uma nova participação pendente (completado = false)
  insert into public.desafio_participacoes (
    usuario_id, desafio_id, campanha_id,
    acertos, total_perguntas, pontuacao,
    xp_ganho, pontos_ganhos, completado,
    tentativa_num
  ) values (
    v_usuario_id, p_desafio_id, v_desafio.campanha_id,
    0, 0, 0, 0, 0, false, v_tentativas + 1
  );

  return json_build_object('status', 'iniciado', 'tempo_restante', v_desafio.tempo_segundos);
end;
$$;

grant execute on function public.iniciar_participacao_desafio(uuid) to authenticated;


create or replace function public.responder_desafio(
  p_desafio_id   uuid,
  p_respostas    jsonb,       
  p_tempo_gasto  integer default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_usuario_id     uuid := auth.uid();
  v_desafio        public.desafios%rowtype;
  v_campanha       public.campanhas_desafios%rowtype;
  v_total          integer;
  v_acertos        integer := 0;
  v_tentativas     integer;
  v_resp           jsonb;
  v_pergunta_id    uuid;
  v_alternativa_id uuid;
  v_correta        boolean;
  v_pontuacao      integer;
  v_xp_ganho       integer;
  v_pontos_ganhos  integer;
  v_saldo          integer;
  v_resultados     jsonb := '[]'::jsonb;
  v_ja_completou   boolean;
  v_participacao_id uuid;
begin
  if v_usuario_id is null then
    raise exception 'Usuário não autenticado';
  end if;


  select * into v_desafio from public.desafios
  where id = p_desafio_id and ativo = true;
  if not found then
    raise exception 'Desafio não encontrado ou inativo';
  end if;

 
  select * into v_campanha from public.campanhas_desafios
  where id = v_desafio.campanha_id and ativo = true;
  if not found then
    raise exception 'Campanha não encontrada ou inativa';
  end if;


  if v_campanha.fim is not null and v_campanha.fim < now() then
    raise exception 'Esta campanha já encerrou';
  end if;

 
  select count(*) into v_tentativas from public.desafio_participacoes
  where usuario_id = v_usuario_id and desafio_id = p_desafio_id;

  if v_desafio.max_tentativas is not null and v_tentativas >= v_desafio.max_tentativas then
    raise exception 'Você já atingiu o limite de tentativas para este desafio';
  end if;


  -- Verifica se existem desafios anteriores na mesma campanha que não foram completados pelo usuário
  if exists (
    select 1 
    from public.desafios d_ant
    where d_ant.campanha_id = v_desafio.campanha_id
      and d_ant.ativo = true
      and d_ant.ordem < v_desafio.ordem
      and not exists (
        select 1 
        from public.desafio_participacoes dp_ant
        where dp_ant.usuario_id = v_usuario_id
          and dp_ant.desafio_id = d_ant.id
          and dp_ant.completado = true
      )
  ) then
    raise exception 'Você precisa completar os desafios anteriores desta campanha primeiro';
  end if;

 
  select exists(
    select 1 from public.desafio_participacoes
    where usuario_id = v_usuario_id and desafio_id = p_desafio_id and completado = true
  ) into v_ja_completou;

 
  select count(*) into v_total from public.desafio_perguntas
  where desafio_id = p_desafio_id;

  if v_total = 0 then
    raise exception 'Este desafio não possui perguntas';
  end if;

 
  for v_resp in select * from jsonb_array_elements(p_respostas)
  loop
    v_pergunta_id := (v_resp->>'pergunta_id')::uuid;
    v_alternativa_id := (v_resp->>'alternativa_id')::uuid;

   
    select da.correta into v_correta
    from public.desafio_alternativas da
    join public.desafio_perguntas dp on dp.id = da.pergunta_id
    where da.id = v_alternativa_id
      and da.pergunta_id = v_pergunta_id
      and dp.desafio_id = p_desafio_id;

    if not found then
      v_correta := false;
    end if;

    if v_correta then
      v_acertos := v_acertos + 1;
    end if;

   
    v_resultados := v_resultados || jsonb_build_object(
      'pergunta_id', v_pergunta_id,
      'alternativa_id', v_alternativa_id,
      'correta', v_correta
    );
  end loop;


  v_pontuacao := round((v_acertos::numeric / v_total::numeric) * 100)::integer;


  if v_ja_completou then
    v_xp_ganho := 0;
    v_pontos_ganhos := 0;
  else
    v_xp_ganho := round((v_acertos::numeric / v_total::numeric) * v_desafio.xp_recompensa)::integer;
    if v_acertos = v_total then
      v_pontos_ganhos := v_desafio.pontos_recompensa;
    elsif v_acertos::numeric / v_total::numeric >= 0.5 then
      v_pontos_ganhos := round((v_acertos::numeric / v_total::numeric) * v_desafio.pontos_recompensa * 0.5)::integer;
    else
      v_pontos_ganhos := 0;
    end if;
  end if;

  
  -- Verifica se existe uma participação pendente iniciada para este desafio
  select id into v_participacao_id 
  from public.desafio_participacoes
  where usuario_id = v_usuario_id and desafio_id = p_desafio_id and completado = false
  order by criado_em desc limit 1;

  if found then
    update public.desafio_participacoes set
      acertos = v_acertos,
      total_perguntas = v_total,
      pontuacao = v_pontuacao,
      xp_ganho = v_xp_ganho,
      pontos_ganhos = v_pontos_ganhos,
      completado = true,
      tempo_gasto_segundos = p_tempo_gasto
    where id = v_participacao_id;
  else
    insert into public.desafio_participacoes (
      usuario_id, desafio_id, campanha_id,
      acertos, total_perguntas, pontuacao,
      xp_ganho, pontos_ganhos, completado,
      tempo_gasto_segundos, tentativa_num
    ) values (
      v_usuario_id, p_desafio_id, v_desafio.campanha_id,
      v_acertos, v_total, v_pontuacao,
      v_xp_ganho, v_pontos_ganhos, true,
      p_tempo_gasto, v_tentativas + 1
    );
  end if;

 
  if v_xp_ganho > 0 then
    update public.usuarios set xp = xp + v_xp_ganho where id = v_usuario_id;
  end if;

 
  if v_pontos_ganhos > 0 then
    select saldo into v_saldo from public.carteiras
    where usuario_id = v_usuario_id for update;

    update public.carteiras
    set saldo = saldo + v_pontos_ganhos
    where usuario_id = v_usuario_id;

    insert into public.transacoes_carteira
      (usuario_id, tipo, valor, saldo_anterior, saldo_posterior, descricao)
    values
      (v_usuario_id, 'credito', v_pontos_ganhos,
       v_saldo, v_saldo + v_pontos_ganhos,
       'Desafio: ' || v_desafio.titulo);
  end if;

  return jsonb_build_object(
    'acertos', v_acertos,
    'total', v_total,
    'pontuacao', v_pontuacao,
    'xp_ganho', v_xp_ganho,
    'pontos_ganhos', v_pontos_ganhos,
    'ja_completou_antes', v_ja_completou,
    'tentativa', v_tentativas + 1,
    'resultados', v_resultados
  );
end;
$$;



drop function if exists public.ranking_campanha(uuid);

create or replace function public.ranking_campanha(p_campanha_id uuid)
returns table (
  posicao     bigint,
  usuario_id  uuid,
  nome        text,
  username    text,
  avatar_url  text,
  desafios_completos bigint,
  pontuacao   numeric,
  xp          numeric,
  crcoins     numeric
)
language sql
security definer
stable
as $$
  select
    row_number() over (order by sum(dp.pontuacao) desc, min(dp.criado_em)) as posicao,
    u.id as usuario_id,
    u.nome,
    u.username,
    u.avatar_url,
    count(distinct dp.desafio_id) as desafios_completos,
    sum(dp.pontuacao) as pontuacao,
    sum(dp.xp_ganho) as xp,
    sum(dp.pontos_ganhos) as crcoins
  from public.desafio_participacoes dp
  join public.usuarios u on u.id = dp.usuario_id
  where dp.campanha_id = p_campanha_id
    and dp.completado = true
  group by u.id, u.nome, u.username, u.avatar_url
  order by pontuacao desc, min(dp.criado_em)
  limit 20;
$$;



create or replace function public.ranking_geral_xp()
returns table (
  posicao    bigint,
  usuario_id uuid,
  nome       text,
  username   text,
  avatar_url text,
  xp         integer
)
language sql
security definer
stable
as $$
  select
    row_number() over (order by u.xp desc, u.criado_em) as posicao,
    u.id as usuario_id,
    u.nome,
    u.username,
    u.avatar_url,
    u.xp
  from public.usuarios u
  where u.ativo = true and u.xp > 0
  order by u.xp desc, u.criado_em
  limit 10;
$$;



create or replace function public.progresso_campanha(p_campanha_id uuid)
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  v_uid         uuid := auth.uid();
  v_total       integer;
  v_completados integer;
  v_xp_total    integer;
  v_pts_total   integer;
begin
  select count(*) into v_total
  from public.desafios
  where campanha_id = p_campanha_id and ativo = true;

  select
    count(distinct dp.desafio_id),
    coalesce(sum(dp.xp_ganho), 0),
    coalesce(sum(dp.pontos_ganhos), 0)
  into v_completados, v_xp_total, v_pts_total
  from public.desafio_participacoes dp
  where dp.usuario_id = v_uid
    and dp.campanha_id = p_campanha_id
    and dp.completado = true;

  return jsonb_build_object(
    'total_desafios', v_total,
    'completados', v_completados,
    'xp_total', v_xp_total,
    'pontos_total', v_pts_total
  );
end;
$$;




grant execute on function public.responder_desafio(uuid, jsonb, integer) to authenticated;
grant execute on function public.ranking_campanha(uuid) to authenticated;
grant execute on function public.ranking_geral_xp() to authenticated;
grant execute on function public.progresso_campanha(uuid) to authenticated;



do $$
declare
  v_camp_id    uuid;
  v_desafio_id uuid;
  v_p1         uuid;
  v_p2         uuid;
  v_p3         uuid;
begin

  if not exists (select 1 from public.campanhas_desafios) then


    insert into public.campanhas_desafios (nome, descricao, cor_primaria, cor_secundaria, ativo)
    values (
      '🎓 Treinamento Inicial',
      'Conheça a CR Store e teste seus conhecimentos sobre a plataforma!',
      '#6366f1',
      '#a78bfa',
      true
    ) returning id into v_camp_id;

  
    insert into public.desafios (campanha_id, titulo, descricao, tipo, xp_recompensa, pontos_recompensa, ordem)
    values (
      v_camp_id,
      'Quiz: Conhecendo a CR Store',
      'Teste o quanto você sabe sobre a plataforma de recompensas.',
      'quiz',
      50, 25, 1
    ) returning id into v_desafio_id;

    insert into public.desafio_perguntas (desafio_id, texto, ordem)
    values (v_desafio_id, 'O que são CRcoins?', 1)
    returning id into v_p1;

    insert into public.desafio_alternativas (pergunta_id, texto, correta, ordem) values
      (v_p1, 'Uma criptomoeda real', false, 1),
      (v_p1, 'Pontos de recompensa da CR Store', true, 2),
      (v_p1, 'Uma moeda de jogo online', false, 3),
      (v_p1, 'Créditos para compras externas', false, 4);

    
    insert into public.desafio_perguntas (desafio_id, texto, ordem)
    values (v_desafio_id, 'Como você pode ganhar CRcoins?', 2)
    returning id into v_p2;

    insert into public.desafio_alternativas (pergunta_id, texto, correta, ordem) values
      (v_p2, 'Apenas comprando', false, 1),
      (v_p2, 'Resgatando códigos de campanhas e recebendo transferências', true, 2),
      (v_p2, 'Vendendo produtos', false, 3),
      (v_p2, 'Assistindo anúncios', false, 4);


    insert into public.desafio_perguntas (desafio_id, texto, ordem)
    values (v_desafio_id, 'É possível transferir CRcoins para outro colega?', 3)
    returning id into v_p3;

    insert into public.desafio_alternativas (pergunta_id, texto, correta, ordem) values
      (v_p3, 'Sim, pela carteira', true, 1),
      (v_p3, 'Não, os pontos são intransferíveis', false, 2),
      (v_p3, 'Apenas o administrador pode fazer isso', false, 3);


   
    insert into public.desafios (campanha_id, titulo, descricao, tipo, tempo_segundos, xp_recompensa, pontos_recompensa, ordem)
    values (
      v_camp_id,
      'Verdadeiro ou Falso: Regras da Loja',
      'Responda rápido! Você tem 60 segundos.',
      'verdadeiro_falso',
      60, 30, 15, 2
    ) returning id into v_desafio_id;


    insert into public.desafio_perguntas (desafio_id, texto, ordem)
    values (v_desafio_id, 'Você pode comprar produtos na loja usando CRcoins.', 1)
    returning id into v_p1;

    insert into public.desafio_alternativas (pergunta_id, texto, correta, ordem) values
      (v_p1, 'Verdadeiro', true, 1),
      (v_p1, 'Falso', false, 2);

    
    insert into public.desafio_perguntas (desafio_id, texto, ordem)
    values (v_desafio_id, 'O saldo pode ficar negativo após uma compra.', 2)
    returning id into v_p2;

    insert into public.desafio_alternativas (pergunta_id, texto, correta, ordem) values
      (v_p2, 'Verdadeiro', false, 1),
      (v_p2, 'Falso', true, 2);

    
    insert into public.desafio_perguntas (desafio_id, texto, ordem)
    values (v_desafio_id, 'Qualquer pessoa com o link pode acessar a CR Store.', 3)
    returning id into v_p3;

    insert into public.desafio_alternativas (pergunta_id, texto, correta, ordem) values
      (v_p3, 'Verdadeiro', false, 1),
      (v_p3, 'Falso', true, 2);

  end if;
end $$;
