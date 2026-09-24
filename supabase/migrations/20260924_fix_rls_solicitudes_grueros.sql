-- Corrección de seguridad — auditoría de septiembre 2026.
--
-- Estado que se encontró en producción (no estaba en ninguna migración; las
-- políticas se habían creado directo en el dashboard):
--
--   solicitudes  → políticas RLS con USING/WITH CHECK (true) para anon y public,
--                  tanto en SELECT como en UPDATE. En la práctica: cualquiera
--                  con la clave anon (que está a la vista en el HTML público)
--                  podía leer la tabla completa —nombre, teléfono y ubicación
--                  de todos los clientes— y modificar cualquier fila.
--   grueros      → "Gruero edita su perfil" permitía a un gruero autenticado
--                  cambiar cualquier columna de su propia fila por PATCH
--                  directo, incluida `aprobado`: podía auto-aprobarse sin
--                  pasar por el administrador.
--
-- Verificado en el código antes de cerrar: ningún flujo legítimo dependía de
-- esos permisos. Los cambios de estado del servicio van por la función
-- aceptar-solicitud (service_role); index.html y grua.html sólo leen el `id`
-- que devuelve el insert; seguimiento.html y mi-cuenta.html sólo leen columnas
-- no sensibles; aceptar.html recibe el nombre y teléfono del cliente desde
-- aceptar-solicitud, que corre con service_role y no le aplican estos grants.

-- ── 1. solicitudes: se cierra la escritura abierta ─────────────────────────
-- Sin política de UPDATE, RLS deniega por defecto: un anónimo puede lanzar el
-- UPDATE pero afecta 0 filas.
DROP POLICY IF EXISTS "Actualizar solicitudes"     ON public.solicitudes;
DROP POLICY IF EXISTS "anon actualiza solicitudes" ON public.solicitudes;

-- ── 2. solicitudes: lectura pública, pero sin datos personales ─────────────
-- El seguimiento por enlace sin iniciar sesión es intencional (es el producto:
-- quien tiene el link ve su servicio). Lo que no debe ser público es el dato
-- personal, así que el recorte se hace por columna, no por fila.
--
-- Nota: revocar por columna NO basta si el rol tiene un GRANT amplio a nivel
-- de tabla — en Postgres ese gana. Hay que quitar el permiso de tabla y
-- devolver sólo las columnas que se necesitan.
DROP POLICY IF EXISTS "Leer solicitudes"       ON public.solicitudes;
DROP POLICY IF EXISTS "Leer solicitud publica" ON public.solicitudes;
DROP POLICY IF EXISTS "anon lee solicitudes"   ON public.solicitudes;

CREATE POLICY "Leer solicitud por enlace publico"
  ON public.solicitudes
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE SELECT ON public.solicitudes FROM anon, authenticated;
GRANT SELECT (
  id, ubicacion, estado, gruero_id, created_at, updated_at, gruero_asignado,
  asignada_at, en_camino_at, llego_at, finalizada_at, calificacion,
  confirmada_at, calificacion_at, sin_aceptar_avisado_at, no_llego_avisado_at,
  municipio, gruero_lat, gruero_lng, msg_cal_sent, msg_followup_sent
) ON public.solicitudes TO anon, authenticated;

-- ── 3. grueros: el gruero edita su perfil, pero no su propia aprobación ────
REVOKE UPDATE ON public.grueros FROM anon, authenticated;
GRANT UPDATE (
  id, nombre, telefono, zona, placa, disponible, created_at, datos,
  email, ciudad, municipios, slug, auth_id, geo
) ON public.grueros TO anon, authenticated;
