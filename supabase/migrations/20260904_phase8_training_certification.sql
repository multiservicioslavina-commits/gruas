-- ─────────────────────────────────────────────────────────────────
-- Rita Phase 8 — AI-Powered Training & Certification
--
-- Infraestructura para:
--   - Módulos de entrenamiento personalizados por nivel y habilidad
--   - Evaluaciones de habilidades (diagnóstico, progreso, certificación)
--   - Seguimiento de progreso y badges
--   - Recomendaciones de entrenamiento basadas en patrones de conducción
--   - Certificaciones verificables (RSA compatible)
-- ─────────────────────────────────────────────────────────────────

-- Tabla: Perfiles de habilidad y experiencia de riders
CREATE TABLE IF NOT EXISTS rider_skill_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- Nivel general (derivado de distancia total y evaluaciones)
  overall_level VARCHAR(50) NOT NULL, -- 'beginner', 'intermediate', 'advanced', 'expert'
  experience_score NUMERIC(5, 2), -- 0-100, calculado de km + cursos completados

  -- Desglose por habilidad (0-100 cada una)
  city_riding_score NUMERIC(5, 2), -- conducción urbana
  highway_riding_score NUMERIC(5, 2), -- autopistas
  emergency_response_score NUMERIC(5, 2), -- reacción ante emergencias
  weather_handling_score NUMERIC(5, 2), -- conducción en lluvia/clima adverso
  defensive_riding_score NUMERIC(5, 2), -- conducción defensiva
  bike_maintenance_score NUMERIC(5, 2), -- mantenimiento básico
  safety_awareness_score NUMERIC(5, 2), -- conciencia de seguridad

  -- Evaluación de riesgos
  risk_profile VARCHAR(50), -- 'safe', 'moderate', 'aggressive'
  braking_tendencies VARCHAR(50), -- 'smooth', 'normal', 'harsh'
  acceleration_style VARCHAR(50), -- 'smooth', 'normal', 'aggressive'
  speed_preference VARCHAR(50), -- 'conservative', 'normal', 'aggressive'

  -- Auditoría
  last_assessment TIMESTAMP,
  last_updated TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Módulos de entrenamiento disponibles
CREATE TABLE IF NOT EXISTS training_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL, -- "Conducción defensiva urbana", "Emergencias en lluvia"
  description TEXT,
  category VARCHAR(50) NOT NULL, -- 'safety', 'skills', 'maintenance', 'legal', 'wellness'
  difficulty_level VARCHAR(50) NOT NULL, -- 'beginner', 'intermediate', 'advanced'

  -- Contenido
  content_sections JSONB, -- [{title, duration_minutes, description}, ...]
  learning_objectives TEXT[], -- ["aprender técnica de frenado", ...]
  total_duration_minutes INTEGER,

  -- Evaluación
  has_assessment BOOLEAN DEFAULT true,
  assessment_type VARCHAR(50), -- 'quiz', 'practical', 'both'
  passing_score INTEGER DEFAULT 70, -- % requerido para pasar

  -- Certificación
  awards_certification BOOLEAN DEFAULT false,
  certification_type VARCHAR(50), -- 'defensive_driving', 'emergency_response', etc
  certification_valid_months INTEGER DEFAULT 24, -- duración de certificación

  -- Metadata
  estimated_completion_days INTEGER DEFAULT 7, -- días esperados para completar
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 3, -- 1=muy alta, 2=alta, 3=normal, 4=baja
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Progreso de riders en módulos
CREATE TABLE IF NOT EXISTS rider_training_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,

  -- Estado
  status VARCHAR(50) NOT NULL, -- 'not_started', 'in_progress', 'completed', 'abandoned'
  completion_percentage INTEGER DEFAULT 0,

  -- Progreso
  sections_completed JSONB, -- {section_1: true, section_2: false, ...}
  time_spent_minutes INTEGER DEFAULT 0,
  last_accessed TIMESTAMP,

  -- Evaluación
  assessment_attempts INTEGER DEFAULT 0,
  assessment_score NUMERIC(5, 2), -- última puntuación (0-100)
  passed BOOLEAN DEFAULT false,
  passed_at TIMESTAMP,

  -- Certificación
  certification_earned BOOLEAN DEFAULT false,
  certification_id VARCHAR(100), -- ID verificable (RSA compatible)
  certification_expires_at TIMESTAMP,

  -- Timeline
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Evaluaciones de diagnóstico (initial assessment)
CREATE TABLE IF NOT EXISTS diagnostic_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- Evaluación basada en datos de conducción (últimos 30 días)
  assessment_type VARCHAR(50) NOT NULL, -- 'behavioral', 'skill_test', 'combined'

  -- Resultados por área
  city_riding_assessment NUMERIC(5, 2),
  highway_riding_assessment NUMERIC(5, 2),
  emergency_response_assessment NUMERIC(5, 2),
  weather_handling_assessment NUMERIC(5, 2),
  defensive_riding_assessment NUMERIC(5, 2),

  -- Análisis de riesgos (de sesiones últimas 30 días)
  hard_braking_incidents INTEGER DEFAULT 0,
  speed_violations INTEGER DEFAULT 0,
  rapid_acceleration_count INTEGER DEFAULT 0,
  near_miss_reports INTEGER DEFAULT 0,
  risk_score NUMERIC(5, 2), -- 0-100 (100 = muy riesgoso)

  -- Recomendaciones
  recommended_modules TEXT[], -- IDs de módulos sugeridos
  recommended_focus_areas TEXT[], -- ["city_riding", "weather_handling", ...]

  -- Timeline
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Badges y logros
CREATE TABLE IF NOT EXISTS rider_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- Badge
  badge_type VARCHAR(50) NOT NULL, -- 'safety_first', 'expert_rider', 'certified_defender', 'maintenance_master', etc
  badge_name VARCHAR(255),
  badge_icon_url TEXT,
  badge_description TEXT,

  -- Criterios cumplidos
  criteria_met JSONB, -- {zero_incidents_30d: true, completed_safety_course: true, ...}
  requirement_progress JSONB, -- {safety_score: {current: 85, required: 80}, ...}

  -- Timeline
  earned_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Historial de certificaciones
CREATE TABLE IF NOT EXISTS certification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  module_id UUID REFERENCES training_modules(id),

  -- Certificación
  certification_type VARCHAR(50) NOT NULL,
  certification_number VARCHAR(100) UNIQUE, -- Verificable, RSA compatible
  issuing_body VARCHAR(100), -- "Ridera Institute", "Ministry of Transport"

  -- Validez
  issued_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,

  -- Resultado de prueba
  exam_score NUMERIC(5, 2),
  exam_date TIMESTAMP,
  proctor_name VARCHAR(255),

  -- Revocación
  revoked BOOLEAN DEFAULT false,
  revocation_reason TEXT,
  revoked_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Recomendaciones de entrenamiento personalizadas
CREATE TABLE IF NOT EXISTS training_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,

  -- Recomendación
  recommendation_type VARCHAR(50) NOT NULL, -- 'risk_based', 'skill_gap', 'seasonal', 'maintenance', 'wellness'
  reason TEXT, -- "Detectamos tendencia a frenado fuerte en lluvia"
  reason_data JSONB,

  -- Urgencia
  priority VARCHAR(50) DEFAULT 'normal', -- 'critical', 'high', 'normal', 'low'
  urgency_score NUMERIC(5, 2), -- 0-100

  -- Engagement
  shown BOOLEAN DEFAULT false,
  shown_at TIMESTAMP,
  clicked BOOLEAN DEFAULT false,
  clicked_at TIMESTAMP,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMP,

  -- Validez
  recommended_at TIMESTAMP DEFAULT NOW(),
  valid_until TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Sesiones de práctica interactiva (simulador/mini-juegos)
CREATE TABLE IF NOT EXISTS practice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  skill_focus VARCHAR(50) NOT NULL, -- 'braking', 'cornering', 'emergency', 'weather', 'urban_navigation'

  -- Sesión
  scenario_type VARCHAR(50), -- 'sim_city_traffic', 'sim_wet_road', 'sim_emergency_brake', etc
  difficulty_level VARCHAR(50),
  duration_seconds INTEGER,

  -- Rendimiento
  score NUMERIC(5, 2), -- 0-100
  metrics JSONB, -- {reaction_time_ms: 250, accuracy: 95, safety_violations: 0, ...}
  performance_feedback TEXT,

  -- Completado
  completed BOOLEAN DEFAULT false,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Análisis de progreso a lo largo del tiempo
CREATE TABLE IF NOT EXISTS progress_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- Período
  period_start_date DATE,
  period_end_date DATE,

  -- Métrica de progreso
  modules_completed_this_period INTEGER DEFAULT 0,
  total_modules_completed INTEGER DEFAULT 0,
  certifications_earned INTEGER DEFAULT 0,
  badges_earned INTEGER DEFAULT 0,
  practice_sessions_count INTEGER DEFAULT 0,

  -- Mejora en habilidades
  skill_improvement JSONB, -- {city_riding: +5, safety_awareness: +8, ...}
  risk_score_change NUMERIC(5, 2), -- cambio en puntuación de riesgo (negativo es mejor)

  -- Recomendación de siguiente paso
  next_recommended_modules TEXT[],
  learning_velocity VARCHAR(50), -- 'fast', 'normal', 'slow'

  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX idx_skill_profiles_rider ON rider_skill_profiles(rider_id);
CREATE INDEX idx_skill_profiles_level ON rider_skill_profiles(overall_level);

CREATE INDEX idx_training_modules_category ON training_modules(category, difficulty_level);
CREATE INDEX idx_training_modules_active ON training_modules(is_active);

CREATE INDEX idx_training_progress_rider ON rider_training_progress(rider_id, module_id);
CREATE INDEX idx_training_progress_status ON rider_training_progress(status, created_at DESC);
CREATE INDEX idx_training_progress_completed ON rider_training_progress(passed, certification_earned);

CREATE INDEX idx_diagnostic_rider ON diagnostic_assessments(rider_id, created_at DESC);
CREATE INDEX idx_diagnostic_risk ON diagnostic_assessments(rider_id, risk_score DESC);

CREATE INDEX idx_achievements_rider ON rider_achievements(rider_id, earned_at DESC);
CREATE INDEX idx_achievements_type ON rider_achievements(badge_type);

CREATE INDEX idx_certification_rider ON certification_history(rider_id);
CREATE INDEX idx_certification_active ON certification_history(is_active, expires_at);

CREATE INDEX idx_recommendations_rider ON training_recommendations(rider_id, recommended_at DESC);
CREATE INDEX idx_recommendations_priority ON training_recommendations(priority, urgency_score DESC);

CREATE INDEX idx_practice_rider ON practice_sessions(rider_id, created_at DESC);
CREATE INDEX idx_practice_focus ON practice_sessions(skill_focus, score DESC);

CREATE INDEX idx_analytics_rider ON progress_analytics(rider_id, period_start_date DESC);

-- Activar Row Level Security
ALTER TABLE rider_skill_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE certification_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Skill Profiles (riders see own, admins see all)
CREATE POLICY "Ver perfil de habilidades propio" ON rider_skill_profiles
  FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Admin ve perfiles de habilidades" ON rider_skill_profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid() AND auth.users.raw_user_meta_data->>'role' = 'admin')
  );

-- RLS Policies: Training Modules (público lectura)
CREATE POLICY "Ver módulos de entrenamiento" ON training_modules
  FOR SELECT USING (true);

-- RLS Policies: Training Progress (riders ven propios)
CREATE POLICY "Ver progreso propio en módulos" ON rider_training_progress
  FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Actualizar progreso propio" ON rider_training_progress
  FOR UPDATE USING (auth.uid() = rider_id);

-- RLS Policies: Diagnostic Assessments (riders ven propios)
CREATE POLICY "Ver evaluación diagnóstica propia" ON diagnostic_assessments
  FOR SELECT USING (auth.uid() = rider_id);

-- RLS Policies: Achievements (riders ven propios)
CREATE POLICY "Ver logros propios" ON rider_achievements
  FOR SELECT USING (auth.uid() = rider_id);

-- RLS Policies: Certification History (riders ven propios, certificaciones verificables)
CREATE POLICY "Ver certificaciones propias" ON certification_history
  FOR SELECT USING (auth.uid() = rider_id OR is_active = true);

-- RLS Policies: Training Recommendations (riders ven propios)
CREATE POLICY "Ver recomendaciones propias" ON training_recommendations
  FOR SELECT USING (auth.uid() = rider_id);

-- RLS Policies: Practice Sessions (riders ven propios)
CREATE POLICY "Ver sesiones de práctica propias" ON practice_sessions
  FOR SELECT USING (auth.uid() = rider_id);

-- RLS Policies: Progress Analytics (riders ven propio)
CREATE POLICY "Ver análisis de progreso propio" ON progress_analytics
  FOR SELECT USING (auth.uid() = rider_id);
