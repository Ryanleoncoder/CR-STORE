-- CR STORE — Permitir saldo negativo 
-- Regra: o saldo PODE ficar negativo, mas só por ajuste do admin.
-- A soma é sempre COM SINAL (dar -10 sobre -10 = -20, nunca vira positivo).
-- Usuários comuns continuam sem conseguir gastar/transferir além do saldo.


-- 1. Remove a trava que impedia saldo < 0
alter table public.carteiras drop constraint if exists carteiras_saldo_check;

-- 2. ajustar_saldo: sem o bloqueio de "deixaria negativo"
create or replace function public.ajustar_saldo(
  p_usuario_id uuid,
  p_valor      integer,
  p_descricao  text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_saldo integer;
begin
  if not public.tem_cargo('admin') then
    raise exception 'Acesso restrito a administradores';
  end if;

  if p_valor = 0 then
    raise exception 'O valor do ajuste não pode ser zero';
  end if;

  select saldo into v_saldo
  from public.carteiras
  where usuario_id = p_usuario_id
  for update;

  if not found then
    raise exception 'Carteira não encontrada';
  end if;

  -- soma com sinal; o saldo pode ficar negativo
  update public.carteiras
  set saldo = v_saldo + p_valor
  where usuario_id = p_usuario_id;

  insert into public.transacoes_carteira
    (usuario_id, tipo, valor, saldo_anterior, saldo_posterior, descricao)
  values
    (p_usuario_id, 'ajuste_admin', p_valor, v_saldo, v_saldo + p_valor, p_descricao);
end;
$$;
