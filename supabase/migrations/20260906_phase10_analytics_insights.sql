-- ─────────────────────────────────────────────────────────────────
-- Rita Phase 10 — Analytics & Insights Engine
--
-- Infraestructura para:
--   - Análisis de comportamiento de riders (patrones, tendencias, anomalías)
--   - Insights de comunidad (rutas populares, horarios de pico, estadísticas de seguridad)
--   - Métricas de desempeño del sistema (uptime, latencia, tráfico)
--   - Análisis predictivo para detección de riesgos futuros
--   - Dashboard de insights personalizados por rider
--   - Alertas inteligentes basadas en patrones detectados
--   - Reportes analíticos agregados para operaciones
-- ─────────────────────────────────────────────────────────────────

-- Tabla: Métricas diarias de comportamiento de rider
CREATE TABLE IF NOT EXISTS daily_rider_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- Fecha
  metric_date DATE NOT NULL,

  -- Conducción
  total_km NUMERIC(7, 2),
  total_rides INTEGER,
  avg_ride_duration_minutes INTEGER,
  max_speed_kmh NUMERIC(5, 1),
  avg_speed_kmh NUMERIC(5, 1),

  -- Seguridad
  hard_braking_count INTEGER DEFAULT 0,
  rapid_acceleration_count INTEGER DEFAULT 0,
  sharp_turn_count INTEGER DEFAULT 0,
  speed_violations INTEGER DEFAULT 0,
  traffic_violations INTEGER DEFAULT 0,

  -- Riesgo calculado
  daily_risk_score NUMERIC(5, 2), -- 0-100
  risk_trend VARCHAR(50), -- 'improving', 'stable', 'worsening'

  -- Ubicación
  top_city VARCHAR(100),
  top_route VARCHAR(255),

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Métricas agregadas por ruta
CREATE TABLE IF NOT EXISTS route_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID REFERENCES rita_rutas(id),
  route_name VARCHAR(255) NOT NULL,

  -- Período
  analytics_date DATE,
  period_type VARCHAR(50), -- 'daily', 'weekly', 'monthly'

  -- Uso
  total_riders INTEGER DEFAULT 0,
  total_rides INTEGER DEFAULT 0,
  unique_riders INTEGER DEFAULT 0,
  avg_ride_duration_minutes INTEGER,

  -- Seguridad
  incident_count INTEGER DEFAULT 0,
  avg_risk_score NUMERIC(5, 2),
  high_risk_riders INTEGER DEFAULT 0,

  -- Popularidad
  popularity_score NUMERIC(5, 2), -- 0-100 basado en uso
  best_time_to_ride VARCHAR(50), -- 'morning', 'afternoon', 'evening', 'night'
  peak_hour INTEGER, -- hora con más tráfico

  -- Condiciones
  avg_weather_rating NUMERIC(3, 2), -- 1-5
  road_condition_reports INTEGER DEFAULT 0,
  construction_alerts INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Anomalías detectadas en comportamiento
CREATE TABLE IF NOT EXISTS behavior_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- Anomalía
  anomaly_type VARCHAR(50) NOT NULL, -- 'speed_surge', 'unsafe_pattern', 'unusual_location', 'accident_risk', 'missing_rides'
  severity VARCHAR(50), -- 'low', 'medium', 'high', 'critical'
  confidence_level NUMERIC(5, 2), -- 0-100, qué tan seguro es que es anomalía

  -- Contexto
  description TEXT,
  detected_value NUMERIC(7, 2),
  normal_range_min NUMERIC(7, 2),
  normal_range_max NUMERIC(7, 2),

  -- Datos históricos para comparación
  baseline_data JSONB, -- {avg_speed: 45, typical_time: "14:30", ...}
  historical_context JSONB, -- {last_7_days_avg: 43, trend: "increasing", ...}

  -- Acción tomada
  rider_notified BOOLEAN DEFAULT false,
  notification_sent_at TIMESTAMP,
  rider_acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMP,

  -- Validación posterior
  was_false_positive BOOLEAN,
  actual_explanation TEXT,

  detected_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Predicciones de riesgo futuro
CREATE TABLE IF NOT EXISTS risk_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- Predicción
  prediction_type VARCHAR(50) NOT NULL, -- 'accident_risk', 'traffic_violation', 'incident_probability'
  predicted_risk_level VARCHAR(50), -- 'low', 'moderate', 'high', 'critical'
  confidence_percentage NUMERIC(5, 2), -- 0-100, confianza en la predicción

  -- Ventana de tiempo
  prediction_start_date DATE,
  prediction_end_date DATE,

  -- Factores contribuyentes
  contributing_factors TEXT[], -- ["speeding_trend", "new_area", "bad_weather_forecast", ...]
  risk_factors_data JSONB, -- {speeding_trend: +12%, new_area_unfamiliar: true, ...}

  -- Recomendaciones
  recommended_actions TEXT[], -- ["reduce_speed", "take_safety_course", "use_familiar_routes", ...]
  recommended_training_modules UUID[], -- módulos de entrenamiento recomendados

  -- Validación
  prediction_outcome VARCHAR(50), -- 'accurate', 'partial', 'inaccurate' (calculado después)
  actual_outcome TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Cohorts de riders para segmentación
CREATE TABLE IF NOT EXISTS rider_cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Definición del cohort
  cohort_name VARCHAR(255) NOT NULL,
  cohort_description TEXT,
  cohort_type VARCHAR(50), -- 'behavior', 'demographics', 'risk_level', 'engagement', 'geographic'

  -- Criterios
  selection_criteria JSONB, -- {age_range: [25, 35], avg_monthly_km: [500, 1000], risk_score: [0, 30], ...}
  rider_count INTEGER DEFAULT 0,

  -- Características
  avg_metrics JSONB, -- {avg_monthly_km: 750, avg_risk_score: 25, avg_age: 28, ...}
  characteristics TEXT[],

  -- Tendencias
  growth_rate NUMERIC(5, 2), -- % de crecimiento del cohort mes a mes
  churn_rate NUMERIC(5, 2), -- % de riders que salen del cohort

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Insights personalizados por rider
CREATE TABLE IF NOT EXISTS rider_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- Insight
  insight_type VARCHAR(50) NOT NULL, -- 'safety_improvement', 'efficiency_tip', 'achievement', 'risk_alert', 'community_stat'
  insight_title VARCHAR(255),
  insight_description TEXT,
  insight_data JSONB, -- {metric_improved: "braking", improvement_percent: 15, ...}

  -- Importancia
  priority INTEGER DEFAULT 3, -- 1=urgente, 2=alto, 3=normal, 4=bajo
  impact_score NUMERIC(5, 2), -- estimado del impacto de seguir el consejo

  -- Engagement
  shown_at TIMESTAMP,
  clicked_at TIMESTAMP,
  acted_upon BOOLEAN DEFAULT false,
  action_taken_at TIMESTAMP,

  -- Duración
  valid_until TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Benchmarks comunitarios
CREATE TABLE IF NOT EXISTS community_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Benchmark
  benchmark_type VARCHAR(50) NOT NULL, -- 'safety', 'efficiency', 'participation', 'training'
  benchmark_name VARCHAR(255),
  benchmark_date DATE,

  -- Datos agregados
  metric_name VARCHAR(100),
  percentile_10 NUMERIC(7, 2),
  percentile_25 NUMERIC(7, 2),
  percentile_50 NUMERIC(7, 2), -- mediana
  percentile_75 NUMERIC(7, 2),
  percentile_90 NUMERIC(7, 2),

  mean_value NUMERIC(7, 2),
  stddev NUMERIC(7, 2),

  -- Segmentación
  segment VARCHAR(100), -- 'all_riders', 'city', 'highway', 'experienced', etc

  -- Comparación temporal
  prev_period_value NUMERIC(7, 2),
  change_percent NUMERIC(5, 2),
  trend_direction VARCHAR(50), -- 'improving', 'stable', 'declining'

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Alertas activas generadas por análisis
CREATE TABLE IF NOT EXISTS analytics_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID REFERENCES riders(id) ON DELETE CASCADE, -- NULL = alert global para operaciones

  -- Alerta
  alert_type VARCHAR(50) NOT NULL, -- 'anomaly_detected', 'risk_increasing', 'achievement_unlocked', 'maintenance_due', 'community_milestone'
  alert_severity VARCHAR(50), -- 'info', 'warning', 'critical'
  alert_title VARCHAR(255),
  alert_message TEXT,

  -- Datos
  related_data JSONB,
  action_required BOOLEAN DEFAULT false,
  suggested_action VARCHAR(255),

  -- Status
  active BOOLEAN DEFAULT true,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMP,
  acknowledged_by VARCHAR(100), -- rider o admin

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Dashboard del sistema (agregados globales)
CREATE TABLE IF NOT EXISTS system_dashboard_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Período
  metric_date DATE,

  -- Riders
  total_active_riders INTEGER,
  new_riders_today INTEGER,
  returning_riders_today INTEGER,
  churn_riders INTEGER,

  -- Actividad
  total_messages_processed INTEGER,
  avg_response_time_ms INTEGER,
  tools_executed INTEGER,

  -- Seguridad
  avg_risk_score NUMERIC(5, 2),
  high_risk_riders INTEGER,
  incident_count INTEGER,
  emergency_alerts INTEGER,

  -- Sistema
  api_uptime_percent NUMERIC(5, 2),
  error_rate_percent NUMERIC(5, 2),
  peak_qps INTEGER, -- queries per second

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Eventos analíticos granulares (log de eventos)
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID REFERENCES riders(id) ON DELETE CASCADE,

  -- Evento
  event_type VARCHAR(50) NOT NULL, -- 'route_completed', 'training_started', 'achievement_earned', 'tool_used', 'safety_event'
  event_name VARCHAR(100),
  event_properties JSONB, -- propiedades específicas del evento

  -- Contexto
  session_id VARCHAR(100),
  timestamp_ms BIGINT,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Reportes programados
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID REFERENCES riders(id) ON DELETE CASCADE, -- NULL = report global

  -- Configuración
  report_type VARCHAR(50) NOT NULL, -- 'weekly_summary', 'monthly_safety', 'achievement_report', 'community_trends'
  report_frequency VARCHAR(50), -- 'daily', 'weekly', 'monthly', 'quarterly'
  report_format VARCHAR(50), -- 'email', 'whatsapp', 'dashboard', 'pdf'

  -- Distribución
  recipient_email VARCHAR(255),
  recipient_phone VARCHAR(20),
  recipient_role VARCHAR(50), -- 'rider', 'admin', 'analyst'

  -- Control
  active BOOLEAN DEFAULT true,
  last_sent_at TIMESTAMP,
  next_send_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX idx_daily_rider_metrics_rider_date ON daily_rider_metrics(rider_id, metric_date DESC);
CREATE INDEX idx_daily_rider_metrics_date ON daily_rider_metrics(metric_date DESC);
CREATE INDEX idx_daily_rider_metrics_risk ON daily_rider_metrics(daily_risk_score DESC);

CREATE INDEX idx_route_analytics_date ON route_analytics(analytics_date DESC);
CREATE INDEX idx_route_analytics_route ON route_analytics(route_id, analytics_date DESC);
CREATE INDEX idx_route_analytics_popularity ON route_analytics(popularity_score DESC);

CREATE INDEX idx_behavior_anomalies_rider ON behavior_anomalies(rider_id, detected_at DESC);
CREATE INDEX idx_behavior_anomalies_type ON behavior_anomalies(anomaly_type, severity);
CREATE INDEX idx_behavior_anomalies_severity ON behavior_anomalies(severity, confidence_level DESC);

CREATE INDEX idx_risk_predictions_rider ON risk_predictions(rider_id, prediction_start_date);
CREATE INDEX idx_risk_predictions_level ON risk_predictions(predicted_risk_level, confidence_percentage DESC);
CREATE INDEX idx_risk_predictions_date_range ON risk_predictions(prediction_start_date, prediction_end_date);

CREATE INDEX idx_rider_cohorts_type ON rider_cohorts(cohort_type);
CREATE INDEX idx_rider_cohorts_growth ON rider_cohorts(growth_rate DESC);

CREATE INDEX idx_rider_insights_rider ON rider_insights(rider_id, created_at DESC);
CREATE INDEX idx_rider_insights_priority ON rider_insights(rider_id, priority, valid_until);

CREATE INDEX idx_community_benchmarks_date ON community_benchmarks(benchmark_date DESC);
CREATE INDEX idx_community_benchmarks_type ON community_benchmarks(benchmark_type, segment);

CREATE INDEX idx_analytics_alerts_rider ON analytics_alerts(rider_id, created_at DESC);
CREATE INDEX idx_analytics_alerts_active ON analytics_alerts(active, alert_severity);

CREATE INDEX idx_system_dashboard_date ON system_dashboard_metrics(metric_date DESC);

CREATE INDEX idx_analytics_events_rider_type ON analytics_events(rider_id, event_type, created_at DESC);
CREATE INDEX idx_analytics_events_session ON analytics_events(session_id);

CREATE INDEX idx_scheduled_reports_rider ON scheduled_reports(rider_id);
CREATE INDEX idx_scheduled_reports_next_send ON scheduled_reports(next_send_at);

-- Activar Row Level Security
ALTER TABLE daily_rider_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavior_anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_dashboard_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Daily Rider Metrics (riders ven propios)
CREATE POLICY "Ver métricas propias diarias" ON daily_rider_metrics
  FOR SELECT USING (auth.uid() = rider_id);

-- RLS Policies: Route Analytics (público lectura)
CREATE POLICY "Ver análisis de rutas" ON route_analytics
  FOR SELECT USING (true);

-- RLS Policies: Behavior Anomalies (riders ven propios, admins ven todos)
CREATE POLICY "Ver anomalías propias" ON behavior_anomalies
  FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Admin ve anomalías" ON behavior_anomalies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid() AND auth.users.raw_user_meta_data->>'role' = 'admin')
  );

-- RLS Policies: Risk Predictions (riders ven propios)
CREATE POLICY "Ver predicciones propias" ON risk_predictions
  FOR SELECT USING (auth.uid() = rider_id);

-- RLS Policies: Rider Cohorts (público lectura)
CREATE POLICY "Ver cohorts" ON rider_cohorts
  FOR SELECT USING (true);

-- RLS Policies: Rider Insights (riders ven propios)
CREATE POLICY "Ver insights propios" ON rider_insights
  FOR SELECT USING (auth.uid() = rider_id);

-- RLS Policies: Community Benchmarks (público lectura)
CREATE POLICY "Ver benchmarks comunitarios" ON community_benchmarks
  FOR SELECT USING (true);

-- RLS Policies: Analytics Alerts (riders ven propios, admins ven todos)
CREATE POLICY "Ver alertas propias" ON analytics_alerts
  FOR SELECT USING (auth.uid() = rider_id OR rider_id IS NULL);

-- RLS Policies: System Dashboard (admin solo)
CREATE POLICY "Admin ve dashboard" ON system_dashboard_metrics
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid() AND auth.users.raw_user_meta_data->>'role' = 'admin')
  );

-- RLS Policies: Analytics Events (riders ven propios, admins ven todos)
CREATE POLICY "Ver eventos propios" ON analytics_events
  FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Admin ve eventos" ON analytics_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid() AND auth.users.raw_user_meta_data->>'role' = 'admin')
  );

-- RLS Policies: Scheduled Reports (riders ven propios, admins ven todos)
CREATE POLICY "Ver reportes propios" ON scheduled_reports
  FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Admin ve reportes" ON scheduled_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid() AND auth.users.raw_user_meta_data->>'role' = 'admin')
  );
