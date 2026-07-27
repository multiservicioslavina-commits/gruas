-- Envio diario de los recordatorios que Rita crea con crear_recordatorio.
-- 15:00 UTC = 10:00 a.m. en Colombia. Las 14:00 ya las ocupa
-- 'recordatorios-diarios' (vencimientos de SOAT y tecnomecanica), que lee
-- otra tabla y no tiene relacion con esto.
select cron.schedule(
  'rita-recordatorios-diarios',
  '0 15 * * *',
  $cron$
  select net.http_post(
    url := 'https://vzzxsdtsaahhzyctvmhx.supabase.co/functions/v1/rita-recordatorios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ridera-cron', 'rid3ra_cron_2026'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
