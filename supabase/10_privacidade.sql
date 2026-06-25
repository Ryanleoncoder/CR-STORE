drop policy if exists "usuarios_select_para_transferir" on public.usuarios;

drop function if exists public.buscar_usuarios(text);

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
