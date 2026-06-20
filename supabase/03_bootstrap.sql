
-- CR STORE — Bootstrap de admin 
-- Uso:  select public.bootstrap_admin('seu@email.com', 'Seu Nome');


create or replace function public.bootstrap_admin(
  p_email text,
  p_nome  text default null
)
returns text
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
begin
  -- 1. garante o e-mail na whitelist
  insert into public.whitelist (email, nome)
  values (p_email, p_nome)
  on conflict (email) do update set ativo = true;

  -- 2. se o usuário do auth já existe, cria o perfil e dá admin
  select id into v_user_id from auth.users where lower(email) = lower(p_email);

  if v_user_id is null then
    return 'E-mail adicionado à whitelist. Faça o primeiro acesso e rode de novo para virar admin.';
  end if;

  insert into public.usuarios (id, email, primeiro_acesso_concluido)
  values (v_user_id, p_email, true)
  on conflict (id) do nothing;

  insert into public.usuario_cargos (usuario_id, cargo_id)
  select v_user_id, c.id from public.cargos c where c.codigo = 'admin'
  on conflict do nothing;

  return 'Pronto: ' || p_email || ' está na whitelist e é admin.';
end;
$$;

-- IMPORTANTE: não expor essa função aos clientes (senão qualquer um vira admin).
-- Só pode ser chamada pelo SQL Editor / backend (postgres / service role).
revoke execute on function public.bootstrap_admin(text, text) from public, anon, authenticated;
