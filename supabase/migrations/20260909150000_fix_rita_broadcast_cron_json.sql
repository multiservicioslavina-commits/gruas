-- ─────────────────────────────────────────────────────────────────
-- Corrige el Job 3 de pg_cron (rita-broadcast-daily), que fallaba
-- TODOS los días con "ERROR: invalid input syntax for type json".
--
-- Causa real: no era un problema de escape de comillas, sino de
-- precedencia de operadores en Postgres. El comando anterior era:
--
--   headers := '{"Content-Type":"...","x-broadcast-secret":"'
--            || current_setting('app.broadcast_secret', true)
--            || '"}'::jsonb
--
-- `::` liga MAS FUERTE que `||`, asi que el cast a jsonb se aplicaba
-- solo al ultimo literal ('"}'), que no es JSON valido por si mismo
-- -- nunca a la concatenacion completa. Ademas, ni app.supabase_url
-- ni app.broadcast_secret existen como GUC en este proyecto
-- (current_setting(...) devuelve NULL / lanza "unrecognized
-- configuration parameter"), asi que el job tampoco habria funcionado
-- aunque se arreglara el cast.
--
-- Fix: jsonb_build_object(...) (mismo patron que el resto de los
-- cron jobs de este proyecto) con la URL literal del proyecto. La
-- funcion rita-broadcast solo exige x-broadcast-secret cuando el
-- secreto BROADCAST_SECRET esta configurado (falla abierto si no);
-- se manda igual el secreto de cron estandar del proyecto para que
-- quede protegida el dia que se configure ese secreto.
-- ─────────────────────────────────────────────────────────────────

-- Por jobname, no por jobid: el id numerico depende del orden de
-- creacion de jobs y no es estable entre entornos.
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'rita-broadcast-daily';
  if v_job_id is not null then
    perform cron.alter_job(
      job_id := v_job_id,
      command := $cmd$
      select net.http_post(
        url := 'https://vzzxsdtsaahhzyctvmhx.supabase.co/functions/v1/rita-broadcast',
        headers := jsonb_build_object('Content-Type','application/json','x-broadcast-secret','rid3ra_cron_2026'),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
      $cmd$
    );
  end if;
end $$;
