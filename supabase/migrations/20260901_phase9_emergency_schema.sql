-- ─────────────────────────────────────────────────────────────────
-- Rita Phase 9 — Emergency Protocol & Accident Response
--
-- Sistema de detección de accidentes y escalación automática:
--   - Detección de impacto (acelerómetro)
--   - Check-in de voz automático (0-3 segundos)
--   - Escalonamiento: SMS → 122 → grúa Ridera
--   - Documentación post-accidente
--   - Alertas de seguridad a comunidad
-- ─────────────────────────────────────────────────────────────────

-- Tabla: Incidentes de emergencia (detectados o reportados)
CREATE TABLE IF NOT EXISTS emergency_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  incident_type VARCHAR(50) NOT NULL, -- 'impact_detected', 'distress_button', 'manual_report'
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  location POINT, -- Coordenadas GPS (lat, lon)

  -- Datos de impacto
  impact_severity NUMERIC(3, 2), -- 0.0-1.0 escala de severidad
  acceleration_x NUMERIC(6, 3), -- G-force X
  acceleration_y NUMERIC(6, 3), -- G-force Y
  acceleration_z NUMERIC(6, 3), -- G-force Z (vertical)

  -- Escalonamiento de emergencia
  escalation_level INTEGER DEFAULT 0, -- 0: detect, 1: audio check, 2: SMS, 3: 122 call, 4: grúa
  escalated_at TIMESTAMP,
  rider_responded BOOLEAN DEFAULT false,
  rider_response_time_ms INTEGER,
  rider_response TEXT, -- "sí", "estoy bien", etc

  -- Resolución
  was_real_emergency BOOLEAN, -- true si rider confirmó emergencia
  resolved_at TIMESTAMP,
  resolution_reason VARCHAR(100), -- 'false_positive', 'rider_ok', 'ambulance_dispatched', 'grua_dispatched'

  -- Metadata
  bike_id UUID REFERENCES motorcycles(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Contactos de emergencia del rider
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  contact_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  relationship VARCHAR(50), -- 'familiar', 'amigo', 'vecino', 'otro'
  notify_on_type VARCHAR(50)[] DEFAULT ARRAY['impact', 'distress', 'manual'], -- tipos de incidente
  consent BOOLEAN DEFAULT true, -- Rider puede deactivar notificaciones
  priority INTEGER DEFAULT 1, -- 1=primero, 2=segundo, etc (max 5)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(rider_id, phone_number)
);

-- Tabla: Información médica para paramédicos
CREATE TABLE IF NOT EXISTS rider_medical_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  blood_type VARCHAR(3), -- 'O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'
  allergies TEXT[], -- ['penicilina', 'ibuprofeno', 'latex']
  medications TEXT[], -- ['metformina 500mg', 'lisinopril 10mg']
  known_conditions TEXT[], -- ['diabetes', 'asma', 'convulsiones']
  height_cm INTEGER, -- para estimar peso
  weight_kg INTEGER, -- para dosificación médica
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Documentos y evidencia post-accidente
CREATE TABLE IF NOT EXISTS incident_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES emergency_incidents(id) ON DELETE CASCADE,
  evidence_type VARCHAR(50) NOT NULL, -- 'photo', 'video', 'witness', 'police_report', 'damage_assessment'
  file_url TEXT, -- URL a archivo almacenado (Supabase storage)
  description TEXT,
  uploaded_by VARCHAR(50), -- 'rider', 'responder', 'witness'
  witness_name VARCHAR(255),
  witness_phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Claims de seguro auto-levantados
CREATE TABLE IF NOT EXISTS incident_insurance_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES emergency_incidents(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  insurance_provider VARCHAR(255), -- 'Seguros Bolívar', 'MAPFRE', etc
  policy_number VARCHAR(100),
  claim_number VARCHAR(100), -- asignado por aseguradora
  auto_filed BOOLEAN DEFAULT true, -- si fue levantado automáticamente por Rita
  filed_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'under_review', 'paid'
  estimated_payout NUMERIC(12, 2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Análisis agregado de accidentes (para alertas a comunidad)
CREATE TABLE IF NOT EXISTS accident_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_name VARCHAR(255) NOT NULL, -- 'Retén Caldas', 'Curva Girardota', etc
  location_coords POINT NOT NULL, -- Coordenadas del hotspot
  road_type VARCHAR(50), -- 'ciudad', 'carretera', 'autopista', 'montaña'
  weather_condition VARCHAR(50), -- 'despejado', 'lluvia', 'niebla', 'granizo'
  time_of_day VARCHAR(50), -- 'madrugada', 'mañana', 'tarde', 'noche'
  day_of_week VARCHAR(20), -- 'lunes', 'martes', etc

  -- Estadísticas
  incident_count INTEGER DEFAULT 0,
  severity_avg NUMERIC(3, 2), -- promedio 0-1
  injuries_avg INTEGER DEFAULT 0,
  last_incident TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(location_name, road_type, time_of_day, day_of_week)
);

-- Tabla: Sesiones de telemetría en tiempo real (opcional, para futuros sensores)
CREATE TABLE IF NOT EXISTS rider_telemetry_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  session_start TIMESTAMP NOT NULL,
  session_end TIMESTAMP,

  -- Ubicación actual
  current_location POINT,

  -- Datos de aceleración
  accel_x NUMERIC(6, 3),
  accel_y NUMERIC(6, 3),
  accel_z NUMERIC(6, 3),

  -- Velocidad estimada
  estimated_speed_kmh NUMERIC(6, 2),

  -- Eventos
  braking_event_count INTEGER DEFAULT 0,
  cornering_event_count INTEGER DEFAULT 0,
  max_acceleration NUMERIC(6, 3),

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Registros de activación/desactivación del modo emergencia
CREATE TABLE IF NOT EXISTS emergency_mode_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL, -- 'activated', 'deactivated', 'incident_triggered'
  reason VARCHAR(255),
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX idx_emergency_incidents_rider ON emergency_incidents(rider_id, timestamp DESC);
CREATE INDEX idx_emergency_incidents_location ON emergency_incidents USING GIST(location);
CREATE INDEX idx_emergency_incidents_escalation ON emergency_incidents(escalation_level, escalated_at DESC);
CREATE INDEX idx_emergency_incidents_unresolved ON emergency_incidents(resolved_at, escalation_level) WHERE resolved_at IS NULL;
CREATE INDEX idx_emergency_contacts_rider ON emergency_contacts(rider_id, priority);
CREATE INDEX idx_incident_evidence_incident ON incident_evidence(incident_id);
CREATE INDEX idx_incident_insurance_rider ON incident_insurance_claims(rider_id, filed_at DESC);
CREATE INDEX idx_accident_analytics_location ON accident_analytics USING GIST(location_coords);
CREATE INDEX idx_telemetry_rider ON rider_telemetry_sessions(rider_id, session_start DESC);
CREATE INDEX idx_emergency_mode_log_rider ON emergency_mode_log(rider_id, timestamp DESC);

-- Activar Row Level Security
ALTER TABLE emergency_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_medical_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_insurance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE accident_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_telemetry_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_mode_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies: emergency_incidents
CREATE POLICY "Ver propios incidentes" ON emergency_incidents
  FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Crear incidente propio" ON emergency_incidents
  FOR INSERT WITH CHECK (auth.uid() = rider_id);
CREATE POLICY "Actualizar incidente propio" ON emergency_incidents
  FOR UPDATE USING (auth.uid() = rider_id);

-- RLS Policies: emergency_contacts
CREATE POLICY "Ver contactos de emergencia propios" ON emergency_contacts
  FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Crear contacto de emergencia" ON emergency_contacts
  FOR INSERT WITH CHECK (auth.uid() = rider_id);
CREATE POLICY "Actualizar contacto de emergencia" ON emergency_contacts
  FOR UPDATE USING (auth.uid() = rider_id);
CREATE POLICY "Eliminar contacto de emergencia" ON emergency_contacts
  FOR DELETE USING (auth.uid() = rider_id);

-- RLS Policies: rider_medical_info
CREATE POLICY "Ver info médica propia" ON rider_medical_info
  FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Crear/actualizar info médica" ON rider_medical_info
  FOR INSERT WITH CHECK (auth.uid() = rider_id);
CREATE POLICY "Actualizar info médica propia" ON rider_medical_info
  FOR UPDATE USING (auth.uid() = rider_id);

-- RLS Policies: incident_evidence
CREATE POLICY "Ver evidencia propia" ON incident_evidence
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM emergency_incidents WHERE id = incident_id AND rider_id = auth.uid())
  );
CREATE POLICY "Cargar evidencia de incidente propio" ON incident_evidence
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM emergency_incidents WHERE id = incident_id AND rider_id = auth.uid())
  );

-- RLS Policies: accident_analytics (público, para alertas de seguridad)
CREATE POLICY "Ver análisis de accidentes (público)" ON accident_analytics
  FOR SELECT USING (true);

-- RLS Policies: telemetry
CREATE POLICY "Ver telemetría propia" ON rider_telemetry_sessions
  FOR SELECT USING (auth.uid() = rider_id);

-- RLS Policies: emergency mode log
CREATE POLICY "Ver log de activación propio" ON emergency_mode_log
  FOR SELECT USING (auth.uid() = rider_id);
