-- ─────────────────────────────────────────────────────────────────
-- Rita Phase 5 — Analytics Motero
--
-- Análisis de datos de conducción y rutas:
--   - Estadísticas personales de viajes
--   - Análisis de patrones de conducción
--   - Comparativas con la comunidad
--   - Reportes de progreso y mejora
-- ─────────────────────────────────────────────────────────────────

-- Crear tabla de sesiones de conducción
CREATE TABLE IF NOT EXISTS rider_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  fecha_inicio TIMESTAMP NOT NULL,
  fecha_fin TIMESTAMP,
  duracion_minutos INTEGER,
  distancia_km NUMERIC(8, 2),
  velocidad_promedio NUMERIC(6, 2),
  velocidad_maxima NUMERIC(6, 2),
  consumo_combustible_litros NUMERIC(6, 3),
  ruta_id UUID REFERENCES rider_routes(id),
  clima VARCHAR(50),
  tipo_via VARCHAR(50), -- 'ciudad', 'carretera', 'autopista', 'montaña'
  seguridad_score INTEGER DEFAULT 100, -- 0-100
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Crear tabla de estadísticas diarias agregadas
CREATE TABLE IF NOT EXISTS rider_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  total_sesiones INTEGER DEFAULT 0,
  total_distancia_km NUMERIC(10, 2) DEFAULT 0,
  total_duracion_minutos INTEGER DEFAULT 0,
  velocidad_promedio NUMERIC(6, 2),
  velocidad_maxima NUMERIC(6, 2),
  consumo_total_litros NUMERIC(8, 3),
  seguridad_score_promedio NUMERIC(5, 2),
  condiciones_clima VARCHAR(100)[],
  UNIQUE(rider_id, fecha),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Crear tabla de estadísticas mensuales
CREATE TABLE IF NOT EXISTS rider_monthly_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  mes DATE NOT NULL, -- Primer día del mes
  total_sesiones INTEGER DEFAULT 0,
  total_distancia_km NUMERIC(10, 2) DEFAULT 0,
  total_duracion_horas NUMERIC(8, 2) DEFAULT 0,
  velocidad_promedio NUMERIC(6, 2),
  velocidad_maxima NUMERIC(6, 2),
  consumo_total_litros NUMERIC(8, 3),
  seguridad_score_promedio NUMERIC(5, 2),
  via_favorita VARCHAR(50),
  dias_con_actividad INTEGER,
  UNIQUE(rider_id, mes),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Crear tabla de análisis de rutas
CREATE TABLE IF NOT EXISTS route_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES rider_routes(id) ON DELETE CASCADE,
  veces_recorrida INTEGER DEFAULT 0,
  distancia_total_km NUMERIC(10, 2),
  duracion_promedio_minutos NUMERIC(8, 2),
  velocidad_promedio_km_h NUMERIC(6, 2),
  seguridad_score_promedio NUMERIC(5, 2),
  clima_predominante VARCHAR(50),
  hora_pico_inicio TIME,
  hora_pico_fin TIME,
  rating_dificultad_promedio NUMERIC(3, 2), -- 1-5
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Crear tabla de patrones de conducción
CREATE TABLE IF NOT EXISTS riding_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  patron_tipo VARCHAR(50), -- 'madrugador', 'nocturno', 'fin_de_semana', 'lunes_viernes'
  hora_promedio_inicio TIME,
  duracion_promedio_minutos INTEGER,
  velocidad_tipica NUMERIC(6, 2),
  via_preferida VARCHAR(50),
  frecuencia_semanal NUMERIC(4, 1),
  seguridad_score INTEGER,
  consistencia_porcentaje NUMERIC(5, 2), -- 0-100
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Crear tabla de benchmarking con comunidad
CREATE TABLE IF NOT EXISTS community_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metrica VARCHAR(100), -- 'velocidad_promedio', 'seguridad', 'distancia_mensual', etc
  valor_promedio NUMERIC(12, 2),
  valor_percentil_25 NUMERIC(12, 2),
  valor_percentil_50 NUMERIC(12, 2),
  valor_percentil_75 NUMERIC(12, 2),
  valor_percentil_90 NUMERIC(12, 2),
  total_riders INTEGER,
  fecha_calculo DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Crear tabla de logros y hitos
CREATE TABLE IF NOT EXISTS rider_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  tipo_logro VARCHAR(50), -- 'km_totales', 'dias_consecutivos', 'seguridad_perfecta', 'viajero', 'experto_ruta'
  descripcion VARCHAR(255),
  valor_alcanzado NUMERIC(12, 2),
  valor_requerido NUMERIC(12, 2),
  completado BOOLEAN DEFAULT false,
  fecha_alcance TIMESTAMP,
  insignia_emoji VARCHAR(10),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Crear tabla de alertas de seguridad y tendencias
CREATE TABLE IF NOT EXISTS safety_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  tipo_insight VARCHAR(100), -- 'exceso_velocidad_tendencia', 'mejora_seguridad', 'via_peligrosa', etc
  descripcion TEXT,
  recomendacion TEXT,
  nivel_urgencia VARCHAR(20), -- 'info', 'advertencia', 'critico'
  fecha_deteccion TIMESTAMP DEFAULT NOW(),
  leido BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Crear índices para búsquedas rápidas
CREATE INDEX idx_sessions_rider ON rider_sessions(rider_id);
CREATE INDEX idx_sessions_fecha ON rider_sessions(fecha_inicio DESC);
CREATE INDEX idx_sessions_ruta ON rider_sessions(ruta_id);
CREATE INDEX idx_daily_stats_rider ON rider_daily_stats(rider_id, fecha DESC);
CREATE INDEX idx_monthly_stats_rider ON rider_monthly_stats(rider_id, mes DESC);
CREATE INDEX idx_route_analytics_route ON route_analytics(route_id);
CREATE INDEX idx_patterns_rider ON riding_patterns(rider_id);
CREATE INDEX idx_benchmarks_metrica ON community_benchmarks(metrica);
CREATE INDEX idx_milestones_rider ON rider_milestones(rider_id);
CREATE INDEX idx_safety_insights_rider ON safety_insights(rider_id, leido);

-- Activar RLS
ALTER TABLE rider_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_monthly_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE riding_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_insights ENABLE ROW LEVEL SECURITY;

-- RLS: Sessions - solo del rider
CREATE POLICY "Ver propias sesiones" ON rider_sessions FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Crear sesión propia" ON rider_sessions FOR INSERT WITH CHECK (auth.uid() = rider_id);
CREATE POLICY "Actualizar sesión propia" ON rider_sessions FOR UPDATE USING (auth.uid() = rider_id);

-- RLS: Daily stats - solo del rider
CREATE POLICY "Ver estadísticas diarias propias" ON rider_daily_stats FOR SELECT USING (auth.uid() = rider_id);

-- RLS: Monthly stats - solo del rider
CREATE POLICY "Ver estadísticas mensuales propias" ON rider_monthly_stats FOR SELECT USING (auth.uid() = rider_id);

-- RLS: Route analytics - público (todos ven estadísticas de rutas)
CREATE POLICY "Ver análisis de rutas" ON route_analytics FOR SELECT USING (true);

-- RLS: Patterns - solo del rider
CREATE POLICY "Ver patrones propios" ON riding_patterns FOR SELECT USING (auth.uid() = rider_id);

-- RLS: Benchmarks - público
CREATE POLICY "Ver benchmarks comunidad" ON community_benchmarks FOR SELECT USING (true);

-- RLS: Milestones - solo del rider
CREATE POLICY "Ver logros propios" ON rider_milestones FOR SELECT USING (auth.uid() = rider_id);

-- RLS: Safety insights - solo del rider
CREATE POLICY "Ver alertas de seguridad propias" ON safety_insights FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Crear alerta de seguridad" ON safety_insights FOR INSERT WITH CHECK (auth.uid() = rider_id);
