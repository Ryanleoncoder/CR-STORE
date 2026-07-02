
-- 1. ALTERAÇÃO DAS TABELAS



alter table public.campanhas_desafios 
  add column if not exists xp_recompensa integer not null default 0 check (xp_recompensa >= 0),
  add column if not exists pontos_recompensa integer not null default 0 check (pontos_recompensa >= 0),
  add column if not exists banner_url text;

-- Adiciona coluna de ramificação nas alternativas (para onde ir a seguir)
alter table public.desafio_alternativas
  add column if not exists proxima_pergunta_id uuid references public.desafio_perguntas(id) on delete set null;



-- 2. ATUALIZAÇÃO DA VIEW SEGURA


-- Recria a view segura expondo a próxima pergunta para que o frontend possa controlar o fluxo
create or replace view public.desafio_alternativas_seguras as
  select id, pergunta_id, texto, ordem, proxima_pergunta_id
  from public.desafio_alternativas;


-- 3. ATUALIZAÇÃO DA FUNÇÃO RPC

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
  
  
  v_base_xp        integer;
  v_base_pontos    integer;
  v_participacao_id uuid;
begin
  if v_usuario_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  -- Busca o desafio
  select * into v_desafio from public.desafios
  where id = p_desafio_id and ativo = true;
  if not found then
    raise exception 'Desafio não encontrado ou inativo';
  end if;

  -- Busca a campanha
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

  v_total := jsonb_array_length(p_respostas);

  if v_total is null or v_total = 0 then
    raise exception 'Nenhuma pergunta foi respondida';
  end if;

  v_base_xp := case when v_desafio.xp_recompensa > 0 then v_desafio.xp_recompensa else v_campanha.xp_recompensa end;
  v_base_pontos := case when v_desafio.pontos_recompensa > 0 then v_desafio.pontos_recompensa else v_campanha.pontos_recompensa end;

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
    v_xp_ganho := round((v_acertos::numeric / v_total::numeric) * v_base_xp)::integer;
    
    if v_acertos = v_total then
      v_pontos_ganhos := v_base_pontos;
    elsif v_acertos::numeric / v_total::numeric >= 0.5 then
      v_pontos_ganhos := round((v_acertos::numeric / v_total::numeric) * v_base_pontos * 0.5)::integer;
    else
      v_pontos_ganhos := 0;
    end if;
  end if;

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
