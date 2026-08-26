-- ─────────────────────────────────────────────────────────────────
-- Rita Phase 4 — Seed Marketplace Data
--
-- Inicializar marketplace con listados de ejemplo y vendedores
-- ─────────────────────────────────────────────────────────────────

-- Insertar listados de ejemplo (piezas, accesorios, servicios)
INSERT INTO marketplace_listings (
  seller_id, titulo, descripcion, categoria, subcategoria, precio,
  condicion, ciudad, tags, disponible, cantidad_disponible,
  entrega_local, envio_disponible, costo_envio
) SELECT
  riders.id,
  CASE MOD(ROW_NUMBER() OVER (), 10)
    WHEN 0 THEN 'Aceite Mobil Super 20W-50 4L - Nuevo'
    WHEN 1 THEN 'Juego Pastillas Freno Yamaha MT-07'
    WHEN 2 THEN 'Cadena de Transmisión 520 - Premium'
    WHEN 3 THEN 'Llanta Michelin Pilot Street 130/70-17'
    WHEN 4 THEN 'Espejos Retrovisores Adjustables - Negro'
    WHEN 5 THEN 'Filtro de Aire BMC K&N Lavable'
    WHEN 6 THEN 'Kit Embrague Completo Honda CB500'
    WHEN 7 THEN 'Servicio Mantenimiento Moto - Medellín'
    WHEN 8 THEN 'Llanta Pirelli Diablo Rosso 2 150/60-17'
    ELSE 'Batería YTZ14S Moura - Selada'
  END,
  CASE MOD(ROW_NUMBER() OVER (), 10)
    WHEN 0 THEN 'Aceite sintético para motores de 4 tiempos. Excelente para motos deportivas y de carretera. Nuevo, sin abrir.'
    WHEN 1 THEN 'Pastillas de freno originales Yamaha. Estado como nuevo. Apenas 500km de uso.'
    WHEN 2 THEN 'Cadena de transmisión 520 paso, eslabones reforzados. Recomendada para motos potentes.'
    WHEN 3 THEN 'Llanta Michelin con poco uso, perfil profundo. Ideal para motos medianas. Garantía de uso.'
    WHEN 4 THEN 'Espejos retrovisores cromados, ajustables en todos los ángulos. Acero inoxidable.'
    WHEN 5 THEN 'Filtro de aire lavable de alto rendimiento. Aumenta potencia y ahorra en mantenimiento.'
    WHEN 6 THEN 'Kit completo de embrague para Honda CB500. Original, nunca usado. Viene con disco, plato y muelles.'
    WHEN 7 THEN 'Servicio completo: cambio de aceite, filtro, cadena y revisión general. Incluye diagnóstico gratis.'
    WHEN 8 THEN 'Pirelli Diablo Rosso 2, excelente agarre en pista. Poco uso, perfil al 80%.'
    ELSE 'Batería Moura sellada, sin mantenimiento. Compatible con Honda, Yamaha y Suzuki 1000cc+'
  END,
  CASE MOD(ROW_NUMBER() OVER (), 10)
    WHEN 0 THEN 'pieza'
    WHEN 1 THEN 'pieza'
    WHEN 2 THEN 'pieza'
    WHEN 3 THEN 'pieza'
    WHEN 4 THEN 'accesorio'
    WHEN 5 THEN 'pieza'
    WHEN 6 THEN 'pieza'
    WHEN 7 THEN 'servicio'
    WHEN 8 THEN 'pieza'
    ELSE 'pieza'
  END,
  CASE MOD(ROW_NUMBER() OVER (), 10)
    WHEN 0 THEN 'lubricante'
    WHEN 1 THEN 'frenos'
    WHEN 2 THEN 'transmisión'
    WHEN 3 THEN 'llantas'
    WHEN 4 THEN 'espejos'
    WHEN 5 THEN 'filtros'
    WHEN 6 THEN 'embrague'
    WHEN 7 THEN 'mantenimiento'
    WHEN 8 THEN 'llantas'
    ELSE 'batería'
  END,
  CASE MOD(ROW_NUMBER() OVER (), 10)
    WHEN 0 THEN 35000
    WHEN 1 THEN 180000
    WHEN 2 THEN 250000
    WHEN 3 THEN 380000
    WHEN 4 THEN 120000
    WHEN 5 THEN 95000
    WHEN 6 THEN 450000
    WHEN 7 THEN 200000
    WHEN 8 THEN 420000
    ELSE 280000
  END,
  CASE MOD(ROW_NUMBER() OVER (), 10)
    WHEN 0 THEN 'nuevo'
    WHEN 1 THEN 'usado'
    WHEN 2 THEN 'nuevo'
    WHEN 3 THEN 'usado'
    WHEN 4 THEN 'nuevo'
    WHEN 5 THEN 'nuevo'
    WHEN 6 THEN 'nuevo'
    WHEN 7 THEN 'servicio'
    WHEN 8 THEN 'usado'
    ELSE 'nuevo'
  END,
  'Medellín',
  ARRAY['moto', 'pieza', 'mantenimiento'],
  true,
  CASE MOD(ROW_NUMBER() OVER (), 10)
    WHEN 7 THEN 10
    ELSE 1
  END,
  true,
  true,
  CASE MOD(ROW_NUMBER() OVER (), 10)
    WHEN 7 THEN 0
    ELSE 15000
  END
FROM riders
LIMIT 20;

-- Crear perfiles de vendedor para los primeros 5 riders
INSERT INTO marketplace_seller_profiles (seller_id, descripcion_tienda, vendedor_verificado, insignias)
SELECT id,
  'Taller especializado en piezas y accesorios para motos. Más de 10 años de experiencia en la industria.',
  true,
  ARRAY['rapido', 'confiable']
FROM riders LIMIT 5
ON CONFLICT (seller_id) DO NOTHING;

-- Insertar vendedores adicionales de prueba (servicios)
INSERT INTO marketplace_seller_profiles (seller_id, descripcion_tienda, politica_devolucion, vendedor_verificado)
SELECT id,
  'Vendedor individual con experiencia en accesorios moteros. Entrega local en Medellín.',
  'Cambios dentro de 7 días. Producto debe estar en perfectas condiciones.',
  false
FROM riders OFFSET 5 LIMIT 5
ON CONFLICT (seller_id) DO NOTHING;
