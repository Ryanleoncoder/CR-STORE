alter table public.usuarios add column if not exists xp integer not null default 0;

update public.usuarios
set xp = floor(random() * 4500 + 500)::integer
where xp = 0;
