-- ═══════════════════════════════════════════════════════════════════════════
--  TALLER MOTOS — Esquema de base de datos (PostgreSQL 14+)
--
--  Producto independiente de gestión para talleres de motocicletas.
--  Multi-taller (multi-tenant): cada fila cuelga de un `workshop_id` y la API
--  filtra siempre por el taller del usuario autenticado.
--
--  Convención: nombres de tabla y columna en inglés (ver docs/DATABASE.md).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Talleres y sedes ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workshops (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  legal_name   TEXT,
  tax_id       TEXT,                     -- NIT / RUT / identificación fiscal
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  city         TEXT,
  country      TEXT NOT NULL DEFAULT 'CO',
  currency     TEXT NOT NULL DEFAULT 'COP',
  tax_rate     NUMERIC(5,2) NOT NULL DEFAULT 0,   -- IVA por defecto, en %
  timezone     TEXT NOT NULL DEFAULT 'America/Bogota',
  logo_url     TEXT,
  settings     JSONB NOT NULL DEFAULT '{}'::jsonb,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Licencia del taller: con qué código se activó y hasta cuándo vale.
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS license_code       TEXT;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS license_id         TEXT;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS license_holder     TEXT;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS license_plan       TEXT;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS license_expires_at TIMESTAMPTZ;

-- Un código sirve una sola vez: el índice lo garantiza en la base, no sólo
-- en el código de la aplicación.
CREATE UNIQUE INDEX IF NOT EXISTS workshops_license_id_key
  ON workshops (license_id) WHERE license_id IS NOT NULL;

-- Códigos de activación cortos (formato TM-XXXX-XXXX). A diferencia del
-- código largo autocontenido (que lleva la firma dentro del propio texto),
-- el corto es sólo una llave de consulta al azar: aquí vive a qué plan y
-- hasta cuándo corresponde. Se emiten desde el endpoint /api/license-admin,
-- protegido con la firma de la llave privada (ver src/lib/licencia.js).
CREATE TABLE IF NOT EXISTS license_codes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 TEXT NOT NULL,
  plan                 TEXT NOT NULL DEFAULT 'completo'
                       CHECK (plan IN ('basico','completo','premium')),
  holder               TEXT,
  expires_at           TIMESTAMPTZ,
  used_by_workshop_id  UUID REFERENCES workshops(id) ON DELETE SET NULL,
  used_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS license_codes_code_key ON license_codes (upper(code));

-- Notificaciones al cliente por WhatsApp (plan pago). 'off': no envía nada.
-- 'ridera': usa la cuenta compartida de Ridera (variables de entorno del
-- servidor). 'own': el taller conectó su propia cuenta de WhatsApp Business.
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS whatsapp_mode TEXT NOT NULL DEFAULT 'off';
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS whatsapp_access_token    TEXT;

-- Facturación electrónica DIAN (plan Premium), vía Factus. Cada taller
-- factura bajo su propio NIT: no hay modo "compartido" como con WhatsApp.
-- `factus_numbering_range_id` es el rango de numeración (la resolución
-- DIAN) que ese taller eligió usar, entre los que tiene registrados en
-- Factus.
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS factus_client_id     TEXT;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS factus_client_secret TEXT;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS factus_username      TEXT;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS factus_password      TEXT;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS factus_environment   TEXT NOT NULL DEFAULT 'sandbox'
  CHECK (factus_environment IN ('sandbox','production'));
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS factus_numbering_range_id INTEGER;

-- Consecutivos por taller (órdenes, cotizaciones, facturas...).
CREATE TABLE IF NOT EXISTS sequences (
  workshop_id  UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  value        BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (workshop_id, name)
);

-- ── Usuarios y permisos ───────────────────────────────────────────────────
-- Roles: admin, reception, mechanic, warehouse, cashier.
-- El cliente final no tiene cuenta: consulta y aprueba con enlaces firmados
-- (ver work_orders.public_code y quotes.public_token).
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id    UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  name           TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'reception'
                 CHECK (role IN ('admin','reception','mechanic','warehouse','cashier')),
  phone          TEXT,
  specialty      TEXT,                    -- para mecánicos
  hourly_rate    NUMERIC(12,2),           -- para mecánicos
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_workshop_idx ON users (workshop_id);

-- Llaves de API para integraciones con plataformas externas.
CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id   UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  prefix        TEXT NOT NULL,            -- parte visible, para identificarla
  key_hash      TEXT NOT NULL,            -- hash del secreto completo
  scopes        TEXT[] NOT NULL DEFAULT ARRAY['read'],
  last_used_at  TIMESTAMPTZ,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_prefix_key ON api_keys (prefix);
CREATE INDEX IF NOT EXISTS api_keys_workshop_idx ON api_keys (workshop_id);

-- ── Clientes y motocicletas ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id      UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  document_type    TEXT,
  document_number  TEXT,
  phone            TEXT,
  email            TEXT,
  address          TEXT,
  city             TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customers_workshop_idx ON customers (workshop_id);
CREATE INDEX IF NOT EXISTS customers_phone_idx    ON customers (workshop_id, phone);
CREATE INDEX IF NOT EXISTS customers_name_idx     ON customers (workshop_id, lower(name));

CREATE TABLE IF NOT EXISTS motorcycles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id   UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  plate         TEXT NOT NULL,
  brand         TEXT,
  model         TEXT,                     -- línea comercial (FZ 2.0, Pulsar NS200)
  year          INTEGER,
  engine_size   TEXT,                     -- cilindraje
  vin           TEXT,                     -- VIN / número de chasis
  engine_number TEXT,
  color         TEXT,
  mileage       INTEGER,                  -- último kilometraje conocido
  notes         TEXT,
  photo_url     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS motorcycles_plate_key
  ON motorcycles (workshop_id, upper(replace(plate, ' ', '')));
CREATE INDEX IF NOT EXISTS motorcycles_customer_idx ON motorcycles (customer_id);

-- ── Agenda ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id       UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  customer_id       UUID REFERENCES customers(id) ON DELETE SET NULL,
  motorcycle_id     UUID REFERENCES motorcycles(id) ON DELETE SET NULL,
  scheduled_at      TIMESTAMPTZ NOT NULL,
  duration_minutes  INTEGER NOT NULL DEFAULT 60,
  reason            TEXT,
  status            TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','confirmed','arrived','no_show','cancelled','done')),
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS appointments_when_idx ON appointments (workshop_id, scheduled_at);

-- ── Catálogo de servicios (mano de obra) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS services (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id       UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  code              TEXT,
  name              TEXT NOT NULL,
  description       TEXT,
  price             NUMERIC(12,2) NOT NULL DEFAULT 0,
  estimated_minutes INTEGER,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS services_workshop_idx ON services (workshop_id);

-- ── Proveedores, repuestos e inventario ───────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id  UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  notes        TEXT,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS suppliers_workshop_idx ON suppliers (workshop_id);

CREATE TABLE IF NOT EXISTS parts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id  UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  supplier_id  UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  sku          TEXT,
  name         TEXT NOT NULL,
  description  TEXT,
  brand        TEXT,
  category     TEXT,
  cost         NUMERIC(12,2) NOT NULL DEFAULT 0,
  price        NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock        NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_stock    NUMERIC(12,2) NOT NULL DEFAULT 0,
  location     TEXT,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS parts_workshop_idx ON parts (workshop_id);
CREATE UNIQUE INDEX IF NOT EXISTS parts_sku_key
  ON parts (workshop_id, sku) WHERE sku IS NOT NULL AND sku <> '';

CREATE TABLE IF NOT EXISTS purchases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id  UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  supplier_id  UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  reference    TEXT,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total        NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes        TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS purchases_workshop_idx ON purchases (workshop_id, purchased_at DESC);

CREATE TABLE IF NOT EXISTS purchase_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id  UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  part_id      UUID REFERENCES parts(id) ON DELETE SET NULL,
  description  TEXT NOT NULL,
  quantity     NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_cost    NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS purchase_items_purchase_idx ON purchase_items (purchase_id);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id    UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  part_id        UUID REFERENCES parts(id) ON DELETE SET NULL,
  work_order_id  UUID,
  purchase_id    UUID REFERENCES purchases(id) ON DELETE SET NULL,
  type           TEXT NOT NULL CHECK (type IN ('in','out','adjust')),
  quantity       NUMERIC(12,2) NOT NULL,   -- siempre positiva; el signo lo da `type`
  unit_cost      NUMERIC(12,2),
  balance_after  NUMERIC(12,2),
  reason         TEXT,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_movements_part_idx ON inventory_movements (part_id, created_at DESC);

-- ── Órdenes de trabajo ────────────────────────────────────────────────────
-- Flujo (spec §7): scheduled → received → diagnosing → quoted → pending_approval
--   → approved → repairing → waiting_parts → quality_check → ready → delivered
--   → closed. `cancelled` sale del flujo en cualquier punto.
CREATE TABLE IF NOT EXISTS work_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id           UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  number                INTEGER NOT NULL,
  public_code           TEXT NOT NULL,          -- código de seguimiento del cliente
  customer_id           UUID REFERENCES customers(id) ON DELETE SET NULL,
  motorcycle_id         UUID REFERENCES motorcycles(id) ON DELETE SET NULL,
  appointment_id        UUID REFERENCES appointments(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'received'
                        CHECK (status IN ('scheduled','received','diagnosing','quoted',
                                          'pending_approval','approved','repairing',
                                          'waiting_parts','quality_check','ready',
                                          'delivered','closed','cancelled')),
  priority              TEXT NOT NULL DEFAULT 'normal'
                        CHECK (priority IN ('low','normal','high')),
  mechanic_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  received_by           UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Recepción digital (spec §5)
  mileage_in            INTEGER,
  fuel_level            TEXT,                   -- empty | quarter | half | three_quarters | full
  accessories           JSONB NOT NULL DEFAULT '[]'::jsonb,
  visual_condition      TEXT,
  existing_damage       TEXT,
  reception_notes       TEXT,
  customer_signature    TEXT,                   -- dataURL de la firma o nombre aceptado
  signed_at             TIMESTAMPTZ,
  complaint             TEXT,                   -- motivo de ingreso reportado

  received_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  promised_at           TIMESTAMPTZ,
  delivered_at          TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,

  -- Totales (los recalcula la capa de servicio dentro de la transacción)
  labor_total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  parts_total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount              NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate              NUMERIC(5,2)  NOT NULL DEFAULT 0,
  tax_total             NUMERIC(12,2) NOT NULL DEFAULT 0,
  total                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_total            NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_status        TEXT NOT NULL DEFAULT 'pending'
                        CHECK (payment_status IN ('pending','partial','paid')),

  work_performed        TEXT,
  observations          TEXT,
  next_service_mileage  INTEGER,
  next_service_date     DATE,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS work_orders_number_key ON work_orders (workshop_id, number);
CREATE UNIQUE INDEX IF NOT EXISTS work_orders_public_code_key ON work_orders (public_code);
CREATE INDEX IF NOT EXISTS work_orders_status_idx     ON work_orders (workshop_id, status);
CREATE INDEX IF NOT EXISTS work_orders_motorcycle_idx ON work_orders (motorcycle_id, received_at DESC);
CREATE INDEX IF NOT EXISTS work_orders_customer_idx   ON work_orders (customer_id, received_at DESC);
CREATE INDEX IF NOT EXISTS work_orders_mechanic_idx   ON work_orders (mechanic_id, status);

ALTER TABLE inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_work_order_id_fkey;
ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_work_order_id_fkey
  FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS work_order_status_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id    UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  work_order_id  UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  status         TEXT NOT NULL,
  note           TEXT,
  changed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wo_status_history_idx ON work_order_status_history (work_order_id, created_at);

CREATE TABLE IF NOT EXISTS diagnostics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id       UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  work_order_id     UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  findings          TEXT NOT NULL,
  tests_performed   TEXT,
  recommendations   TEXT,
  notes             TEXT,
  mechanic_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS diagnostics_wo_idx ON diagnostics (work_order_id, created_at DESC);

-- Mano de obra cargada a la orden
CREATE TABLE IF NOT EXISTS work_order_services (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id    UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  work_order_id  UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  service_id     UUID REFERENCES services(id) ON DELETE SET NULL,
  mechanic_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  description    TEXT NOT NULL,
  quantity       NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price     NUMERIC(12,2) NOT NULL DEFAULT 0,
  approved       BOOLEAN NOT NULL DEFAULT TRUE,   -- FALSE = requiere visto bueno
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wo_services_idx ON work_order_services (work_order_id);

-- Repuestos cargados a la orden
CREATE TABLE IF NOT EXISTS work_order_parts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id    UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  work_order_id  UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  part_id        UUID REFERENCES parts(id) ON DELETE SET NULL,
  description    TEXT NOT NULL,
  quantity       NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_cost      NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_price     NUMERIC(12,2) NOT NULL DEFAULT 0,
  approved       BOOLEAN NOT NULL DEFAULT TRUE,
  stock_applied  BOOLEAN NOT NULL DEFAULT FALSE,  -- si ya descontó inventario
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wo_parts_idx ON work_order_parts (work_order_id);

-- ── Cotización y aprobación del cliente ───────────────────────────────────
CREATE TABLE IF NOT EXISTS quotes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id    UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  work_order_id  UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  number         INTEGER NOT NULL,
  public_token   TEXT NOT NULL,           -- enlace de aprobación para el cliente
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','sent','approved','rejected','partial','expired','cancelled')),
  subtotal       NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate       NUMERIC(5,2)  NOT NULL DEFAULT 0,
  tax_total      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total          NUMERIC(12,2) NOT NULL DEFAULT 0,
  valid_until    DATE,
  notes          TEXT,
  sent_at        TIMESTAMPTZ,
  responded_at   TIMESTAMPTZ,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS quotes_number_key ON quotes (workshop_id, number);
CREATE UNIQUE INDEX IF NOT EXISTS quotes_token_key  ON quotes (public_token);
CREATE INDEX IF NOT EXISTS quotes_wo_idx ON quotes (work_order_id);

CREATE TABLE IF NOT EXISTS quote_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id     UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('service','part')),
  service_id   UUID REFERENCES services(id) ON DELETE SET NULL,
  part_id      UUID REFERENCES parts(id) ON DELETE SET NULL,
  description  TEXT NOT NULL,
  quantity     NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  optional     BOOLEAN NOT NULL DEFAULT FALSE,  -- el cliente puede aceptarlo o no
  approved     BOOLEAN,                          -- NULL = sin respuesta todavía
  -- Línea de la orden que originó este ítem: al responder el cliente, se
  -- aprueba o se descarta exactamente ese trabajo (spec §8).
  work_order_service_id UUID REFERENCES work_order_services(id) ON DELETE SET NULL,
  work_order_part_id    UUID REFERENCES work_order_parts(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quote_items_quote_idx ON quote_items (quote_id);

-- Registro inmutable de la decisión del cliente (spec §8).
CREATE TABLE IF NOT EXISTS approvals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id    UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  quote_id       UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  work_order_id  UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  decision       TEXT NOT NULL CHECK (decision IN ('approved','rejected','partial')),
  customer_name  TEXT,
  items          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- qué aprobó exactamente
  note           TEXT,
  ip_address     TEXT,
  user_agent     TEXT,
  decided_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS approvals_quote_idx ON approvals (quote_id);

-- ── Pagos y facturación ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id    UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  work_order_id  UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method         TEXT NOT NULL DEFAULT 'cash'
                 CHECK (method IN ('cash','transfer','card','nequi','daviplata','other')),
  reference      TEXT,
  note           TEXT,
  received_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_wo_idx        ON payments (work_order_id);
CREATE INDEX IF NOT EXISTS payments_workshop_idx  ON payments (workshop_id, created_at DESC);

-- Facturación electrónica DIAN (plan Premium), vía Factus. `external_id`
-- guarda el número de documento que asigna Factus (no el consecutivo interno
-- de arriba) y `payload` la respuesta completa (cufe, qr, totales...).
CREATE TABLE IF NOT EXISTS invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id    UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  work_order_id  UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  number         INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','issued','sent','accepted','rejected','void')),
  subtotal       NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total          NUMERIC(12,2) NOT NULL DEFAULT 0,
  issued_at      TIMESTAMPTZ,
  external_id    TEXT,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_key ON invoices (workshop_id, number);
CREATE INDEX IF NOT EXISTS invoices_wo_idx ON invoices (work_order_id);

-- La tabla ya existía (preparada desde antes para facturación); estas dos
-- son nuevas, así que van con ALTER: un CREATE TABLE IF NOT EXISTS no toca
-- una tabla que ya está creada.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reference_code TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cufe           TEXT;

-- Factura de venta normal (plan Completo): un comprobante propio del taller,
-- sin pasar por la DIAN/Factus, para quien no tiene o no necesita facturación
-- electrónica. Comparte tabla y consecutivo con la electrónica porque a la
-- vista del taller son la misma cosa (un documento de venta); lo único que
-- cambia es si se le pidió a Factus que la valide ante la DIAN.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'electronic'
  CHECK (kind IN ('normal','electronic'));

-- Una orden no puede tener dos facturas emitidas a la vez, sea normal o
-- electrónica: la ruta ya lo comprueba antes de emitir, pero esto lo
-- garantiza también contra una condición de carrera (doble clic, reintento).
CREATE UNIQUE INDEX IF NOT EXISTS invoices_wo_issued_key
  ON invoices (work_order_id) WHERE status = 'issued';

-- ── Adjuntos, notificaciones y reglas de mantenimiento ────────────────────
CREATE TABLE IF NOT EXISTS attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id  UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('work_order','motorcycle','customer','diagnostic','quote')),
  entity_id    UUID NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo','document','signature')),
  stage        TEXT,                     -- reception | diagnostic | work | delivery
  filename     TEXT NOT NULL,
  mime_type    TEXT,
  size_bytes   BIGINT,
  storage_path TEXT NOT NULL,
  caption      TEXT,
  uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS attachments_entity_idx ON attachments (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id    UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  customer_id    UUID REFERENCES customers(id) ON DELETE SET NULL,
  work_order_id  UUID REFERENCES work_orders(id) ON DELETE CASCADE,
  channel        TEXT NOT NULL DEFAULT 'whatsapp'
                 CHECK (channel IN ('whatsapp','sms','email','push')),
  template       TEXT NOT NULL,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','sent','failed','skipped')),
  error          TEXT,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_status_idx ON notifications (workshop_id, status, created_at);

CREATE TABLE IF NOT EXISTS maintenance_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id   UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  brand         TEXT,                    -- NULL = aplica a todas
  model         TEXT,
  interval_km   INTEGER,
  interval_days INTEGER,
  description   TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS maintenance_rules_workshop_idx ON maintenance_rules (workshop_id);

-- ── Contabilidad básica (plan Premium) ────────────────────────────────────
-- Plan de cuentas simple y libro de ingresos/gastos, para todo lo que no
-- queda ya registrado solo por las órdenes (pagos de clientes, en
-- `payments`) o las compras a proveedores (`purchases`): arriendo,
-- servicios, nómina, una venta que no pasó por una orden, etc. El balance
-- de caja por periodo junta las tres fuentes (ver reports.summary y
-- accounting.summary).
CREATE TABLE IF NOT EXISTS accounting_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id  UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('income','expense')),
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS accounting_categories_workshop_idx ON accounting_categories (workshop_id);

CREATE TABLE IF NOT EXISTS cash_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id   UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  category_id   UUID REFERENCES accounting_categories(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('income','expense')),
  description   TEXT NOT NULL,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method        TEXT NOT NULL DEFAULT 'cash'
                CHECK (method IN ('cash','transfer','card','nequi','daviplata','other')),
  entry_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cash_entries_workshop_idx ON cash_entries (workshop_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS cash_entries_category_idx ON cash_entries (category_id);

-- ── CRM (plan Premium) ─────────────────────────────────────────────────────
-- Seguimiento comercial más allá de las órdenes: embudo de prospectos,
-- bitácora de contacto y recordatorios. Un prospecto puede convertirse en
-- cliente real (`customer_id`) sin perder su historial.
CREATE TABLE IF NOT EXISTS leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id   UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  source        TEXT,                    -- de dónde llegó: redes, referido, letrero...
  interest      TEXT,                    -- qué está buscando
  stage         TEXT NOT NULL DEFAULT 'new'
                CHECK (stage IN ('new','contacted','interested','quoted','won','lost')),
  lost_reason   TEXT,
  assigned_to   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_workshop_idx ON leads (workshop_id, stage);
CREATE INDEX IF NOT EXISTS leads_customer_idx ON leads (customer_id);

-- Bitácora de contacto de cada prospecto: llamadas, WhatsApp, visitas...
CREATE TABLE IF NOT EXISTS contact_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id   UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL DEFAULT 'call' CHECK (channel IN ('call','whatsapp','visit','email','other')),
  note          TEXT NOT NULL,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contact_log_lead_idx ON contact_log (lead_id, created_at DESC);

-- Recordatorios de seguimiento: "llamar el 15", "enviar cotización otra vez".
CREATE TABLE IF NOT EXISTS follow_ups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id   UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  note          TEXT NOT NULL,
  due_at        TIMESTAMPTZ NOT NULL,
  done          BOOLEAN NOT NULL DEFAULT FALSE,
  done_at       TIMESTAMPTZ,
  assigned_to   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS follow_ups_workshop_idx ON follow_ups (workshop_id, done, due_at);

-- ── Historial de servicio de cada moto (spec §10) ─────────────────────────
-- Vista derivada de las órdenes: no duplica datos.
CREATE OR REPLACE VIEW service_history AS
SELECT
  wo.id                AS work_order_id,
  wo.workshop_id,
  wo.motorcycle_id,
  wo.customer_id,
  wo.number,
  wo.status,
  wo.received_at,
  wo.delivered_at,
  wo.mileage_in,
  wo.complaint,
  wo.work_performed,
  wo.total,
  wo.next_service_mileage,
  wo.next_service_date,
  m.plate,
  m.brand,
  m.model,
  w.name               AS workshop_name,
  (SELECT string_agg(d.findings, E'\n' ORDER BY d.created_at) FROM diagnostics d
    WHERE d.work_order_id = wo.id)                              AS diagnostics,
  (SELECT string_agg(d.recommendations, E'\n' ORDER BY d.created_at) FROM diagnostics d
    WHERE d.work_order_id = wo.id AND d.recommendations IS NOT NULL) AS recommendations,
  (SELECT COALESCE(json_agg(json_build_object(
            'description', p.description, 'quantity', p.quantity, 'unit_price', p.unit_price)
          ORDER BY p.created_at), '[]'::json)
     FROM work_order_parts p WHERE p.work_order_id = wo.id)     AS parts_installed,
  (SELECT COALESCE(json_agg(json_build_object(
            'description', s.description, 'quantity', s.quantity, 'unit_price', s.unit_price)
          ORDER BY s.created_at), '[]'::json)
     FROM work_order_services s WHERE s.work_order_id = wo.id)  AS services_performed
FROM work_orders wo
JOIN workshops w   ON w.id = wo.workshop_id
LEFT JOIN motorcycles m ON m.id = wo.motorcycle_id;
