-- Memoria estructurada de restricciones de planificacion de rutas, dentro
-- de una misma conversacion. Hasta ahora, Rita solo "recordaba" lo que
-- el rider decia gracias a los ultimos 10 mensajes que se le reenvian al
-- modelo (getHistory en index.ts) -- si una exclusion como "no quiero
-- Guatape" quedaba fuera de esa ventana porque la conversacion siguio con
-- varios mensajes mas (incluyendo llamadas a herramientas, que tambien
-- cuentan), Rita podia terminar recomendandolo de nuevo sin darse cuenta.
--
-- Esta tabla la usa planificar_ruta (rita-v2/tools.ts) para acumular
-- distancia maxima y destinos excluidos por telefono, y aplicarlos aunque
-- el rider no los repita en cada mensaje. No es una lista negra
-- permanente: expira sola tras unas horas de inactividad (ver
-- SESION_VIGENCIA_HORAS en el codigo), para no arrastrar restricciones de
-- un viaje planificado hace semanas a uno nuevo.
create table if not exists public.rita_planificacion_contexto (
  telefono text primary key,
  destinos_excluidos text[] not null default '{}',
  distancia_max_km numeric,
  preferencias text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- Mismo patron que enable_rls_remaining_tables.sql: solo se accede desde
-- las edge functions via service_role (que ignora RLS); RLS habilitado sin
-- policies bloquea cualquier acceso accidental con la llave anonima.
alter table public.rita_planificacion_contexto enable row level security;

-- Requerido desde el cambio de Supabase del 30 de octubre de 2026: las
-- tablas nuevas ya no reciben acceso automatico a la API de datos (ver
-- migracion 20260923_grants_data_api_public_schema.sql). RLS sigue siendo
-- la barrera real para anon/authenticated; este GRANT solo evita el
-- "permission denied" de la capa de API para service_role.
grant select, insert, update, delete on public.rita_planificacion_contexto to anon, authenticated, service_role;
