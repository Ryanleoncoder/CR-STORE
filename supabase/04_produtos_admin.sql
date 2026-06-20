
-- CR STORE — Admin de produtos 


-- Admin enxerga todos os produtos
drop policy if exists "produtos_admin_select" on public.produtos;
create policy "produtos_admin_select"
  on public.produtos for select
  using (public.tem_cargo('admin'));

-- Criar ou editar produto (somente admin) 
-- p_id nulo => cria; preenchido => edita.
-- p_imagem_url nulo no update mantém a imagem atual.
create or replace function public.salvar_produto(
  p_id        uuid,
  p_nome      text,
  p_descricao text,
  p_preco     integer,
  p_estoque   integer,
  p_imagem_url text default null,
  p_ativo     boolean default true
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

  if p_id is null then
    insert into public.produtos (nome, descricao, preco, estoque, imagem_url, ativo)
    values (p_nome, p_descricao, p_preco, p_estoque, p_imagem_url, p_ativo)
    returning id into v_id;
  else
    update public.produtos
       set nome = p_nome,
           descricao = p_descricao,
           preco = p_preco,
           estoque = p_estoque,
           imagem_url = coalesce(p_imagem_url, imagem_url),
           ativo = p_ativo
     where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;
