-- ─────────────────────────────────────────────────────────────────
-- Rita Phase 1 — Rider Profile System
--
-- Foundation para memoria, alertas, navigator y revenue engine.
-- Extiende la tabla riders existente con profile completo.
-- ─────────────────────────────────────────────────────────────────

-- 1. Extender tabla riders con campos de Phase 1
ALTER TABLE riders ADD COLUMN IF NOT EXISTS
  experiencia_nivel VARCHAR(20) DEFAULT 'principiante'; -- principiante, intermedio, avanzado
ALTER TABLE riders ADD COLUMN IF NOT EXISTS
  contacto_emergencia VARCHAR(100);
ALTER TABLE riders ADD COLUMN IF NOT EXISTS
  telefono_emergencia VARCHAR(20);
ALTER TABLE riders ADD COLUMN IF NOT EXISTS
  ubicacion_actual VARCHAR(100); -- ciudad/zona donde está ahora
ALTER TABLE riders ADD COLUMN IF NOT EXISTS
  ubicacion_home VARCHAR(100); -- ciudad donde vive
ALTER TABLE riders ADD COLUMN IF NOT EXISTS
  club_motociclista VARCHAR(100); -- si pertenece a alguno
ALTER TABLE riders ADD COLUMN IF NOT EXISTS
  sobre_ti TEXT; -- descripción personal/preferencias
ALTER TABLE riders ADD COLUMN IF NOT EXISTS
  preferencias_rutas VARCHAR(50) DEFAULT 'variadas'; -- montaña, ciudad, carretera, variadas
ALTER TABLE riders ADD COLUMN IF NOT EXISTS
  updated_at TIMESTAMP DEFAULT NOW();

-- 2. Tabla rider_motorcycles — para que Rita sepa de todas las motos del rider
CREATE TABLE IF NOT EXISTS rider_motorcycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- Datos de la moto
  marca VARCHAR(50) NOT NULL,
  modelo VARCHAR(100) NOT NULL,
  cc INTEGER,
  anio INTEGER,
  placa VARCHAR(20) UNIQUE,
  vin VARCHAR(50),
  color VARCHAR(50),

  -- Especificaciones técnicas (para mantenimiento)
  capacidad_combustible FLOAT, -- litros
  consumo_promedio FLOAT, -- km/litro
  tipo_aceite VARCHAR(50), -- 10W-30, etc
  capacidad_aceite FLOAT,

  -- Estado de la moto
  esta_activa BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Tabla rider_documents — documentos importantes y fechas
CREATE TABLE IF NOT EXISTS rider_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  tipo_documento VARCHAR(50) NOT NULL,
  -- soat, tecnica_mecanica, impuesto_vehicular, licencia_conduccion, etc

  numero_documento VARCHAR(100),
  fecha_vencimiento DATE,

  -- Para quien es (rider = personal, moto_id = de la moto)
  moto_id UUID REFERENCES rider_motorcycles(id) ON DELETE CASCADE,

  -- Alertas
  dias_alerta INTEGER DEFAULT 30, -- avisar 30 días antes
  ultima_alerta_enviada DATE,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Tabla rider_renewals — seguimiento de fechas de renovación
CREATE TABLE IF NOT EXISTS rider_renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  moto_id UUID REFERENCES rider_motorcycles(id) ON DELETE CASCADE,

  tipo_renovacion VARCHAR(50) NOT NULL, -- soat, tecnica, impuesto, licencia, mantenimiento
  documento_id UUID REFERENCES rider_documents(id) ON DELETE SET NULL,

  fecha_proximo_vencimiento DATE NOT NULL,
  costo_estimado FLOAT, -- precio aproximado

  -- Alertas
  alertas_enviadas INTEGER DEFAULT 0,
  proxima_alerta DATE, -- cuando enviar la siguiente alerta
  fue_completada BOOLEAN DEFAULT FALSE,
  fecha_completada DATE,

  notas TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. Tabla rider_preferences — preferencias para recomendaciones y alertas
CREATE TABLE IF NOT EXISTS rider_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL UNIQUE REFERENCES riders(id) ON DELETE CASCADE,

  -- Alertas
  alertas_soat BOOLEAN DEFAULT TRUE,
  alertas_mantenimiento BOOLEAN DEFAULT TRUE,
  alertas_clima BOOLEAN DEFAULT TRUE,
  alertas_eventos BOOLEAN DEFAULT FALSE,

  -- Canales
  enviar_por_whatsapp BOOLEAN DEFAULT TRUE,
  enviar_por_email BOOLEAN DEFAULT FALSE,

  -- Privacidad y social
  compartir_ubicacion BOOLEAN DEFAULT FALSE, -- para conectar con otros riders
  visible_en_grupo_club BOOLEAN DEFAULT FALSE,

  -- Navigator preferences
  preferir_rutas_seguras BOOLEAN DEFAULT TRUE,
  evitar_peajes BOOLEAN DEFAULT FALSE,

  -- Monetización
  aceptar_recomendaciones BOOLEAN DEFAULT TRUE, -- de talleres, SOAT, etc

  updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. Tabla rider_activity — para analytics y contexto
CREATE TABLE IF NOT EXISTS rider_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  tipo_actividad VARCHAR(50), -- pregunta, viaje, trámite, recomendacion, etc
  contexto TEXT, -- detalles del evento

  created_at TIMESTAMP DEFAULT NOW()
);

-- Crear índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_rider_motorcycles_rider_id ON rider_motorcycles(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_documents_rider_id ON rider_documents(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_documents_fecha_vencimiento ON rider_documents(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_rider_renewals_rider_id ON rider_renewals(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_renewals_fecha_vencimiento ON rider_renewals(fecha_proximo_vencimiento);
CREATE INDEX IF NOT EXISTS idx_rider_preferences_rider_id ON rider_preferences(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_activity_rider_id ON rider_activity(rider_id);

-- RLS (Row Level Security) — cada rider solo ve sus datos
ALTER TABLE rider_motorcycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_activity ENABLE ROW LEVEL SECURITY;

-- Políticas: service role (Rita) puede leer/escribir todo
CREATE POLICY "service_role_access" ON rider_motorcycles
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON rider_documents
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON rider_renewals
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON rider_preferences
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON rider_activity
  FOR ALL USING (auth.role() = 'service_role');
