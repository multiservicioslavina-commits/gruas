-- ─────────────────────────────────────────────────────────────────
-- Alerta matutina de Pico y Placa (Valle de Aburrá) — motos
--
-- No se necesita columna nueva para la placa ni para "el dígito": ya
-- existe en rider_motorcycles.placa (y en motorcycle_identity.placa
-- para las motos migradas a Hoja de Vida). El dígito se extrae en la
-- Edge Function con una expresión regular sobre ese mismo texto, así
-- que esto es puramente aditivo.
--
-- Dos piezas de datos nuevas:
--   1. festivos_colombia   — fechas donde NO aplica Pico y Placa.
--   2. pico_placa_notif_log — evita reenviar la misma alerta dos veces
--      el mismo día si el cron se reintenta o se dispara a mano.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS festivos_colombia (
  fecha DATE PRIMARY KEY,
  descripcion TEXT NOT NULL
);

ALTER TABLE festivos_colombia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_access" ON festivos_colombia
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE festivos_colombia IS
  'Festivos colombianos donde no aplica Pico y Placa. Lista de datos, no de código: si una fecha está mal o falta, se corrige con un INSERT/DELETE, sin tocar la Edge Function. Calculada para 2026 a partir del calendario fijo + Ley Emiliani (Pascua 2026-04-05); antes de depender de ella en producción, contrástala contra el calendario oficial de Función Pública.';

-- 2026: fijos (Ley 51/1983 los deja en su fecha real) + movidos al lunes
-- siguiente cuando su fecha real no cae en lunes.
INSERT INTO festivos_colombia (fecha, descripcion) VALUES
  ('2026-01-01', 'Año Nuevo'),
  ('2026-01-12', 'Reyes Magos'),
  ('2026-03-23', 'San José'),
  ('2026-04-02', 'Jueves Santo'),
  ('2026-04-03', 'Viernes Santo'),
  ('2026-05-01', 'Día del Trabajo'),
  ('2026-05-18', 'Ascensión del Señor'),
  ('2026-06-08', 'Corpus Christi'),
  ('2026-06-15', 'Sagrado Corazón de Jesús'),
  ('2026-06-29', 'San Pedro y San Pablo'),
  ('2026-07-20', 'Independencia de Colombia'),
  ('2026-08-07', 'Batalla de Boyacá'),
  ('2026-08-17', 'Asunción de la Virgen'),
  ('2026-10-12', 'Día de la Raza'),
  ('2026-11-02', 'Todos los Santos'),
  ('2026-11-16', 'Independencia de Cartagena'),
  ('2026-12-08', 'Inmaculada Concepción'),
  ('2026-12-25', 'Navidad')
ON CONFLICT (fecha) DO NOTHING;

CREATE TABLE IF NOT EXISTS pico_placa_notif_log (
  fecha DATE NOT NULL,
  telefono TEXT NOT NULL,
  digito INTEGER NOT NULL,
  enviado BOOLEAN NOT NULL,
  detalle TEXT,
  creado_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (fecha, telefono)
);

ALTER TABLE pico_placa_notif_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_access" ON pico_placa_notif_log
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE pico_placa_notif_log IS
  'Un registro por (fecha, teléfono): si el cron se reintenta o se dispara dos veces el mismo día, la Edge Function no vuelve a mandarle la alerta a quien ya la recibió hoy.';

-- 6:15 a.m. hora Colombia (America/Bogota, UTC-5 todo el año, sin horario
-- de verano) = 11:15 UTC. Lunes a viernes (1-5). El fin de semana ya queda
-- excluido aquí mismo; festivos se filtran adentro de la función via
-- festivos_colombia, porque pg_cron no sabe de festivos.
select cron.schedule(
  'alerta-diaria-pico-placa',
  '15 11 * * 1-5',
  $$
  select net.http_post(
    url := 'https://vzzxsdtsaahhzyctvmhx.supabase.co/functions/v1/alerta-pico-placa',
    headers := jsonb_build_object('Content-Type','application/json','x-ridera-cron','rid3ra_cron_2026'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
