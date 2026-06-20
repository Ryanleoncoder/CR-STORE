
-- CR STORE — Privacidade: não expor e-mails entre usuários


-- A policy abaixo deixava qualquer autenticado ler todos os usuários

drop policy if exists "usuarios_select_para_transferir" on public.usuarios;

-- Busca de destinatários para transferência. Retorna só id/nome/username;
create or replace function public.buscar_usuarios(p_termo text)
returns table (id uuid, nome text, username text)
language sql
security definer
stable
as $$
  select u.id, u.nome, u.username
  from public.usuarios u
  where u.ativo = true
    and (
      coalesce(p_termo, '') = ''
      or u.nome ilike '%' || p_termo || '%'
      or u.username ilike '%' || p_termo || '%'
      or u.email ilike '%' || p_termo || '%'
    )
  limit 10;
$$;

grant execute on function public.buscar_usuarios(text) to authenticated;
