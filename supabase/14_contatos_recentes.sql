create or replace function public.contatos_recentes()
returns table (id uuid, nome text, username text)
language sql
security definer
stable
as $$
  select u.id, u.nome, u.username
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
