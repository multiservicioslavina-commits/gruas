-- ─────────────────────────────────────────────────────────────────
-- Hoja de Vida del Motero — Phase 1: Technical History
--
-- Historial técnico completo de cada motocicleta, anclado a
-- motorcycle_identity (no al rider), para que sobreviva cambios de
-- dueño: mantenimiento, reparaciones, llantas y batería.
-- rider_documents se extiende con motorcycle_id para que el
-- historial de SOAT/técnico-mecánica también siga a la moto.
-- Todo aditivo, ninguna tabla ni columna existente se modifica en
-- forma incompatible.
-- ─────────────────────────────────────────────────────────────────

-- 1. motorcycle_maintenance_log — mantenimiento (aceite, filtros, frenos, etc)
CREATE TABLE IF NOT EXISTS motorcycle_maintenance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motorcycle_id UUID NOT NULL REFERENCES motorcycle_identity(id) ON DELETE CASCADE,
  rider_id UUID REFERENCES riders(id) ON DELETE SET NULL, -- dueño al momento del servicio

  km_actual INTEGER,
  tipo_mantenimiento VARCHAR(50) NOT NULL,
  -- cambio_aceite, cambio_filtros, revision_frenos, limpieza_cadena,
  -- revision_neumaticos, inspeccion_general, otro

  fecha_servicio DATE NOT NULL DEFAULT CURRENT_DATE,
  proveedor VARCHAR(200),
  costo NUMERIC(10, 2),
  resultado TEXT,

  proxima_fecha_recomendada DATE,
  proximo_km_recomendado INTEGER,

  documento TEXT, -- link a factura/comprobante

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT motorcycle_maintenance_tipo_check CHECK (tipo_mantenimiento IN (
    'cambio_aceite', 'cambio_filtros', 'revision_frenos', 'limpieza_cadena',
    'revision_neumaticos', 'inspeccion_general', 'otro'
  ))
);

CREATE INDEX IF NOT EXISTS idx_maintenance_log_motorcycle ON motorcycle_maintenance_log(motorcycle_id, fecha_servicio DESC);

-- 2. motorcycle_repairs — reparaciones (lo que se rompió y qué se hizo)
CREATE TABLE IF NOT EXISTS motorcycle_repairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motorcycle_id UUID NOT NULL REFERENCES motorcycle_identity(id) ON DELETE CASCADE,
  rider_id UUID REFERENCES riders(id) ON DELETE SET NULL,

  tipo_reparacion VARCHAR(50) NOT NULL,
  -- motor, transmision, frenos, suspension, electricidad, carroceria, otro

  descripcion TEXT,
  fecha_inicio DATE,
  fecha_finalizacion DATE,
  proveedor VARCHAR(200),

  costo_piezas NUMERIC(10, 2),
  costo_mano_obra NUMERIC(10, 2),
  costo_total NUMERIC(10, 2),

  diagnostico TEXT,
  garantia_hasta DATE,
  documento TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT motorcycle_repairs_tipo_check CHECK (tipo_reparacion IN (
    'motor', 'transmision', 'frenos', 'suspension', 'electricidad', 'carroceria', 'otro'
  ))
);

CREATE INDEX IF NOT EXISTS idx_repairs_motorcycle ON motorcycle_repairs(motorcycle_id, fecha_inicio DESC);

-- 3. motorcycle_tires — seguimiento de llantas (componente crítico de seguridad)
CREATE TABLE IF NOT EXISTS motorcycle_tires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motorcycle_id UUID NOT NULL REFERENCES motorcycle_identity(id) ON DELETE CASCADE,

  posicion VARCHAR(20) NOT NULL, -- delantera, trasera
  marca VARCHAR(50),
  modelo VARCHAR(100),
  medida VARCHAR(30), -- ej. 110/80-17

  fecha_instalacion DATE,
  km_instalacion INTEGER,

  profundidad_banda_mm NUMERIC(4, 1),
  fecha_ultima_medicion DATE,
  km_ultima_medicion INTEGER,
  danios_observados TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT motorcycle_tires_posicion_check CHECK (posicion IN ('delantera', 'trasera'))
);

CREATE INDEX IF NOT EXISTS idx_tires_motorcycle ON motorcycle_tires(motorcycle_id);

-- 4. motorcycle_battery — historial de batería
CREATE TABLE IF NOT EXISTS motorcycle_battery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motorcycle_id UUID NOT NULL REFERENCES motorcycle_identity(id) ON DELETE CASCADE,

  marca VARCHAR(50),
  modelo VARCHAR(100),
  amperios NUMERIC(5, 1), -- Ah
  tipo VARCHAR(20), -- AGM, Gel, Litio, Plomo-Acido

  fecha_instalacion DATE,
  km_instalacion INTEGER,

  voltaje_ultima_medicion NUMERIC(4, 2),
  fecha_ultima_medicion DATE,
  vida_util_meses INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_battery_motorcycle ON motorcycle_battery(motorcycle_id);

-- RLS: mismo patrón que el resto del sistema — solo service_role escribe/lee
ALTER TABLE motorcycle_maintenance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE motorcycle_repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE motorcycle_tires ENABLE ROW LEVEL SECURITY;
ALTER TABLE motorcycle_battery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_access" ON motorcycle_maintenance_log
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON motorcycle_repairs
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON motorcycle_tires
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON motorcycle_battery
  FOR ALL USING (auth.role() = 'service_role');

-- 5. rider_documents — enlazar a motorcycle_identity para que el historial de
--    SOAT/técnico-mecánica siga a la moto, no solo al dueño actual.
ALTER TABLE rider_documents ADD COLUMN IF NOT EXISTS
  motorcycle_id UUID REFERENCES motorcycle_identity(id) ON DELETE CASCADE;
ALTER TABLE rider_documents ADD COLUMN IF NOT EXISTS
  fecha_expedicion DATE;
ALTER TABLE rider_documents ADD COLUMN IF NOT EXISTS
  documento_scan TEXT; -- link al PDF/foto del documento
ALTER TABLE rider_documents ADD COLUMN IF NOT EXISTS
  costo NUMERIC(10, 2);
ALTER TABLE rider_documents ADD COLUMN IF NOT EXISTS
  expedido_por VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_rider_documents_motorcycle_id ON rider_documents(motorcycle_id);

-- Backfill: enlazar documentos ya existentes con moto_id (rider_motorcycles)
-- a su motorcycle_identity correspondiente.
UPDATE rider_documents rd
SET motorcycle_id = rm.motorcycle_id
FROM rider_motorcycles rm
WHERE rd.moto_id = rm.id
  AND rd.motorcycle_id IS NULL
  AND rm.motorcycle_id IS NOT NULL;

COMMENT ON TABLE motorcycle_maintenance_log IS 'Historial de mantenimiento por motorcycle_identity — sobrevive cambios de dueño.';
COMMENT ON TABLE motorcycle_repairs IS 'Historial de reparaciones por motorcycle_identity — sobrevive cambios de dueño.';
COMMENT ON TABLE motorcycle_tires IS 'Seguimiento de llantas por motorcycle_identity.';
COMMENT ON TABLE motorcycle_battery IS 'Historial de batería por motorcycle_identity.';
