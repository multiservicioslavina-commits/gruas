-- ─────────────────────────────────────────────────────────────────
-- Hoja de Vida del Motero — Phase 0: Motorcycle Identity Foundation
--
-- Ridera pivots to be motorcycle-centric: every physical motorcycle
-- gets a permanent, unique RDR-XXXXX identity that persists across
-- ownership changes. `rider_motorcycles` becomes the ownership
-- record (who has/had this motorcycle and when), while
-- `motorcycle_identity` holds the bike's own specs and lifecycle
-- state. This is purely additive — no existing table is dropped and
-- no existing column is removed, so current app code that still
-- reads riders.moto_* keeps working unchanged.
-- ─────────────────────────────────────────────────────────────────

-- 1. Sequence + helper for RDR-XXXXX identity codes
CREATE SEQUENCE IF NOT EXISTS motorcycle_rdr_seq START 1;

CREATE OR REPLACE FUNCTION generate_rdr_id() RETURNS TEXT AS $$
  SELECT 'RDR-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('motorcycle_rdr_seq')::text, 6, '0');
$$ LANGUAGE sql;

-- 2. motorcycle_identity — one row per physical motorcycle, forever
CREATE TABLE IF NOT EXISTS motorcycle_identity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rdr_id TEXT NOT NULL UNIQUE DEFAULT generate_rdr_id(),

  -- Identificación física (lo que no cambia con el dueño)
  placa VARCHAR(20) UNIQUE,
  vin VARCHAR(50),
  motor_number VARCHAR(50),

  -- Ficha técnica
  marca VARCHAR(50) NOT NULL,
  modelo VARCHAR(100) NOT NULL,
  cc INTEGER,
  anio INTEGER,
  color VARCHAR(50),
  capacidad_combustible FLOAT,
  consumo_promedio FLOAT,
  tipo_aceite VARCHAR(50),
  capacidad_aceite FLOAT,

  -- Estado de vida de la moto
  estado VARCHAR(20) NOT NULL DEFAULT 'activa', -- activa, retirada, robada
  verified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT motorcycle_identity_estado_check
    CHECK (estado IN ('activa', 'retirada', 'robada'))
);

CREATE INDEX IF NOT EXISTS idx_motorcycle_identity_placa ON motorcycle_identity(placa);
CREATE INDEX IF NOT EXISTS idx_motorcycle_identity_vin ON motorcycle_identity(vin);
CREATE INDEX IF NOT EXISTS idx_motorcycle_identity_rdr_id ON motorcycle_identity(rdr_id);

ALTER TABLE motorcycle_identity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_access" ON motorcycle_identity
  FOR ALL USING (auth.role() = 'service_role');

-- 3. rider_motorcycles becomes the ownership record — link it to identity
--    and add the fields needed to track ownership history / transfers.
ALTER TABLE rider_motorcycles ADD COLUMN IF NOT EXISTS
  motorcycle_id UUID REFERENCES motorcycle_identity(id) ON DELETE CASCADE;
ALTER TABLE rider_motorcycles ADD COLUMN IF NOT EXISTS
  fecha_fin_propiedad DATE; -- NULL = dueño actual
ALTER TABLE rider_motorcycles ADD COLUMN IF NOT EXISTS
  documento_transferencia TEXT; -- link al comprobante de traspaso
ALTER TABLE rider_motorcycles ADD COLUMN IF NOT EXISTS
  notas_privadas TEXT; -- visibles solo para este dueño, nunca se transfieren

CREATE INDEX IF NOT EXISTS idx_rider_motorcycles_motorcycle_id ON rider_motorcycles(motorcycle_id);

-- Un rider solo puede tener un registro de propiedad "activo" (sin fecha_fin) por moto
CREATE UNIQUE INDEX IF NOT EXISTS uq_rider_motorcycles_current_owner
  ON rider_motorcycles(motorcycle_id)
  WHERE fecha_fin_propiedad IS NULL AND motorcycle_id IS NOT NULL;

-- 4. Backfill: crear motorcycle_identity + rider_motorcycles a partir de los
--    datos ya existentes en riders.moto_* (hoy la única fuente real de datos).
--    Idempotente: no vuelve a insertar si el rider ya tiene un registro de
--    propiedad activo. Procesa rider por rider (en vez de un JOIN masivo)
--    porque varios riders sin placa comparten marca+modelo (ej. dos "Honda
--    CBR500R" distintas) y un JOIN por esos campos los cruzaría entre sí.
DO $$
DECLARE
  r RECORD;
  moto_id UUID;
  clean_placa TEXT;
  clean_marca TEXT;
  clean_modelo TEXT;
BEGIN
  FOR r IN
    SELECT id, placa, moto_marca, moto_modelo, moto_cc
    FROM riders
    WHERE (moto_marca IS NOT NULL OR placa IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM rider_motorcycles rm
        WHERE rm.rider_id = riders.id AND rm.fecha_fin_propiedad IS NULL
      )
  LOOP
    clean_placa := NULLIF(TRIM(r.placa), '');
    clean_marca := COALESCE(NULLIF(TRIM(r.moto_marca), ''), 'Sin especificar');
    clean_modelo := COALESCE(NULLIF(TRIM(r.moto_modelo), ''), 'Sin especificar');
    moto_id := NULL;

    IF clean_placa IS NOT NULL THEN
      SELECT id INTO moto_id FROM motorcycle_identity WHERE placa = clean_placa;
    END IF;

    IF moto_id IS NULL THEN
      INSERT INTO motorcycle_identity (placa, marca, modelo, cc, estado)
      VALUES (clean_placa, clean_marca, clean_modelo, r.moto_cc, 'activa')
      RETURNING id INTO moto_id;
    END IF;

    INSERT INTO rider_motorcycles (rider_id, motorcycle_id, marca, modelo, cc, placa, esta_activa)
    VALUES (r.id, moto_id, clean_marca, clean_modelo, r.moto_cc, clean_placa, TRUE);
  END LOOP;
END $$;

COMMENT ON TABLE motorcycle_identity IS
  'Identidad permanente de cada motocicleta (RDR-XXXXX). Persiste a través de cambios de dueño.';
COMMENT ON COLUMN rider_motorcycles.motorcycle_id IS
  'FK a motorcycle_identity. rider_motorcycles ahora funciona como el registro de propiedad (quién tiene/tuvo esta moto y cuándo).';
