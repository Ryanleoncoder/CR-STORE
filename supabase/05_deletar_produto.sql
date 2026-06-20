-- CR STORE — Deletar produto 
-- Permite apagar um produto se não houver pedidos vinculados.
-- Se houver, desativa o produto para preservar o histórico de compras.

create or replace function public.deletar_produto(p_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_possui_pedidos boolean;
begin
  if not public.tem_cargo('admin') then
    raise exception 'Acesso restrito a administradores';
  end if;

  select exists (
    select 1 from public.pedido_itens
    where produto_id = p_id
  ) into v_possui_pedidos;

  if v_possui_pedidos then
    update public.produtos
       set ativo = false
     where id = p_id;
    return 'desativado';
  else
    delete from public.produtos
     where id = p_id;
    return 'apagado';
  end if;
end;
$$;

revoke execute on function public.deletar_produto(uuid) from public, anon;
grant execute on function public.deletar_produto(uuid) to authenticated;
