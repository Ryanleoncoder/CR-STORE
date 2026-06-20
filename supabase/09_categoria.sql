-- CR STORE — Categoria de produtos


alter table public.produtos add column if not exists categoria text;

-- Recria salvar_produto incluindo a categoria (assinatura nova) ---------
drop function if exists public.salvar_produto(uuid, text, text, integer, integer, text, boolean);

create or replace function public.salvar_produto(
  p_id         uuid,
  p_nome       text,
  p_descricao  text,
  p_preco      integer,
  p_estoque    integer,
  p_imagem_url text default null,
  p_ativo      boolean default true,
  p_categoria  text default null
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
    insert into public.produtos (nome, descricao, preco, estoque, imagem_url, ativo, categoria)
    values (p_nome, p_descricao, p_preco, p_estoque, p_imagem_url, p_ativo, p_categoria)
    returning id into v_id;
  else
    update public.produtos
       set nome = p_nome,
           descricao = p_descricao,
           preco = p_preco,
           estoque = p_estoque,
           imagem_url = coalesce(p_imagem_url, imagem_url),
           ativo = p_ativo,
           categoria = p_categoria
     where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;
