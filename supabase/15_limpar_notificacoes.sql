ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS notif_limpo_em timestamptz;


CREATE OR REPLACE FUNCTION public.limpar_notificacoes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.usuarios
     SET notif_limpo_em = now()
   WHERE id = auth.uid();
END;
$$;
