-- Un solo despachador para rita_seguimiento
--
-- Tres crons leian la misma cola de recordatorios y la marcaban completada:
--
--   rita-push-hourly           0 * * * *   -> rita-push
--   rita-recordatorios-diarios 0 15 * * *  -> rita-recordatorios
--   rita-broadcast-daily       0 13 * * *  -> rita-broadcast (doSeguimientos)
--
-- El recordatorio salia por el que corriera primero. Como rita-push corria
-- cada hora, casi siempre ganaba, y el rider recibia su texto generico en vez
-- del camino de rita-recordatorios, que es el unico que respeta el
-- consentimiento revocado, reintenta los fallos transitorios y cae a la
-- plantilla recordatorio_soat_promo cuando esta fuera de la ventana de 24h.
-- Ademas habia una ventana de carrera en la que dos podian enviar el mismo
-- recordatorio dos veces.
--
-- Queda rita-recordatorios como unico despachador, y pasa a horaria para
-- conservar la latencia que daba rita-push.
--
-- doSeguimientos() se retiro de rita-broadcast en el codigo de la funcion.
-- Revertir: cron.alter_job(5, active := true);
--           cron.alter_job(4, schedule := '0 15 * * *');

SELECT cron.alter_job(5, active := false);
SELECT cron.alter_job(4, schedule := '0 * * * *');
