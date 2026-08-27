-- ═══════════════════════════════════════════════════════════════════════════
-- Ridera Taller — Software de gestión para talleres de motos
--
-- Extiende la tabla `talleres` (directorio público) con un sistema completo
-- de gestión: equipo, clientes, motos, órdenes de servicio, inventario de
-- repuestos, pagos e historial.
--
-- Todo el acceso está protegido por RLS: un usuario sólo ve los datos del
-- taller (o talleres) donde está registrado como miembro del equipo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. Columnas nuevas en `talleres` ──────────────────────────────────────
ALTER TABLE talleres ADD COLUMN IF NOT EXISTS slug        TEXT;
ALTER TABLE talleres ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE talleres ADD COLUMN IF NOT EXISTS software_at TIMESTAMPTZ;  -- cuándo activó el software

CREATE UNIQUE INDEX IF NOT EXISTS talleres_slug_uniq ON talleres (slug) WHERE slug IS NOT NULL;

-- ── 1. Equipo del taller (membresía auth.users ↔ talleres) ────────────────
CREATE TABLE IF NOT EXISTS taller_equipo (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id   UUID NOT NULL REFERENCES talleres(id) ON DELETE CASCADE,
  auth_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre      TEXT,
  email       TEXT,
  rol         TEXT NOT NULL DEFAULT 'dueno'
              CHECK (rol IN ('dueno', 'admin', 'mecanico', 'recepcion')),
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (taller_id, auth_id)
);

CREATE INDEX IF NOT EXISTS taller_equipo_auth   ON taller_equipo (auth_id);
CREATE INDEX IF NOT EXISTS taller_equipo_taller ON taller_equipo (taller_id);

-- Helper SECURITY DEFINER: evita recursión de RLS al evaluar membresía.
CREATE OR REPLACE FUNCTION taller_es_miembro(p_taller UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM taller_equipo
    WHERE taller_id = p_taller
      AND auth_id = auth.uid()
      AND activo
  );
$$;

-- ── 2. Clientes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taller_clientes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id   UUID NOT NULL REFERENCES talleres(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  telefono    TEXT,
  email       TEXT,
  documento   TEXT,
  direccion   TEXT,
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS taller_clientes_taller ON taller_clientes (taller_id);
CREATE INDEX IF NOT EXISTS taller_clientes_tel    ON taller_clientes (taller_id, telefono);

-- ── 3. Motos ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taller_motos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id   UUID NOT NULL REFERENCES talleres(id) ON DELETE CASCADE,
  cliente_id  UUID REFERENCES taller_clientes(id) ON DELETE SET NULL,
  placa       TEXT NOT NULL,
  marca       TEXT,
  linea       TEXT,
  modelo      INTEGER,          -- año
  cilindraje  TEXT,
  color       TEXT,
  vin         TEXT,
  km_actual   INTEGER,
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS taller_motos_placa_uniq ON taller_motos (taller_id, upper(placa));
CREATE INDEX IF NOT EXISTS taller_motos_cliente ON taller_motos (cliente_id);

-- ── 4. Inventario de repuestos ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taller_inventario (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id   UUID NOT NULL REFERENCES talleres(id) ON DELETE CASCADE,
  sku         TEXT,
  nombre      TEXT NOT NULL,
  categoria   TEXT,
  marca       TEXT,
  costo       NUMERIC(12,2) DEFAULT 0,
  precio      NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock       NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_min   NUMERIC(12,2) NOT NULL DEFAULT 0,
  ubicacion   TEXT,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS taller_inventario_taller ON taller_inventario (taller_id);
CREATE UNIQUE INDEX IF NOT EXISTS taller_inventario_sku_uniq
  ON taller_inventario (taller_id, sku) WHERE sku IS NOT NULL AND sku <> '';

-- ── 5. Órdenes de servicio ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taller_ordenes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id          UUID NOT NULL REFERENCES talleres(id) ON DELETE CASCADE,
  numero             INTEGER,            -- consecutivo por taller
  codigo             TEXT,               -- código público de seguimiento
  cliente_id         UUID REFERENCES taller_clientes(id) ON DELETE SET NULL,
  moto_id            UUID REFERENCES taller_motos(id) ON DELETE SET NULL,
  estado             TEXT NOT NULL DEFAULT 'recibida'
                     CHECK (estado IN ('recibida','diagnostico','cotizada','aprobada',
                                       'en_proceso','espera_repuestos','lista','entregada','anulada')),
  prioridad          TEXT NOT NULL DEFAULT 'normal'
                     CHECK (prioridad IN ('baja','normal','alta')),
  tecnico            TEXT,
  fecha_ingreso      TIMESTAMPTZ DEFAULT NOW(),
  fecha_promesa      TIMESTAMPTZ,
  fecha_entrega      TIMESTAMPTZ,
  km_ingreso         INTEGER,
  combustible        TEXT,
  motivo             TEXT,               -- lo que reporta el cliente
  diagnostico        TEXT,
  trabajo_realizado  TEXT,
  recomendaciones    TEXT,
  observaciones      TEXT,
  recibido           JSONB DEFAULT '{}'::jsonb,   -- casco, baúl, herramientas, etc.
  mano_obra          NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_repuestos    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_servicios    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total              NUMERIC(12,2) NOT NULL DEFAULT 0,
  pagado             NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado_pago        TEXT NOT NULL DEFAULT 'pendiente'
                     CHECK (estado_pago IN ('pendiente','parcial','pagado')),
  proximo_km         INTEGER,
  proxima_fecha      DATE,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS taller_ordenes_numero_uniq ON taller_ordenes (taller_id, numero);
CREATE UNIQUE INDEX IF NOT EXISTS taller_ordenes_codigo_uniq ON taller_ordenes (codigo);
CREATE INDEX IF NOT EXISTS taller_ordenes_taller_estado ON taller_ordenes (taller_id, estado);
CREATE INDEX IF NOT EXISTS taller_ordenes_moto    ON taller_ordenes (moto_id);
CREATE INDEX IF NOT EXISTS taller_ordenes_cliente ON taller_ordenes (cliente_id);

-- ── 6. Ítems de la orden (repuestos y servicios) ──────────────────────────
CREATE TABLE IF NOT EXISTS taller_orden_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id    UUID NOT NULL REFERENCES talleres(id) ON DELETE CASCADE,
  orden_id     UUID NOT NULL REFERENCES taller_ordenes(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL DEFAULT 'repuesto' CHECK (tipo IN ('repuesto','servicio')),
  item_id      UUID REFERENCES taller_inventario(id) ON DELETE SET NULL,
  descripcion  TEXT NOT NULL,
  cantidad     NUMERIC(12,2) NOT NULL DEFAULT 1,
  precio       NUMERIC(12,2) NOT NULL DEFAULT 0,
  costo        NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS taller_orden_items_orden ON taller_orden_items (orden_id);

-- ── 7. Movimientos de inventario ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taller_movimientos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id   UUID NOT NULL REFERENCES talleres(id) ON DELETE CASCADE,
  item_id     UUID REFERENCES taller_inventario(id) ON DELETE CASCADE,
  orden_id    UUID REFERENCES taller_ordenes(id) ON DELETE SET NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('entrada','salida','ajuste')),
  cantidad    NUMERIC(12,2) NOT NULL,
  motivo      TEXT,
  created_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS taller_movimientos_item ON taller_movimientos (item_id);

-- ── 8. Pagos ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taller_pagos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id   UUID NOT NULL REFERENCES talleres(id) ON DELETE CASCADE,
  orden_id    UUID NOT NULL REFERENCES taller_ordenes(id) ON DELETE CASCADE,
  monto       NUMERIC(12,2) NOT NULL,
  metodo      TEXT NOT NULL DEFAULT 'efectivo'
              CHECK (metodo IN ('efectivo','transferencia','tarjeta','nequi','daviplata','otro')),
  referencia  TEXT,
  nota        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS taller_pagos_orden ON taller_pagos (orden_id);

-- ── 9. Historial de estados ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taller_orden_historial (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id   UUID NOT NULL REFERENCES talleres(id) ON DELETE CASCADE,
  orden_id    UUID NOT NULL REFERENCES taller_ordenes(id) ON DELETE CASCADE,
  estado      TEXT NOT NULL,
  nota        TEXT,
  created_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS taller_orden_historial_orden ON taller_orden_historial (orden_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCIONES Y TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE talleres ADD COLUMN IF NOT EXISTS created_by UUID;

-- ¿El taller todavía no tiene equipo y lo creó este usuario? (para reclamarlo)
CREATE OR REPLACE FUNCTION taller_reclamable(p_taller UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM taller_equipo WHERE taller_id = p_taller)
     AND EXISTS (SELECT 1 FROM talleres WHERE id = p_taller AND created_by = auth.uid());
$$;

CREATE OR REPLACE FUNCTION taller_es_admin(p_taller UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM taller_equipo
    WHERE taller_id = p_taller AND auth_id = auth.uid()
      AND activo AND rol IN ('dueno','admin')
  );
$$;

-- ── updated_at genérico ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION taller_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch ON taller_clientes;
CREATE TRIGGER trg_touch BEFORE UPDATE ON taller_clientes
  FOR EACH ROW EXECUTE FUNCTION taller_touch();

DROP TRIGGER IF EXISTS trg_touch ON taller_motos;
CREATE TRIGGER trg_touch BEFORE UPDATE ON taller_motos
  FOR EACH ROW EXECUTE FUNCTION taller_touch();

DROP TRIGGER IF EXISTS trg_touch ON taller_inventario;
CREATE TRIGGER trg_touch BEFORE UPDATE ON taller_inventario
  FOR EACH ROW EXECUTE FUNCTION taller_touch();

-- ── Consecutivo, código público y totales de la orden ─────────────────────
CREATE OR REPLACE FUNCTION taller_orden_before()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_codigo TEXT;
  v_try    INT := 0;
BEGIN
  IF NEW.numero IS NULL THEN
    -- Serializa la asignación del consecutivo por taller.
    PERFORM pg_advisory_xact_lock(hashtext('taller_orden:' || NEW.taller_id::text));
    SELECT COALESCE(MAX(numero), 0) + 1 INTO NEW.numero
      FROM taller_ordenes WHERE taller_id = NEW.taller_id;
  END IF;

  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    LOOP
      v_try := v_try + 1;
      v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM taller_ordenes WHERE codigo = v_codigo) OR v_try > 20;
    END LOOP;
    NEW.codigo := v_codigo;
  END IF;

  NEW.total := GREATEST(
    COALESCE(NEW.total_repuestos,0) + COALESCE(NEW.total_servicios,0)
    + COALESCE(NEW.mano_obra,0) - COALESCE(NEW.descuento,0), 0);

  NEW.estado_pago := CASE
    WHEN COALESCE(NEW.pagado,0) <= 0 THEN 'pendiente'
    WHEN COALESCE(NEW.pagado,0) >= NEW.total THEN 'pagado'
    ELSE 'parcial'
  END;

  IF NEW.estado = 'entregada' AND NEW.fecha_entrega IS NULL THEN
    NEW.fecha_entrega := NOW();
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orden_before ON taller_ordenes;
CREATE TRIGGER trg_orden_before BEFORE INSERT OR UPDATE ON taller_ordenes
  FOR EACH ROW EXECUTE FUNCTION taller_orden_before();

-- ── Recalcular subtotales cuando cambian los ítems ────────────────────────
CREATE OR REPLACE FUNCTION taller_items_after()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_orden UUID := COALESCE(NEW.orden_id, OLD.orden_id);
BEGIN
  UPDATE taller_ordenes o SET
    total_repuestos = COALESCE((SELECT SUM(cantidad * precio) FROM taller_orden_items
                                WHERE orden_id = v_orden AND tipo = 'repuesto'), 0),
    total_servicios = COALESCE((SELECT SUM(cantidad * precio) FROM taller_orden_items
                                WHERE orden_id = v_orden AND tipo = 'servicio'), 0)
  WHERE o.id = v_orden;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_items_after ON taller_orden_items;
CREATE TRIGGER trg_items_after AFTER INSERT OR UPDATE OR DELETE ON taller_orden_items
  FOR EACH ROW EXECUTE FUNCTION taller_items_after();

-- ── Descontar / devolver stock según los repuestos de la orden ────────────
CREATE OR REPLACE FUNCTION taller_items_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_delta NUMERIC;
BEGIN
  -- Devuelve al inventario lo que consumía la fila anterior
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.tipo = 'repuesto' AND OLD.item_id IS NOT NULL THEN
    UPDATE taller_inventario SET stock = stock + OLD.cantidad WHERE id = OLD.item_id;
    INSERT INTO taller_movimientos (taller_id, item_id, orden_id, tipo, cantidad, motivo, created_by)
    VALUES (OLD.taller_id, OLD.item_id, OLD.orden_id, 'entrada', OLD.cantidad,
            'Reverso de orden', auth.uid());
  END IF;

  -- Descuenta lo que consume la fila nueva
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.tipo = 'repuesto' AND NEW.item_id IS NOT NULL THEN
    UPDATE taller_inventario SET stock = stock - NEW.cantidad WHERE id = NEW.item_id;
    INSERT INTO taller_movimientos (taller_id, item_id, orden_id, tipo, cantidad, motivo, created_by)
    VALUES (NEW.taller_id, NEW.item_id, NEW.orden_id, 'salida', NEW.cantidad,
            'Consumo en orden', auth.uid());
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_items_stock ON taller_orden_items;
CREATE TRIGGER trg_items_stock AFTER INSERT OR UPDATE OR DELETE ON taller_orden_items
  FOR EACH ROW EXECUTE FUNCTION taller_items_stock();

-- ── Recalcular lo pagado ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION taller_pagos_after()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_orden UUID := COALESCE(NEW.orden_id, OLD.orden_id);
BEGIN
  UPDATE taller_ordenes SET
    pagado = COALESCE((SELECT SUM(monto) FROM taller_pagos WHERE orden_id = v_orden), 0)
  WHERE id = v_orden;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_pagos_after ON taller_pagos;
CREATE TRIGGER trg_pagos_after AFTER INSERT OR UPDATE OR DELETE ON taller_pagos
  FOR EACH ROW EXECUTE FUNCTION taller_pagos_after();

-- ── Historial de estados ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION taller_orden_historial_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO taller_orden_historial (taller_id, orden_id, estado, created_by)
    VALUES (NEW.taller_id, NEW.id, NEW.estado, auth.uid());
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_orden_historial ON taller_ordenes;
CREATE TRIGGER trg_orden_historial AFTER INSERT OR UPDATE ON taller_ordenes
  FOR EACH ROW EXECUTE FUNCTION taller_orden_historial_fn();

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- Un usuario sólo ve y escribe datos del taller donde es miembro del equipo.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE taller_equipo          ENABLE ROW LEVEL SECURITY;
ALTER TABLE taller_clientes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE taller_motos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE taller_inventario      ENABLE ROW LEVEL SECURITY;
ALTER TABLE taller_ordenes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE taller_orden_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE taller_movimientos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE taller_pagos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE taller_orden_historial ENABLE ROW LEVEL SECURITY;

-- taller_equipo: veo mi membresía y la de mis compañeros de taller.
DROP POLICY IF EXISTS equipo_select ON taller_equipo;
CREATE POLICY equipo_select ON taller_equipo FOR SELECT TO authenticated
  USING (auth_id = auth.uid() OR taller_es_miembro(taller_id));

-- Alta: me registro yo mismo en un taller que acabo de crear (sin equipo aún),
-- o un dueño/admin agrega a alguien de su equipo.
DROP POLICY IF EXISTS equipo_insert ON taller_equipo;
CREATE POLICY equipo_insert ON taller_equipo FOR INSERT TO authenticated
  WITH CHECK (
    (auth_id = auth.uid() AND taller_reclamable(taller_id))
    OR taller_es_admin(taller_id)
  );

DROP POLICY IF EXISTS equipo_update ON taller_equipo;
CREATE POLICY equipo_update ON taller_equipo FOR UPDATE TO authenticated
  USING (taller_es_admin(taller_id)) WITH CHECK (taller_es_admin(taller_id));

DROP POLICY IF EXISTS equipo_delete ON taller_equipo;
CREATE POLICY equipo_delete ON taller_equipo FOR DELETE TO authenticated
  USING (taller_es_admin(taller_id));

-- Resto de tablas: acceso completo para miembros del taller.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['taller_clientes','taller_motos','taller_inventario',
                           'taller_ordenes','taller_orden_items','taller_movimientos',
                           'taller_pagos','taller_orden_historial']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_miembros', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated
         USING (taller_es_miembro(taller_id))
         WITH CHECK (taller_es_miembro(taller_id))',
      t || '_miembros', t);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEGUIMIENTO PÚBLICO
-- El cliente consulta el estado de su moto con el código de la orden, sin
-- exponer las tablas: sólo los campos necesarios.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION taller_seguimiento(p_codigo TEXT)
RETURNS TABLE (
  codigo          TEXT,
  numero          INTEGER,
  estado          TEXT,
  fecha_ingreso   TIMESTAMPTZ,
  fecha_promesa   TIMESTAMPTZ,
  fecha_entrega   TIMESTAMPTZ,
  motivo          TEXT,
  diagnostico     TEXT,
  recomendaciones TEXT,
  total           NUMERIC,
  pagado          NUMERIC,
  estado_pago     TEXT,
  placa           TEXT,
  moto            TEXT,
  cliente         TEXT,
  taller          TEXT,
  taller_telefono TEXT,
  taller_ciudad   TEXT,
  historial       JSONB
)
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    o.codigo, o.numero, o.estado, o.fecha_ingreso, o.fecha_promesa, o.fecha_entrega,
    o.motivo, o.diagnostico, o.recomendaciones, o.total, o.pagado, o.estado_pago,
    upper(m.placa),
    NULLIF(trim(concat_ws(' ', m.marca, m.linea, m.modelo::text)), ''),
    split_part(COALESCE(c.nombre, ''), ' ', 1),
    t.nombre, t.telefono, t.ciudad,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('estado', h.estado, 'fecha', h.created_at)
                       ORDER BY h.created_at)
      FROM taller_orden_historial h WHERE h.orden_id = o.id
    ), '[]'::jsonb)
  FROM taller_ordenes o
  JOIN talleres t ON t.id = o.taller_id
  LEFT JOIN taller_motos m    ON m.id = o.moto_id
  LEFT JOIN taller_clientes c ON c.id = o.cliente_id
  WHERE upper(o.codigo) = upper(trim(p_codigo))
    AND o.estado <> 'anulada'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION taller_seguimiento(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION taller_seguimiento(TEXT) TO anon, authenticated;

-- Vista de trabajo para el panel: orden + cliente + moto en una sola consulta.
CREATE OR REPLACE VIEW taller_ordenes_detalle
WITH (security_invoker = true) AS
SELECT
  o.*,
  c.nombre   AS cliente_nombre,
  c.telefono AS cliente_telefono,
  m.placa    AS moto_placa,
  m.marca    AS moto_marca,
  m.linea    AS moto_linea,
  m.modelo   AS moto_modelo
FROM taller_ordenes o
LEFT JOIN taller_clientes c ON c.id = o.cliente_id
LEFT JOIN taller_motos    m ON m.id = o.moto_id;

GRANT SELECT ON taller_ordenes_detalle TO authenticated;
