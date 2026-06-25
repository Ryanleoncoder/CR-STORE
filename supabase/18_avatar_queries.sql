drop function if exists public.buscar_usuarios(text);
drop function if exists public.contatos_recentes();


create or replace function public.buscar_usuarios(p_termo text)
returns table (id uuid, nome text, username text, avatar_url text)
language sql
security definer
stable
as $$
  select u.id, u.nome, u.username, u.avatar_url
  from public.usuarios u
  where u.ativo = true
    and u.id <> auth.uid()
    and (
      coalesce(p_termo, '') = ''
      or u.nome ilike '%' || p_termo || '%'
      or u.username ilike '%' || p_termo || '%'
      or u.email ilike '%' || p_termo || '%'
    )
  limit 10;
$$;

grant execute on function public.buscar_usuarios(text) to authenticated;


create or replace function public.contatos_recentes()
returns table (id uuid, nome text, username text, avatar_url text)
language sql
security definer
stable
as $$
  select u.id, u.nome, u.username, u.avatar_url
  from (
    select distinct on (destinatario_id) destinatario_id, criado_em
    from public.transferencias_pontos
    where remetente_id = auth.uid()
    order by destinatario_id, criado_em desc
  ) r
  join public.usuarios u on u.id = r.destinatario_id
  order by r.criado_em desc
  limit 6;
$$;

grant execute on function public.contatos_recentes() to authenticated;
