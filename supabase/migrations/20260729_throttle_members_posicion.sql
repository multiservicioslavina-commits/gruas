-- Throttle de escrituras de posicion en members
--
-- Contexto: la cuota de Realtime del proyecto se disparo a 3.436.691 mensajes
-- (172%) con solo 2 riders de prueba. El origen no era Rita: es la tabla
-- members, que esta en la publicacion supabase_realtime y acumulaba 1.024.435
-- UPDATE sobre apenas 67 filas. Cada UPDATE se abre en abanico hacia todos los
-- clientes suscritos al canal de esa rodada (~3,35 de media), lo que da
-- exactamente los 3,4M facturados.
--
-- La app escribia posicion unas 4 veces por segundo, cinco veces mas seguido
-- que sus propias migas de pan en route_points (mediana de 1,23 s entre
-- puntos). Este trigger recorta esa cadencia a una escritura cada 3 segundos.
--
-- Al devolver NULL en un BEFORE UPDATE la escritura se cancela por completo:
-- no hay registro WAL y por lo tanto no hay mensaje realtime ni egress.
--
-- Cualquier update que toque una columna que NO sea posicion (status_code,
-- finished_at, distance_km, video_url, etc.) pasa siempre sin filtrar, para
-- que el cierre de una rodada o un cambio de estado nunca se pierda.
--
-- Ajustar la cadencia: cambiar INTERVALO_POSICION.
-- Revertir: DROP TRIGGER members_throttle_posicion ON public.members;
--
-- Nota: se usa clock_timestamp() y no now(). now() devuelve la hora de inicio
-- de la transaccion, asi que dentro de una misma transaccion el reloj del
-- throttle no avanzaba y bloqueaba escrituras legitimas.

CREATE OR REPLACE FUNCTION public.members_throttle_posicion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  INTERVALO_POSICION constant interval := interval '3 seconds';
BEGIN
  -- Cambios semanticos: nunca se descartan
  IF  NEW.ride_id          IS DISTINCT FROM OLD.ride_id
   OR NEW.uid              IS DISTINCT FROM OLD.uid
   OR NEW.rol              IS DISTINCT FROM OLD.rol
   OR NEW.nombre           IS DISTINCT FROM OLD.nombre
   OR NEW.status_code      IS DISTINCT FROM OLD.status_code
   OR NEW.joined_at        IS DISTINCT FROM OLD.joined_at
   OR NEW.finished_at      IS DISTINCT FROM OLD.finished_at
   OR NEW.distance_km      IS DISTINCT FROM OLD.distance_km
   OR NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds
   OR NEW.max_speed_kmh    IS DISTINCT FROM OLD.max_speed_kmh
   OR NEW.video_url        IS DISTINCT FROM OLD.video_url
   OR NEW.notes            IS DISTINCT FROM OLD.notes
   OR NEW.hidden           IS DISTINCT FROM OLD.hidden
   OR NEW.emergency_name   IS DISTINCT FROM OLD.emergency_name
   OR NEW.emergency_phone  IS DISTINCT FROM OLD.emergency_phone
  THEN
    RETURN NEW;
  END IF;

  -- Desde aqui es solo un ping de posicion (lat/lon/speed_kmh/last_seen)
  IF OLD.last_seen IS NOT NULL
     AND clock_timestamp() - OLD.last_seen < INTERVALO_POSICION
  THEN
    RETURN NULL;  -- se descarta: sin WAL, sin mensaje realtime
  END IF;

  -- Se acepta: se ancla el reloj del throttle
  NEW.last_seen := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS members_throttle_posicion ON public.members;

CREATE TRIGGER members_throttle_posicion
  BEFORE UPDATE ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.members_throttle_posicion();
