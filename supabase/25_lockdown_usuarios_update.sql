-- CR STORE — Trava de colunas em public.usuarios

revoke update on public.usuarios from authenticated;
revoke update on public.usuarios from anon;


grant update (nome, avatar_url) on public.usuarios to authenticated;
