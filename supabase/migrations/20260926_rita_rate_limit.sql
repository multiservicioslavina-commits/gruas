-- Rate limit de Rita (rita-v2) en la base, no en memoria.
--
-- Hasta ahora el limite de mensajes por minuto vivia en un Map() de
-- JavaScript dentro de la edge function. En Supabase cada request puede caer
-- en un isolate distinto (los logs de produccion muestran requests con
-- segundos de diferencia servidos desde us-east-1, us-east-2 y us-west-1, y
-- cada isolate se apaga a los ~25 s sin trafico), asi que ese Map casi nunca
-- acumulaba nada y el limite era decorativo.
--
-- rita_check_rate_limit() cuenta en una sola sentencia atomica (INSERT ...
-- ON CONFLICT DO UPDATE), asi que dos requests simultaneos del mismo numero
-- no pueden leer el mismo conteo viejo. Devuelve true si el mensaje entra
-- dentro del limite.

create table if not exists public.rita_rate_limit (
  telefono text primary key,
  ventana_inicio timestamptz not null default now(),
  conteo integer not null default 0
);

-- Mismo criterio que 20260924_cierra_tablas_rita_soporte.sql: solo la usa
-- rita-v2 con la service role. La migracion 20260923 deja privilegios por
-- defecto para anon/authenticated en tablas nuevas, por eso el REVOKE es
-- explicito; RLS sin politicas es la segunda barrera.
revoke all on public.rita_rate_limit from anon, authenticated;
alter table public.rita_rate_limit enable row level security;
grant select, insert, update, delete on public.rita_rate_limit to service_role;

create or replace function public.rita_check_rate_limit(
  p_telefono text,
  p_max integer,
  p_ventana_segundos integer
)
returns boolean
language sql
set search_path = public
as $$
  insert into public.rita_rate_limit as r (telefono, ventana_inicio, conteo)
  values (p_telefono, now(), 1)
  on conflict (telefono) do update set
    ventana_inicio = case
      when r.ventana_inicio < now() - make_interval(secs => p_ventana_segundos) then now()
      else r.ventana_inicio
    end,
    conteo = case
      when r.ventana_inicio < now() - make_interval(secs => p_ventana_segundos) then 1
      else r.conteo + 1
    end
  returning conteo <= p_max;
$$;

revoke execute on function public.rita_check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rita_check_rate_limit(text, integer, integer) to service_role;
