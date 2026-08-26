-- ─────────────────────────────────────────────────────────────────
-- Rita Phase 3 — Navigator Motero & Academia
--
-- Navegación inteligente: rutas, POIs, talleres recomendados
-- Educación: contenido académico, tutorials, certificaciones
-- ─────────────────────────────────────────────────────────────────

-- 1. Tabla rider_routes — Rutas guardadas y favoritas
CREATE TABLE IF NOT EXISTS rider_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  nombre VARCHAR(300) NOT NULL,
  descripcion TEXT,
  origen_lat FLOAT NOT NULL,
  origen_lng FLOAT NOT NULL,
  destino_lat FLOAT NOT NULL,
  destino_lng FLOAT NOT NULL,
  km_aproximados INTEGER,
  dificultad VARCHAR(20) DEFAULT 'media', -- fácil, media, difícil
  tipo_ruta VARCHAR(50) DEFAULT 'carretera', -- carretera, montaña, ciudad, aventura

  es_favorita BOOLEAN DEFAULT FALSE,
  veces_recorrida INTEGER DEFAULT 0,
  ultima_vez DATE,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Tabla points_of_interest — Puntos de interés (talleres, gasolineras, miradores)
CREATE TABLE IF NOT EXISTS points_of_interest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  nombre VARCHAR(300) NOT NULL,
  tipo VARCHAR(50) NOT NULL, -- taller, gasolinera, hotel, restaurante, mirador, parada_segura
  descripcion TEXT,
  latitud FLOAT NOT NULL,
  longitud FLOAT NOT NULL,
  ciudad VARCHAR(100),
  telefono VARCHAR(20),
  horario VARCHAR(200),
  url VARCHAR(500),

  -- Para talleres
  especialidades TEXT[], -- "mantenimiento", "reparación_motores", "pintura", "llantas"
  precio_promedio INTEGER, -- en miles de pesos
  rating FLOAT DEFAULT 0, -- 0-5
  reviews_count INTEGER DEFAULT 0,

  creada_por UUID REFERENCES riders(id) ON DELETE SET NULL, -- rider que lo sugirió

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Tabla academic_content — Contenido educativo
CREATE TABLE IF NOT EXISTS academic_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  titulo VARCHAR(500) NOT NULL,
  descripcion TEXT,
  contenido TEXT NOT NULL, -- markdown o HTML
  categoria VARCHAR(50) NOT NULL, -- mecanica, seguridad, viajes, tecnica, legal
  nivel VARCHAR(50) DEFAULT 'principiante', -- principiante, intermedio, avanzado
  duracion_minutos INTEGER,

  -- Metadata
  imagen_url VARCHAR(500),
  video_url VARCHAR(500),
  autor VARCHAR(200),
  fuente VARCHAR(300), -- "MotoGP", "Fundación Protección Vial", etc

  es_oficial BOOLEAN DEFAULT FALSE, -- contenido verificado por Rita
  tags TEXT[],

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Tabla rider_learning_progress — Progreso del rider en educación
CREATE TABLE IF NOT EXISTS rider_learning_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES academic_content(id) ON DELETE CASCADE,

  completado BOOLEAN DEFAULT FALSE,
  fecha_completado DATE,
  tiempo_dedicado_minutos INTEGER,
  calificacion INTEGER, -- 1-5

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(rider_id, content_id)
);

-- 5. Tabla rider_certifications — Certificaciones y logros
CREATE TABLE IF NOT EXISTS rider_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  titulo VARCHAR(300) NOT NULL, -- "Mantenimiento Básico", "Seguridad Vial", etc
  descripcion TEXT,
  fecha_obtenida DATE NOT NULL,
  emitida_por VARCHAR(200), -- "Rita Academy", "Moto Escuela ABC", etc
  valida_hasta DATE,
  imagen_certificado_url VARCHAR(500),

  created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Tabla mechanic_directory — Directorio de mecánicos confiables
CREATE TABLE IF NOT EXISTS mechanic_directory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poi_id UUID REFERENCES points_of_interest(id) ON DELETE CASCADE, -- puede ser null si no es POI

  nombre_mecanico VARCHAR(200) NOT NULL,
  especialidad VARCHAR(100), -- "motor", "frenos", "electricidad", "transmisión"
  experiencia_años INTEGER,
  ciudad VARCHAR(100) NOT NULL,
  telefono VARCHAR(20),
  whatsapp VARCHAR(20),

  -- Verificación
  recomendado_por_riders INTEGER DEFAULT 0,
  rating FLOAT DEFAULT 0,
  es_verificado BOOLEAN DEFAULT FALSE, -- verificado por community

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 7. Tabla navigation_preferences — Preferencias de navegación
CREATE TABLE IF NOT EXISTS navigation_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL UNIQUE REFERENCES riders(id) ON DELETE CASCADE,

  mostrar_talleres BOOLEAN DEFAULT TRUE,
  mostrar_gasolineras BOOLEAN DEFAULT TRUE,
  mostrar_hoteles BOOLEAN DEFAULT FALSE,
  mostrar_restaurantes BOOLEAN DEFAULT FALSE,
  mostrar_miradores BOOLEAN DEFAULT TRUE,

  evitar_vias_peligrosas BOOLEAN DEFAULT TRUE,
  evitar_lluvia BOOLEAN DEFAULT FALSE, -- reroute si hay lluvia

  preferencia_ruta VARCHAR(50) DEFAULT 'equilibrio', -- rapida, segura, scenic, equilibrio

  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_routes_rider ON rider_routes(rider_id);
CREATE INDEX IF NOT EXISTS idx_routes_favorita ON rider_routes(es_favorita);
CREATE INDEX IF NOT EXISTS idx_poi_tipo ON points_of_interest(tipo);
CREATE INDEX IF NOT EXISTS idx_poi_ciudad ON points_of_interest(ciudad);
CREATE INDEX IF NOT EXISTS idx_academic_categoria ON academic_content(categoria);
CREATE INDEX IF NOT EXISTS idx_academic_nivel ON academic_content(nivel);
CREATE INDEX IF NOT EXISTS idx_learning_rider ON rider_learning_progress(rider_id);
CREATE INDEX IF NOT EXISTS idx_learning_content ON rider_learning_progress(content_id);
CREATE INDEX IF NOT EXISTS idx_certifications_rider ON rider_certifications(rider_id);
CREATE INDEX IF NOT EXISTS idx_mechanic_ciudad ON mechanic_directory(ciudad);
CREATE INDEX IF NOT EXISTS idx_mechanic_especialidad ON mechanic_directory(especialidad);

-- RLS
ALTER TABLE rider_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_of_interest ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_learning_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE mechanic_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE navigation_preferences ENABLE ROW LEVEL SECURITY;

-- Políticas: service role (Rita) puede leer/escribir todo
CREATE POLICY "service_role_access" ON rider_routes
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON points_of_interest
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON academic_content
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON rider_learning_progress
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON rider_certifications
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON mechanic_directory
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_access" ON navigation_preferences
  FOR ALL USING (auth.role() = 'service_role');
