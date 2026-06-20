-- CR STORE — Finalizar Pedido 
-- Executa a compra de múltiplos produtos (carrinho) em uma única transação segura.

create or replace function public.finalizar_pedido(p_itens json)
returns uuid
language plpgsql
security definer
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_saldo      integer;
  v_item       json;
  v_produto_id uuid;
  v_qtd        integer;
  v_preco      integer;
  v_estoque    integer;
  v_total_item integer;
  v_total_pedido integer := 0;
  v_pedido_id  uuid;
begin
  if v_usuario_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  -- 1. Obter e bloquear saldo da carteira
  select saldo into v_saldo
  from public.carteiras
  where usuario_id = v_usuario_id
  for update;

  if not found then
    raise exception 'Carteira não encontrada';
  end if;

  -- 2. Criar pedido temporário para obter o ID
  --    Nasce como 'pendente' (comprou, aguarda confirmação/entrega pelo admin)
  insert into public.pedidos (usuario_id, status, total)
  values (v_usuario_id, 'pendente', 0)
  returning id into v_pedido_id;

  -- 3. Iterar nos itens para validar estoque e preço
  for v_item in select * from json_array_elements(p_itens) loop
    v_produto_id := (v_item->>'produto_id')::uuid;
    v_qtd        := (v_item->>'quantidade')::integer;

    if v_qtd <= 0 then
      raise exception 'A quantidade de cada item deve ser positiva';
    end if;

    -- Selecionar preço e estoque
    select preco, estoque into v_preco, v_estoque
    from public.produtos
    where id = v_produto_id and ativo = true
    for update;

    if not found then
      raise exception 'Produto não encontrado ou inativo';
    end if;

    if v_estoque < v_qtd then
      raise exception 'Estoque insuficiente para o produto';
    end if;

    v_total_item := v_preco * v_qtd;
    v_total_pedido := v_total_pedido + v_total_item;

    -- Inserir item do pedido
    insert into public.pedido_itens (pedido_id, produto_id, quantidade, preco_unitario)
    values (v_pedido_id, v_produto_id, v_qtd, v_preco);

    -- Deduzir estoque
    update public.produtos
       set estoque = estoque - v_qtd
     where id = v_produto_id;
  end loop;

  -- 4. Validar saldo total
  if v_saldo < v_total_pedido then
    raise exception 'Saldo insuficiente (Total do pedido: %)', v_total_pedido;
  end if;

  -- 5. Atualizar total do pedido
  update public.pedidos
     set total = v_total_pedido
   where id = v_pedido_id;

  -- 6. Debitar saldo da carteira
  update public.carteiras
     set saldo = saldo - v_total_pedido
   where usuario_id = v_usuario_id;

  -- 7. Registrar transação na carteira
  insert into public.transacoes_carteira
    (usuario_id, tipo, valor, saldo_anterior, saldo_posterior, descricao, referencia_id)
  values
    (v_usuario_id, 'compra_loja', v_total_pedido, v_saldo, v_saldo - v_total_pedido, 'Compra de itens no carrinho', v_pedido_id);

  return v_pedido_id;
end;
$$;

revoke execute on function public.finalizar_pedido(json) from public, anon;
grant execute on function public.finalizar_pedido(json) to authenticated;
