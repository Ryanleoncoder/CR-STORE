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
  where u.ativo = true
  order by u.xp desc, u.criado_em
  limit 10;
$$;

grant execute on function public.ranking_geral_xp() to authenticated;


create or replace function public.ranking_xp_periodo(p_periodo text)
returns table (
  posicao    bigint,
  usuario_id uuid,
  nome       text,
  username   text,
  avatar_url text,
  xp         integer
)
language plpgsql
security definer
stable
as $$
begin
  if p_periodo = 'today' then
    return query
    select
      row_number() over (order by coalesce(sum(dp.xp_ganho), 0) desc, u.criado_em) as posicao,
      u.id as usuario_id,
      u.nome,
      u.username,
      u.avatar_url,
      coalesce(sum(dp.xp_ganho), 0)::integer as xp
    from public.usuarios u
    left join public.desafio_participacoes dp on dp.usuario_id = u.id 
      and dp.completado = true 
      and dp.criado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo')
    where u.ativo = true
    group by u.id, u.nome, u.username, u.avatar_url
    order by xp desc, u.criado_em
    limit 10;
    
  elsif p_periodo = 'weekly' then
    return query
    select
      row_number() over (order by coalesce(sum(dp.xp_ganho), 0) desc, u.criado_em) as posicao,
      u.id as usuario_id,
      u.nome,
      u.username,
      u.avatar_url,
      coalesce(sum(dp.xp_ganho), 0)::integer as xp
    from public.usuarios u
    left join public.desafio_participacoes dp on dp.usuario_id = u.id 
      and dp.completado = true 
      and dp.criado_em >= (now() - interval '7 days')
    where u.ativo = true
    group by u.id, u.nome, u.username, u.avatar_url
    order by xp desc, u.criado_em
    limit 10;

  elsif p_periodo = 'monthly' then
    return query
    select
      row_number() over (order by coalesce(sum(dp.xp_ganho), 0) desc, u.criado_em) as posicao,
      u.id as usuario_id,
      u.nome,
      u.username,
      u.avatar_url,
      coalesce(sum(dp.xp_ganho), 0)::integer as xp
    from public.usuarios u
    left join public.desafio_participacoes dp on dp.usuario_id = u.id 
      and dp.completado = true 
      and dp.criado_em >= date_trunc('month', now() at time zone 'America/Sao_Paulo')
    where u.ativo = true
    group by u.id, u.nome, u.username, u.avatar_url
    order by xp desc, u.criado_em
    limit 10;
    
  else

    return query
    select
      row_number() over (order by u.xp desc, u.criado_em) as posicao,
      u.id as usuario_id,
      u.nome,
      u.username,
      u.avatar_url,
      u.xp
    from public.usuarios u
    where u.ativo = true
    order by u.xp desc, u.criado_em
    limit 10;
  end if;
end;
$$;

grant execute on function public.ranking_xp_periodo(text) to authenticated;

create or replace function public.verificar_resposta_pergunta(p_pergunta_id uuid, p_alternativa_id uuid)
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  v_correta_id uuid;
  v_eh_correta boolean;
begin
  select id into v_correta_id
  from public.desafio_alternativas
  where pergunta_id = p_pergunta_id and correta = true;
  
  v_eh_correta := (v_correta_id = p_alternativa_id);
  
  return json_build_object(
    'correta', v_eh_correta,
    'correta_id', v_correta_id
  );
end;
$$;

grant execute on function public.verificar_resposta_pergunta(uuid, uuid) to authenticated;


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

grant execute on function public.ranking_campanha(uuid) to authenticated;


update public.desafio_participacoes 
set pontuacao = round(pontuacao / 10.0)
where pontuacao > 100;
