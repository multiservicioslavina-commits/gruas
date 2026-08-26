-- ─────────────────────────────────────────────────────────────────
-- Rita Phase 9 — Emergency Protocol & Accident Response System
--
-- Infraestructura para:
--   - Detección de emergencias (caída, impacto, velocidad anómala)
--   - Protocolos de accidente y respuesta automática
--   - Contactos de emergencia y notificaciones en tiempo real
--   - Ubicación en vivo y compartición de ruta
--   - Información médica de emergencia (alergias, tipo de sangre, medicamentos)
--   - Registro de incidentes y análisis post-accidente
--   - Integración con servicios de emergencia (ambulancia, policía, grúa)
-- ─────────────────────────────────────────────────────────────────

-- Tabla: Perfil médico de emergencia
CREATE TABLE IF NOT EXISTS emergency_medical_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- Información médica crítica
  blood_type VARCHAR(10), -- O+, A-, AB+, etc
  allergies TEXT[], -- ["penicilina", "ibuprofeno", ...]
  medical_conditions TEXT[], -- ["diabetes", "asthma", "heart_condition", ...]
  current_medications TEXT[], -- [{name, dosage, frequency}, ...]
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(20),
  emergency_contact_relationship VARCHAR(50), -- 'mother', 'spouse', 'friend', etc

  -- Órgano donante
  organ_donor BOOLEAN DEFAULT false,
  donor_registry_id VARCHAR(100),

  -- Auditoría
  last_updated TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Contactos de emergencia adicionales
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- Contacto
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  relationship VARCHAR(50), -- 'mother', 'friend', 'doctor', etc
  notify_priority INTEGER DEFAULT 1, -- 1=first, 2=second, etc
  notify_on_emergency BOOLEAN DEFAULT true,

  -- Instrucciones especiales
  special_instructions TEXT,
  preferred_notification_method VARCHAR(50), -- 'sms', 'whatsapp', 'call', 'email'

  -- Auditoría
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Detección de emergencias (acelerómetro, GPS)
CREATE TABLE IF NOT EXISTS emergency_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- Evento detectado
  detection_type VARCHAR(50) NOT NULL, -- 'fall', 'impact', 'speed_anomaly', 'manual_sos'
  confidence_level NUMERIC(5, 2), -- 0-100, confianza de que es emergencia real

  -- Contexto del evento
  location GEOGRAPHY(POINT, 4326), -- ubicación GPS donde ocurrió
  speed_kmh NUMERIC(5, 2), -- velocidad al momento del evento
  acceleration_g NUMERIC(5, 2), -- aceleración detectada (g-force)
  impact_severity VARCHAR(50), -- 'mild', 'moderate', 'severe', 'unknown'

  -- Datos del sensor
  sensor_data JSONB, -- {accelerometer_x, accelerometer_y, accelerometer_z, gyro_x, gyro_y, gyro_z, ...}
  device_type VARCHAR(50), -- 'smartphone', 'smartwatch', 'bike_device'

  -- Timeline
  detected_at TIMESTAMP NOT NULL,
  rider_acknowledged_at TIMESTAMP, -- cuándo el rider confirmó o canceló

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Respuesta a emergencias
CREATE TABLE IF NOT EXISTS emergency_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  detection_id UUID NOT NULL REFERENCES emergency_detections(id) ON DELETE CASCADE,

  -- Acción tomada
  response_type VARCHAR(50) NOT NULL, -- 'auto_alert', 'manual_cancel', 'confirm_emergency', 'call_ambulance', 'call_police'
  triggered_by VARCHAR(50), -- 'rider', 'system', 'emergency_contact'

  -- Servicios contactados
  ambulance_called BOOLEAN DEFAULT false,
  ambulance_eta_minutes INTEGER,
  ambulance_tracking_id VARCHAR(100),

  police_called BOOLEAN DEFAULT false,
  police_dispatch_id VARCHAR(100),

  tow_truck_called BOOLEAN DEFAULT false,
  tow_truck_eta_minutes INTEGER,

  -- Ubicación compartida
  location_shared BOOLEAN DEFAULT false,
  location_shared_with TEXT[], -- ["emergency_contact_1", "ambulance_service", ...]

  -- Comunicación
  rider_contacted_at TIMESTAMP,
  emergency_contacts_notified_at TIMESTAMP,

  -- Resultado
  status VARCHAR(50), -- 'pending', 'responded', 'resolved', 'cancelled'
  resolution_notes TEXT,
  resolved_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Historial de ubicación en vivo (durante emergencia)
CREATE TABLE IF NOT EXISTS emergency_location_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  emergency_response_id UUID REFERENCES emergency_responses(id) ON DELETE CASCADE,

  -- Ubicación y movimiento
  location GEOGRAPHY(POINT, 4326),
  accuracy_meters INTEGER,
  speed_kmh NUMERIC(5, 2),
  heading_degrees NUMERIC(5, 2),

  -- Batería del dispositivo
  battery_percent INTEGER,

  -- Timestamp
  recorded_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Servicios de emergencia disponibles
CREATE TABLE IF NOT EXISTS emergency_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Servicio
  service_type VARCHAR(50) NOT NULL, -- 'ambulance', 'police', 'fire', 'tow_truck'
  service_name VARCHAR(255),
  phone_number VARCHAR(20),

  -- Ubicación
  city VARCHAR(100),
  region VARCHAR(100),
  service_area GEOGRAPHY,

  -- Capacidades
  capabilities TEXT[], -- ['motorcycle_transport', 'trauma_response', 'fuel_delivery', ...]
  response_time_minutes INTEGER, -- tiempo promedio de respuesta
  available_24_7 BOOLEAN DEFAULT true,

  -- Contacto
  contact_email VARCHAR(255),
  api_endpoint TEXT, -- para automatización
  api_key VARCHAR(255), -- encrypted en producción

  -- Auditoría
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Rutas compartidas durante emergencias
CREATE TABLE IF NOT EXISTS emergency_shared_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  emergency_response_id UUID REFERENCES emergency_responses(id) ON DELETE CASCADE,

  -- Compartición
  share_token VARCHAR(100) UNIQUE, -- token para acceder sin autenticación
  shared_with_phones TEXT[], -- números de teléfono con acceso

  -- Datos de ruta
  route_points GEOMETRY[], -- array de puntos GPS
  start_location GEOGRAPHY(POINT, 4326),
  end_location GEOGRAPHY(POINT, 4326),
  distance_km NUMERIC(7, 2),

  -- Validez del token
  active BOOLEAN DEFAULT true,
  shared_at TIMESTAMP,
  expires_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Reportes post-incidente
CREATE TABLE IF NOT EXISTS incident_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  emergency_response_id UUID REFERENCES emergency_responses(id) ON DELETE CASCADE,

  -- Reporte
  incident_type VARCHAR(50) NOT NULL, -- 'fall', 'collision', 'injury', 'damage_only'
  severity_level VARCHAR(50), -- 'minor', 'moderate', 'severe', 'critical'
  description TEXT,

  -- Lesiones reportadas
  injuries_reported TEXT[], -- ["head_trauma", "fractured_leg", "road_rash", ...]
  injury_severity JSONB, -- {head_trauma: 'moderate', fractured_leg: 'severe', ...}

  -- Daño a la moto
  bike_damage_description TEXT,
  damage_photos_url TEXT[],

  -- Culpa/responsabilidad
  third_party_involved BOOLEAN DEFAULT false,
  third_party_name VARCHAR(255),
  third_party_phone VARCHAR(20),
  third_party_insurance VARCHAR(100),

  -- Testigos
  witness_names TEXT[],
  witness_phones VARCHAR(20)[],

  -- Seguimiento
  insurance_claim_filed BOOLEAN DEFAULT false,
  insurance_claim_number VARCHAR(100),
  police_report_filed BOOLEAN DEFAULT false,
  police_report_number VARCHAR(100),

  -- Análisis
  root_cause_analysis TEXT, -- análisis de qué pasó
  preventive_measures TEXT[], -- qué se puede mejorar

  submitted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Estadísticas de emergencia por rider
CREATE TABLE IF NOT EXISTS emergency_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- Historial
  total_emergencies_detected INTEGER DEFAULT 0,
  total_false_alarms INTEGER DEFAULT 0, -- rider cancelled
  total_real_emergencies INTEGER DEFAULT 0,

  -- Tipos de incidentes
  falls_count INTEGER DEFAULT 0,
  collisions_count INTEGER DEFAULT 0,
  injuries_count INTEGER DEFAULT 0,

  -- Respuesta
  avg_response_time_seconds INTEGER,
  emergency_services_called_count INTEGER DEFAULT 0,

  -- Seguridad
  last_emergency_date DATE,
  days_since_last_emergency INTEGER,

  -- Análisis
  emergency_risk_trend VARCHAR(50), -- 'improving', 'stable', 'worsening'
  risk_score_change NUMERIC(5, 2), -- cambio en puntuación de riesgo después de emergencia

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Configuración de preferencias de emergencia
CREATE TABLE IF NOT EXISTS emergency_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- Configuración de detección
  auto_detect_enabled BOOLEAN DEFAULT true,
  fall_detection_sensitivity VARCHAR(50), -- 'low', 'medium', 'high'
  impact_detection_sensitivity VARCHAR(50),

  -- Confirmación requerida
  require_rider_confirmation BOOLEAN DEFAULT true, -- ¿pedir confirmación antes de alertar?
  confirmation_timeout_seconds INTEGER DEFAULT 60,

  -- Alertas
  send_sms_alerts BOOLEAN DEFAULT true,
  send_whatsapp_alerts BOOLEAN DEFAULT true,
  send_call_alerts BOOLEAN DEFAULT false, -- llamada de voz automática

  -- Servicios de emergencia
  auto_call_ambulance BOOLEAN DEFAULT false,
  auto_call_police BOOLEAN DEFAULT false,
  auto_request_tow_truck BOOLEAN DEFAULT false,

  -- Compartición de ubicación
  auto_share_location BOOLEAN DEFAULT true,
  share_location_duration_minutes INTEGER DEFAULT 30,

  -- Preferencias de privacidad
  hide_real_name_from_services BOOLEAN DEFAULT false,
  anonymous_incident_report BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX idx_emergency_detections_rider ON emergency_detections(rider_id, detected_at DESC);
CREATE INDEX idx_emergency_detections_type ON emergency_detections(detection_type, detected_at DESC);
CREATE INDEX idx_emergency_detections_location ON emergency_detections USING GIST(location);

CREATE INDEX idx_emergency_responses_rider ON emergency_responses(rider_id, created_at DESC);
CREATE INDEX idx_emergency_responses_status ON emergency_responses(status, created_at DESC);
CREATE INDEX idx_emergency_responses_detection ON emergency_responses(detection_id);

CREATE INDEX idx_location_tracking_response ON emergency_location_tracking(emergency_response_id, recorded_at DESC);
CREATE INDEX idx_location_tracking_location ON emergency_location_tracking USING GIST(location);

CREATE INDEX idx_emergency_services_type ON emergency_services(service_type, is_active);
CREATE INDEX idx_emergency_services_city ON emergency_services(city);

CREATE INDEX idx_incident_reports_rider ON incident_reports(rider_id, created_at DESC);
CREATE INDEX idx_incident_reports_severity ON incident_reports(severity_level);

CREATE INDEX idx_emergency_statistics_rider ON emergency_statistics(rider_id);
CREATE INDEX idx_emergency_statistics_trend ON emergency_statistics(emergency_risk_trend);

CREATE INDEX idx_emergency_contacts_rider ON emergency_contacts(rider_id, notify_priority);

CREATE INDEX idx_medical_profiles_rider ON emergency_medical_profiles(rider_id);

-- Activar Row Level Security
ALTER TABLE emergency_medical_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_location_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_shared_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Medical Profiles (riders ven propios, admins ven todos)
CREATE POLICY "Ver perfil médico propio" ON emergency_medical_profiles
  FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Admin ve perfiles médicos" ON emergency_medical_profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid() AND auth.users.raw_user_meta_data->>'role' = 'admin')
  );

-- RLS Policies: Emergency Contacts (riders ven propios)
CREATE POLICY "Ver contactos de emergencia propios" ON emergency_contacts
  FOR SELECT USING (auth.uid() = rider_id);

-- RLS Policies: Emergency Detections (riders ven propios, servicios con autorización)
CREATE POLICY "Ver detecciones propias" ON emergency_detections
  FOR SELECT USING (auth.uid() = rider_id);

-- RLS Policies: Emergency Responses (riders ven propios, servicios con autorización)
CREATE POLICY "Ver respuestas de emergencia propias" ON emergency_responses
  FOR SELECT USING (auth.uid() = rider_id);

-- RLS Policies: Emergency Location Tracking (compartido con servicios autorizados)
CREATE POLICY "Ver seguimiento de ubicación propio" ON emergency_location_tracking
  FOR SELECT USING (auth.uid() = rider_id);

-- RLS Policies: Emergency Services (público lectura, admin solo escritura)
CREATE POLICY "Ver servicios de emergencia" ON emergency_services
  FOR SELECT USING (true);

-- RLS Policies: Shared Routes (público con token)
CREATE POLICY "Ver ruta compartida con token" ON emergency_shared_routes
  FOR SELECT USING (active = true);

-- RLS Policies: Incident Reports (riders ven propios)
CREATE POLICY "Ver reportes de incidente propios" ON incident_reports
  FOR SELECT USING (auth.uid() = rider_id);

-- RLS Policies: Emergency Statistics (riders ven propios)
CREATE POLICY "Ver estadísticas de emergencia propias" ON emergency_statistics
  FOR SELECT USING (auth.uid() = rider_id);

-- RLS Policies: Emergency Preferences (riders ven propios)
CREATE POLICY "Ver preferencias de emergencia propias" ON emergency_preferences
  FOR SELECT USING (auth.uid() = rider_id);
