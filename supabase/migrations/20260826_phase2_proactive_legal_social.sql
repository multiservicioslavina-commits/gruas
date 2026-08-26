-- ─────────────────────────────────────────────────────────────────
-- Rita Phase 2 — Proactive, Legal Defense & Social
--
-- Expande Rita con: alertas automáticas, protección legal,
-- conexión entre riders, y seguimiento de mantenimiento.
-- ─────────────────────────────────────────────────────────────────

-- 1. Tabla rider_odometer — Rastrear km de cada moto
CREATE TABLE IF NOT EXISTS rider_odometer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  moto_id UUID NOT NULL REFERENCES rider_motorcycles(id) ON DELETE CASCADE,

  km_actual INTEGER DEFAULT 0,
  km_ultima_alerta INTEGER DEFAULT 0,
  intervalo_mantenimiento INTEGER DEFAULT 10000, -- cada cuántos km alertar
  ultima_actualizacion TIMESTAMP DEFAULT NOW(),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Tabla rider_alert_preferences — Qué alertas quiere recibir
CREATE TABLE IF NOT EXISTS rider_alert_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL UNIQUE REFERENCES riders(id) ON DELETE CASCADE,

  -- Alertas proactivas
  alertas_km_mantenimiento BOOLEAN DEFAULT TRUE,
  alertas_clima BOOLEAN DEFAULT TRUE,
  alertas_via_cerrada BOOLEAN DEFAULT TRUE,
  alertas_rodadas BOOLEAN DEFAULT TRUE,
  alertas_promociones BOOLEAN DEFAULT FALSE,

  -- Frecuencia
  alertas_anticipacion_dias INTEGER DEFAULT 30, -- días antes para alertar

  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Tabla weather_events — Eventos de clima por zona
CREATE TABLE IF NOT EXISTS weather_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  zona VARCHAR(100) NOT NULL, -- "Oriente Antioquia", "Eje Cafetero", etc
  tipo_evento VARCHAR(50) NOT NULL, -- lluvia, tormenta, granizo, deslizamiento
  descripcion TEXT,
  severidad VARCHAR(20) DEFAULT 'media', -- baja, media, alta
  fecha_evento DATE NOT NULL,

  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Tabla road_incidents — Cierres de vía, riesgos
CREATE TABLE IF NOT EXISTS road_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  nombre_vía VARCHAR(200) NOT NULL, -- "Medellín-Santa Fe", "Bogotá-Girardot"
  tipo_incidente VARCHAR(50) NOT NULL, -- cierre, derrumbe, accidente, obras
  descripcion TEXT,
  fecha_inicio TIMESTAMP NOT NULL,
  fecha_fin_estimada TIMESTAMP,
  ruta_alternativa VARCHAR(500),
  severidad VARCHAR(20) DEFAULT 'media',

  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Tabla rider_groups — Grupos y rodadas
CREATE TABLE IF NOT EXISTS rider_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  nombre VARCHAR(200) NOT NULL, -- "GS Colombia", "Club Triumph Medellín"
  tipo VARCHAR(50) DEFAULT 'club', -- club, rodada_puntual, grupo_whatsapp
  descripcion TEXT,
  ubicacion VARCHAR(200), -- ciudad principal

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. Tabla rider_group_members — Riders en cada grupo
CREATE TABLE IF NOT EXISTS rider_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES rider_groups(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  rol VARCHAR(50) DEFAULT 'miembro', -- organizador, miembro

  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(group_id, rider_id)
);

-- 7. Tabla group_rides — Rodadas específicas
CREATE TABLE IF NOT EXISTS group_rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES rider_groups(id) ON DELETE CASCADE,

  nombre VARCHAR(200) NOT NULL, -- "Vuelta a Antioquia", "Paseo de verano"
  descripcion TEXT,
  fecha DATE NOT NULL,
  hora_salida TIME,
  punto_salida VARCHAR(300),
  destino VARCHAR(300),
  km_aproximados INTEGER,
  dificultad VARCHAR(20) DEFAULT 'media', -- fácil, media, difícil

  created_at TIMESTAMP DEFAULT NOW()
);

-- 8. Tabla legal_knowledge — Base de conocimiento legal
CREATE TABLE IF NOT EXISTS legal_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tipo VARCHAR(100) NOT NULL, -- "retén", "comparendo", "accidente", "compra_moto_usada"
  titulo VARCHAR(300) NOT NULL,
  contenido TEXT NOT NULL,
  pasos_json JSONB, -- array de pasos a seguir
  documentos_necesarios TEXT[], -- array de documentos
  referencias_legales TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

-- 9. Tabla rider_legal_history — Historial de incidentes
CREATE TABLE IF NOT EXISTS rider_legal_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  tipo_incidente VARCHAR(100) NOT NULL, -- comparendo, accidente, infracción
  fecha DATE NOT NULL,
  descripcion TEXT,
  estado VARCHAR(50) DEFAULT 'activo', -- activo, resuelto, apelado
  notas TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_odometer_rider_moto ON rider_odometer(rider_id, moto_id);
CREATE INDEX IF NOT EXISTS idx_weather_zona ON weather_events(zona);
CREATE INDEX IF NOT EXISTS idx_road_incidents_fecha ON road_incidents(fecha_inicio);
CREATE INDEX IF NOT EXISTS idx_group_members_rider ON rider_group_members(rider_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON rider_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_rides_group ON group_rides(group_id);
CREATE INDEX IF NOT EXISTS idx_legal_knowledge_tipo ON legal_knowledge(tipo);
CREATE INDEX IF NOT EXISTS idx_legal_history_rider ON rider_legal_history(rider_id);

-- RLS
ALTER TABLE rider_odometer ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_alert_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE road_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_legal_history ENABLE ROW LEVEL SECURITY;

-- Políticas: service role (Rita) puede leer/escribir todo
CREATE POLICY "service_role_access" ON rider_odometer
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON rider_alert_preferences
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON weather_events
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON road_incidents
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON rider_groups
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON rider_group_members
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON group_rides
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON legal_knowledge
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON rider_legal_history
  FOR ALL USING (auth.role() = 'service_role');
