
-- CR STORE — Anti-cheat do Sistema de Desafios

-- 1. ARMAZENAMENTO DAS RESPOSTAS TRAVADAS



alter table public.desafio_participacoes
  add column if not exists respostas_travadas jsonb not null default '{}'::jsonb;


-- 2. VERIFICAR RESPOSTA — agora TRAVA a escolha no servidor


create or replace function public.verificar_resposta_pergunta(
  p_pergunta_id    uuid,
  p_alternativa_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_uid          uuid := auth.uid();
  v_desafio_id   uuid;
  v_part         public.desafio_participacoes%rowtype;
  v_locked       jsonb;
  v_alt_final    uuid;
  v_ja_travada   boolean := false;
  v_correta_id   uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

 
  select desafio_id into v_desafio_id
  from public.desafio_perguntas
  where id = p_pergunta_id;

  if v_desafio_id is null then
    raise exception 'Pergunta não encontrada';
  end if;

 
  select * into v_part
  from public.desafio_participacoes
  where usuario_id = v_uid
    and desafio_id = v_desafio_id
    and completado = false
  order by criado_em desc
  limit 1;

  if not found then
    raise exception 'Participação não iniciada para este desafio';
  end if;

  
  if not exists (
    select 1 from public.desafio_alternativas
    where id = p_alternativa_id and pergunta_id = p_pergunta_id
  ) then
    raise exception 'Alternativa inválida para esta pergunta';
  end if;

  v_locked := coalesce(v_part.respostas_travadas, '{}'::jsonb);

 
  if v_locked ? p_pergunta_id::text then
    v_alt_final  := (v_locked ->> p_pergunta_id::text)::uuid;
    v_ja_travada := true;
  else
    v_alt_final := p_alternativa_id;
    update public.desafio_participacoes
    set respostas_travadas =
          v_locked || jsonb_build_object(p_pergunta_id::text, p_alternativa_id::text)
    where id = v_part.id;
  end if;

 
  select id into v_correta_id
  from public.desafio_alternativas
  where pergunta_id = p_pergunta_id and correta = true
  limit 1;

  return jsonb_build_object(
    'correta',       (v_alt_final = v_correta_id),
    'correta_id',    v_correta_id,
    'ja_respondida', v_ja_travada
  );
end;
$$;

grant execute on function public.verificar_resposta_pergunta(uuid, uuid) to authenticated;



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
  v_uid             uuid := auth.uid();
  v_desafio         public.desafios%rowtype;
  v_campanha        public.campanhas_desafios%rowtype;
  v_part            public.desafio_participacoes%rowtype;
  v_tentativas      integer;
  v_ja_completou    boolean;

  v_locked          jsonb;
  v_qcount          integer;
  v_pid             uuid;
  v_next_branch     uuid;
  v_alt_id          uuid;
  v_corr            boolean;
  v_guard           integer := 0;

  v_total           integer := 0;
  v_acertos         integer := 0;
  v_pontuacao       integer;
  v_base_xp         integer;
  v_base_pontos     integer;
  v_xp_ganho        integer;
  v_pontos_ganhos   integer;
  v_saldo           integer;
  v_decorrido       integer;
  v_grace           integer := 3;   -- folga de rede/relógio, em segundos
begin
  if v_uid is null then
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

  -- Limite de tentativas
  select count(*) into v_tentativas from public.desafio_participacoes
  where usuario_id = v_uid and desafio_id = p_desafio_id;

  if v_desafio.max_tentativas is not null and v_tentativas >= v_desafio.max_tentativas then
    raise exception 'Você já atingiu o limite de tentativas para este desafio';
  end if;

  
  if exists (
    select 1
    from public.desafios d_ant
    where d_ant.campanha_id = v_desafio.campanha_id
      and d_ant.ativo = true
      and d_ant.ordem < v_desafio.ordem
      and not exists (
        select 1
        from public.desafio_participacoes dp_ant
        where dp_ant.usuario_id = v_uid
          and dp_ant.desafio_id = d_ant.id
          and dp_ant.completado = true
      )
  ) then
    raise exception 'Você precisa completar os desafios anteriores desta campanha primeiro';
  end if;

  -- Já completou antes? (sem recompensa extra)
  select exists(
    select 1 from public.desafio_participacoes
    where usuario_id = v_uid and desafio_id = p_desafio_id and completado = true
  ) into v_ja_completou;

  
  select * into v_part
  from public.desafio_participacoes
  where usuario_id = v_uid and desafio_id = p_desafio_id and completado = false
  order by criado_em desc
  limit 1;

  if not found then
    raise exception 'Participação não iniciada para este desafio';
  end if;

  -- Validação de TEMPO no servidor (o cronômetro do cliente é só visual).
  if v_desafio.tempo_segundos is not null then
    v_decorrido := extract(epoch from (now() - v_part.criado_em))::integer;
    if v_decorrido > v_desafio.tempo_segundos + v_grace then
      update public.desafio_participacoes set
        acertos = 0, total_perguntas = 0, pontuacao = 0,
        xp_ganho = 0, pontos_ganhos = 0, completado = true,
        tempo_gasto_segundos = v_desafio.tempo_segundos
      where id = v_part.id;

      return jsonb_build_object(
        'status', 'expirado',
        'acertos', 0, 'total', 0, 'pontuacao', 0,
        'xp_ganho', 0, 'pontos_ganhos', 0,
        'ja_completou_antes', v_ja_completou,
        'tentativa', v_tentativas + 1,
        'mensagem', 'O tempo limite do desafio expirou.',
        'resultados', '[]'::jsonb
      );
    end if;
  end if;

  v_locked := coalesce(v_part.respostas_travadas, '{}'::jsonb);

  select count(*) into v_qcount
  from public.desafio_perguntas where desafio_id = p_desafio_id;

  if v_qcount = 0 then
    raise exception 'Este desafio não possui perguntas';
  end if;

 
  select id into v_pid
  from public.desafio_perguntas
  where desafio_id = p_desafio_id
  order by ordem, id
  limit 1;

  while v_pid is not null loop
    v_guard := v_guard + 1;
    if v_guard > v_qcount + 1 then
      exit;  -- proteção contra ciclo de ramificação
    end if;

    if not (v_locked ? v_pid::text) then
      raise exception 'Responda todas as perguntas antes de enviar';
    end if;

    v_alt_id := (v_locked ->> v_pid::text)::uuid;

    -- Correção + destino de ramificação da alternativa travada
    select da.correta, da.proxima_pergunta_id
    into v_corr, v_next_branch
    from public.desafio_alternativas da
    where da.id = v_alt_id and da.pergunta_id = v_pid;

    if not found then
      v_corr := false;
      v_next_branch := null;
    end if;

    v_total := v_total + 1;
    if v_corr then
      v_acertos := v_acertos + 1;
    end if;

    -- Próxima pergunta: ramificação válida ou, na falta, a próxima por ordem
    if v_next_branch is not null
       and exists (select 1 from public.desafio_perguntas
                   where id = v_next_branch and desafio_id = p_desafio_id) then
      v_pid := v_next_branch;
    else
      select dp2.id into v_pid
      from public.desafio_perguntas dp2
      where dp2.desafio_id = p_desafio_id
        and (dp2.ordem, dp2.id) > (
          select dp3.ordem, dp3.id
          from public.desafio_perguntas dp3
          where dp3.id = v_pid
        )
      order by dp2.ordem, dp2.id
      limit 1;  -- sem próxima -> v_pid vira null e o laço termina
    end if;
  end loop;

  if v_total = 0 then
    raise exception 'Nenhuma pergunta respondida';
  end if;

  v_pontuacao := round((v_acertos::numeric / v_total::numeric) * 100)::integer;

  -- Recompensas (com fallback para os valores da campanha)
  v_base_xp     := case when v_desafio.xp_recompensa > 0
                        then v_desafio.xp_recompensa else v_campanha.xp_recompensa end;
  v_base_pontos := case when v_desafio.pontos_recompensa > 0
                        then v_desafio.pontos_recompensa else v_campanha.pontos_recompensa end;

  if v_ja_completou then
    v_xp_ganho := 0;
    v_pontos_ganhos := 0;
  else
    v_xp_ganho := round((v_acertos::numeric / v_total::numeric) * v_base_xp)::integer;

    if v_acertos = v_total then
      v_pontos_ganhos := v_base_pontos;
    elsif v_acertos::numeric / v_total::numeric >= 0.5 then
      v_pontos_ganhos := round((v_acertos::numeric / v_total::numeric) * v_base_pontos * 0.5)::integer;
    else
      v_pontos_ganhos := 0;
    end if;
  end if;

  -- Finaliza a participação pendente
  update public.desafio_participacoes set
    acertos = v_acertos,
    total_perguntas = v_total,
    pontuacao = v_pontuacao,
    xp_ganho = v_xp_ganho,
    pontos_ganhos = v_pontos_ganhos,
    completado = true,
    tempo_gasto_segundos = p_tempo_gasto
  where id = v_part.id;

  if v_xp_ganho > 0 then
    update public.usuarios set xp = xp + v_xp_ganho where id = v_uid;
  end if;

  if v_pontos_ganhos > 0 then
    select saldo into v_saldo from public.carteiras
    where usuario_id = v_uid for update;

    update public.carteiras
    set saldo = saldo + v_pontos_ganhos
    where usuario_id = v_uid;

    insert into public.transacoes_carteira
      (usuario_id, tipo, valor, saldo_anterior, saldo_posterior, descricao)
    values
      (v_uid, 'credito', v_pontos_ganhos,
       v_saldo, v_saldo + v_pontos_ganhos,
       'Desafio: ' || v_desafio.titulo);
  end if;

  return jsonb_build_object(
    'status', 'concluido',
    'acertos', v_acertos,
    'total', v_total,
    'pontuacao', v_pontuacao,
    'xp_ganho', v_xp_ganho,
    'pontos_ganhos', v_pontos_ganhos,
    'ja_completou_antes', v_ja_completou,
    'tentativa', v_tentativas + 1
  );
end;
$$;

grant execute on function public.responder_desafio(uuid, jsonb, integer) to authenticated;
