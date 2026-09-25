-- Rotacion de CRON_SECRET — auditoria de septiembre 2026.
--
-- El secreto compartido de los cron internos estaba escrito en claro en cinco
-- edge functions y en tres migraciones de este repo, que es publico. Cualquiera
-- podia disparar a mano recordatorios, el despacho de relojes, la sincronizacion
-- de WordPress y el envio de alertas de pico y placa.
--
-- Ya se hizo: se genero un valor nuevo, se guardo como variable CRON_SECRET en
-- Supabase (Edge Functions -> Secrets) y se quito el valor de respaldo del
-- codigo de las cinco funciones, que ahora fallan cerradas si la variable no
-- esta configurada.
--
-- Falta el otro lado: los cron llevaban el valor escrito dentro del comando, asi
-- que rotarlo obligaba a reescribir cada job — y volver a dejar el secreto en el
-- repo en cuanto la migracion se versionara. Se cambian para que lo lean del
-- Vault en cada ejecucion. Asi:
--
--   * el valor no vuelve a aparecer en el repo, ni aqui ni en el codigo;
--   * la proxima rotacion es un solo UPDATE al Vault, sin tocar los jobs;
--   * volver a correr esta migracion es inofensivo — no reinstala un secreto
--     viejo, que era el riesgo real de las migraciones anteriores.
--
-- El secreto se crea aparte y NO es parte de esta migracion (mismo criterio que
-- rita_rag_vault_secret.sql para voyage_api_key):
--   select vault.create_secret('<valor>', 'cron_secret', 'Secreto de los cron internos');
--
-- Los cron corren como el rol postgres, que lee vault.decrypted_secrets.
--
-- rita-broadcast-daily NO se toca: valida contra BROADCAST_SECRET, que es otra
-- variable distinta y se atiende por separado.

do $$
declare
  j        record;
  v_nuevo  constant text :=
    '(select decrypted_secret from vault.decrypted_secrets where name = ''cron_secret'')';
begin
  for j in
    select jobid, command
      from cron.job
     where jobname in ('recordatorios-diarios',
                       'relojes-despacho',
                       'rita-recordatorios-diarios',
                       'wp-content-sync-6h',
                       'alerta-diaria-pico-placa')
       and command not like '%decrypted_secrets%'
  loop
    -- Sustituye el literal que venga en el comando (cualquiera que sea) por la
    -- lectura del Vault. El patron es siempre el tercer argumento de
    -- jsonb_build_object(...,'x-ridera-cron','<secreto>').
    perform cron.alter_job(
      j.jobid,
      command := regexp_replace(
        j.command,
        '(''x-ridera-cron''\s*,\s*)''[^'']*''',
        '\1' || v_nuevo,
        'g')
    );
  end loop;
end $$;
