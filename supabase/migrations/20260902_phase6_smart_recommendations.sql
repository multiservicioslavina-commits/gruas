-- ─────────────────────────────────────────────────────────────────
-- Rita Phase 6 — Smart Recommendations & Revenue Optimization
--
-- Sistema de recomendaciones inteligentes basadas en:
--   - Mantenimiento predictivo (km del rider)
--   - Estacionalidad (clima, festividades)
--   - Nivel de experiencia
--   - Patrones de conducción
--   - Compras previas (companion products)
-- ─────────────────────────────────────────────────────────────────

-- Tabla: Recomendaciones personalizadas generadas para cada rider
CREATE TABLE IF NOT EXISTS rider_product_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  product_id UUID, -- NULL si es generada dinámicamente sin producto específico
  product_name VARCHAR(255),
  product_url TEXT,
  estimated_price NUMERIC(10, 2),

  -- Tipo de recomendación y justificación
  recommendation_type VARCHAR(50) NOT NULL, -- 'maintenance', 'seasonal', 'experience', 'behavior', 'companion'
  reason TEXT, -- "Tu CB500X lleva 8,500km. Toca cambio de aceite."
  reason_data JSONB, -- {km: 8500, last_change: 8000, interval: 9000, component: 'oil'}

  -- Validez temporal
  recommended_at TIMESTAMP NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMP, -- expira después de X días

  -- Engagement tracking
  shown_in_chat BOOLEAN DEFAULT false,
  shown_at TIMESTAMP,
  clicked BOOLEAN DEFAULT false,
  clicked_at TIMESTAMP,
  purchased BOOLEAN DEFAULT false,
  purchased_at TIMESTAMP,
  purchased_amount NUMERIC(10, 2),

  -- Atribución y comisión
  conversion_source VARCHAR(50), -- 'rita_direct_click', 'search', 'other'
  commission_earned NUMERIC(10, 2), -- comisión obtenida (7% base + 3% bonus)

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Cronograma de mantenimiento predictivo
CREATE TABLE IF NOT EXISTS rider_maintenance_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  bike_id UUID REFERENCES motorcycles(id),

  -- Próximos km para cada servicio
  aceite_proximo_km INTEGER, -- cambio de aceite
  filtro_proximo_km INTEGER, -- cambio de filtro aire/aceite
  cadena_proximo_km INTEGER, -- limpieza y lubricación
  frenos_proximo_km INTEGER, -- revisión de frenos
  neumaticos_proximo_km INTEGER, -- rotación/revisión
  bateria_proximo_km INTEGER, -- revisión/carga
  correa_proximo_km INTEGER, -- revisión

  -- Estimado próximo mes (si el rider mantiene ritmo actual)
  aceite_proximo_mes INTEGER,
  filtro_proximo_mes INTEGER,
  cadena_proximo_mes INTEGER,

  -- Última actualización
  last_updated TIMESTAMP DEFAULT NOW()
);

-- Tabla: Perfil de compra e historial del rider
CREATE TABLE IF NOT EXISTS rider_shopping_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- Preferencias
  preferred_categories TEXT[], -- ['accesorios', 'herramientas', 'seguridad', 'tecnología']
  budget_min NUMERIC(10, 2),
  budget_max NUMERIC(10, 2),
  preferred_brands TEXT[], -- ['Castrol', 'Mobil', 'Shell', 'Bosch']

  -- Historial agregado
  total_purchases INTEGER DEFAULT 0,
  total_spent NUMERIC(12, 2) DEFAULT 0,
  avg_purchase_value NUMERIC(10, 2),
  last_purchase_date TIMESTAMP,

  -- Propensión a comprar
  recommendation_conversion_rate NUMERIC(5, 2), -- % de recomendaciones que convierte
  avg_days_to_purchase INTEGER, -- días entre recomendación y compra
  avg_impulse_purchase_days INTEGER, -- compras sin recomendación previas

  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Reglas de recomendación configurables
CREATE TABLE IF NOT EXISTS recommendation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL, -- "Cambio de aceite a 9000km en CB500"
  rule_type VARCHAR(50) NOT NULL, -- 'maintenance', 'seasonal', 'experience', 'behavior', 'companion'
  description TEXT,

  -- Condiciones (JSON flexible para diferentes tipos de reglas)
  condition JSONB NOT NULL, -- {km_interval: 9000, bike_pattern: "CB500*", component: "oil"}
  -- OR {season: 'rain', month: [5,6,7,8,9,10,11]}
  -- OR {experience_level: 'beginner', recommended_category: 'safety'}
  -- OR {riding_pattern: 'long_distance', recommended_category: 'luggage'}

  -- Productos a recomendar (múltiples opciones)
  product_ids UUID[] NOT NULL,
  product_names VARCHAR(255)[],

  -- Configuración
  priority INTEGER DEFAULT 1, -- 1=muy alta, 2=alta, 3=normal, 4=baja
  max_frequency_days INTEGER DEFAULT 30, -- no mostrar más de una vez cada 30 días
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: Historial de conversiones (para analytics y machine learning)
CREATE TABLE IF NOT EXISTS recommendation_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES rider_product_recommendations(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- Timeline
  shown_at TIMESTAMP,
  clicked_at TIMESTAMP,
  purchased_at TIMESTAMP,
  days_to_click INTEGER, -- segundos desde shown a click
  days_to_purchase INTEGER, -- días desde shown a compra

  -- Datos de compra
  product_id UUID,
  amount NUMERIC(10, 2),
  marketplace_order_id VARCHAR(100),

  -- Attribution
  conversion_source VARCHAR(50), -- 'direct_link', 'search', 'cart', 'other'
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),

  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX idx_recommendations_rider ON rider_product_recommendations(rider_id, recommended_at DESC);
CREATE INDEX idx_recommendations_pending ON rider_product_recommendations(rider_id, shown_in_chat) WHERE shown_in_chat = false;
CREATE INDEX idx_recommendations_conversion ON rider_product_recommendations(purchased, conversion_source);
CREATE INDEX idx_recommendations_type ON rider_product_recommendations(recommendation_type);

CREATE INDEX idx_maintenance_rider ON rider_maintenance_schedule(rider_id);
CREATE INDEX idx_maintenance_bike ON rider_maintenance_schedule(bike_id);

CREATE INDEX idx_shopping_rider ON rider_shopping_profile(rider_id);
CREATE INDEX idx_shopping_spent ON rider_shopping_profile(total_spent DESC);

CREATE INDEX idx_rules_type ON recommendation_rules(rule_type, is_active);
CREATE INDEX idx_rules_priority ON recommendation_rules(priority, is_active);

CREATE INDEX idx_conversions_rider ON recommendation_conversions(rider_id, created_at DESC);
CREATE INDEX idx_conversions_timing ON recommendation_conversions(days_to_purchase);

-- Activar Row Level Security
ALTER TABLE rider_product_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_maintenance_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_shopping_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_conversions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Recommendations
CREATE POLICY "Ver propias recomendaciones" ON rider_product_recommendations
  FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Crear recomendación propia" ON rider_product_recommendations
  FOR INSERT WITH CHECK (auth.uid() = rider_id);
CREATE POLICY "Actualizar recomendación propia" ON rider_product_recommendations
  FOR UPDATE USING (auth.uid() = rider_id);

-- RLS Policies: Maintenance Schedule
CREATE POLICY "Ver cronograma de mantenimiento propio" ON rider_maintenance_schedule
  FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Actualizar cronograma propio" ON rider_maintenance_schedule
  FOR UPDATE USING (auth.uid() = rider_id);

-- RLS Policies: Shopping Profile
CREATE POLICY "Ver perfil de compra propio" ON rider_shopping_profile
  FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Actualizar perfil de compra" ON rider_shopping_profile
  FOR UPDATE USING (auth.uid() = rider_id);

-- RLS Policies: Rules (públicas, solo lectura)
CREATE POLICY "Ver reglas de recomendación" ON recommendation_rules
  FOR SELECT USING (true);

-- RLS Policies: Conversions
CREATE POLICY "Ver conversiones propias" ON recommendation_conversions
  FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Registrar conversión propia" ON recommendation_conversions
  FOR INSERT WITH CHECK (auth.uid() = rider_id);
