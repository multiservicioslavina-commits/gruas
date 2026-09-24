-- Corrección de seguridad — auditoría de septiembre 2026 (segunda tanda).
--
-- El linter de Supabase marcaba tres tablas como "RLS disabled in public".
-- Verificado contra producción: además de no tener RLS, las tres tenían
-- concedidos SELECT/INSERT/UPDATE/DELETE/TRUNCATE a anon y authenticated.
-- Con la clave publica (visible en el HTML de cualquier pagina) se podia:
--
--   support_escalations        -> leer y borrar los escalamientos a soporte
--                                 humano: user_phone, user_name, reason y
--                                 context_summary. Datos personales.
--   rita_respuestas_almacenadas-> leer el historial de Rita ligado a telefono
--                                 (telefono + pregunta_original), y borrarlo.
--   rita_tramites_detallados   -> reescribir la base de conocimiento de tramites
--                                 que Rita repite a los usuarios como
--                                 informacion oficial (11 filas curadas).
--
-- Las dos primeras estaban vacias al momento de la correccion, asi que no hubo
-- fuga; se habrian ido llenando con el primer escalamiento.
--
-- Quien las usa de verdad: rita-v2 (index.ts y knowledge.ts), rita-whatsapp,
-- admin-grueros y netlify/functions/lib/supabase.js. Los cinco se conectan con
-- SUPABASE_SERVICE_ROLE_KEY, que se salta tanto RLS como los GRANT. Por eso
-- quitar el acceso publico no afecta a nada.
--
-- Se hacen las dos cosas a proposito: el REVOKE es la correccion real (sin
-- permiso no hay acceso), y el ENABLE ROW LEVEL SECURITY es la segunda barrera
-- por si alguien vuelve a conceder el permiso mas adelante — sin politicas,
-- RLS deniega por defecto.
--
-- NO se toca la vista riders_public: el linter la marca por ser SECURITY
-- DEFINER, pero eso es justo lo que la hace segura. Proyecta solo columnas
-- publicas de riders (id, nombre, apellido, ciudad, moto_*, foto_url, slug) y
-- deja fuera telefono, correo y documento. Es el perfil publico del rider.

REVOKE ALL ON public.support_escalations         FROM anon, authenticated;
REVOKE ALL ON public.rita_respuestas_almacenadas FROM anon, authenticated;
REVOKE ALL ON public.rita_tramites_detallados    FROM anon, authenticated;

ALTER TABLE public.support_escalations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rita_respuestas_almacenadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rita_tramites_detallados    ENABLE ROW LEVEL SECURITY;
