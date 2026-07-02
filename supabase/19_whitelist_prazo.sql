
ALTER TABLE public.whitelist
  ADD COLUMN IF NOT EXISTS expira_em timestamptz;


UPDATE public.whitelist
   SET expira_em = criado_em + interval '5 days'
 WHERE expira_em IS NULL;


ALTER TABLE public.whitelist
  ALTER COLUMN expira_em SET DEFAULT (now() + interval '5 days');

CREATE INDEX IF NOT EXISTS idx_whitelist_expira_em
  ON public.whitelist (expira_em);
