-- ─────────────────────────────────────────────────────────────────
-- Rita Phase 4 — Marketplace Motero
--
-- Compra y venta de piezas y servicios entre riders:
--   - Listados de productos (nuevos, usados, servicios)
--   - Búsqueda y descubrimiento
--   - Transacciones y pagos
--   - Reseñas y calificaciones de vendedores
-- ─────────────────────────────────────────────────────────────────

-- Crear tabla de productos/servicios en venta
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT,
  categoria VARCHAR(50) NOT NULL, -- 'pieza', 'servicio', 'moto_completa', 'accesorio'
  subcategoria VARCHAR(100),
  precio NUMERIC(12, 2) NOT NULL,
  condicion VARCHAR(20) DEFAULT 'nuevo', -- 'nuevo', 'usado', 'refurbished'
  tipo_venta VARCHAR(20) DEFAULT 'venta', -- 'venta', 'alquiler', 'trueque'
  ubicacion_lat NUMERIC(10, 8),
  ubicacion_lng NUMERIC(11, 8),
  ciudad VARCHAR(100),
  imagenes TEXT[], -- URLs de imágenes
  tags TEXT[],
  disponible BOOLEAN DEFAULT true,
  cantidad_disponible INTEGER DEFAULT 1,
  entrega_local BOOLEAN DEFAULT false,
  envio_disponible BOOLEAN DEFAULT true,
  costo_envio NUMERIC(10, 2),
  rating_promedio NUMERIC(3, 2) DEFAULT 0,
  cantidad_resenas INTEGER DEFAULT 0,
  veces_consultado INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Crear tabla de compras/pedidos
CREATE TABLE IF NOT EXISTS marketplace_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  cantidad INTEGER DEFAULT 1,
  precio_unitario NUMERIC(12, 2) NOT NULL,
  precio_total NUMERIC(12, 2) NOT NULL,
  estado VARCHAR(30) DEFAULT 'pendiente', -- 'pendiente', 'confirmado', 'pagado', 'enviado', 'entregado', 'cancelado'
  metodo_pago VARCHAR(50), -- 'transferencia', 'efectivo', 'daviplata', 'nequi'
  direccion_entrega TEXT,
  fecha_estimada_entrega DATE,
  fecha_entrega TIMESTAMP,
  comentarios_comprador TEXT,
  comentarios_vendedor TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Crear tabla de reseñas de vendedores
CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  reviewed_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  tipo_resena VARCHAR(20) DEFAULT 'vendedor', -- 'vendedor', 'comprador'
  calificacion INTEGER CHECK (calificacion BETWEEN 1 AND 5),
  titulo VARCHAR(255),
  contenido TEXT,
  aspectos_positivos TEXT[], -- ['rapidez', 'comunicacion', 'calidad', 'seguridad']
  aspectos_negativos TEXT[],
  recomendaria BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Crear tabla de mensajes entre comprador y vendedor
CREATE TABLE IF NOT EXISTS marketplace_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  remitente_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  destinatario_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  contenido TEXT NOT NULL,
  adjuntos TEXT[], -- URLs de imágenes/archivos
  leido BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Crear tabla de favoritos del marketplace
CREATE TABLE IF NOT EXISTS marketplace_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(rider_id, listing_id)
);

-- Crear tabla de historial de búsquedas
CREATE TABLE IF NOT EXISTS marketplace_search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  termino_busqueda VARCHAR(255),
  categoria VARCHAR(50),
  ciudad VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Crear tabla de vendedores verificados
CREATE TABLE IF NOT EXISTS marketplace_seller_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL UNIQUE REFERENCES riders(id) ON DELETE CASCADE,
  descripcion_tienda TEXT,
  horario_atencion VARCHAR(255),
  politica_devolucion TEXT,
  tiempo_respuesta_promedio_horas INTEGER,
  tasa_finalizacion_ordenes NUMERIC(3, 2), -- 0-1
  vendedor_verificado BOOLEAN DEFAULT false,
  insignias TEXT[], -- ['rapido', 'confiable', 'comunicativo']
  bloqueado BOOLEAN DEFAULT false,
  razon_bloqueo TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Crear índices para búsquedas rápidas
CREATE INDEX idx_listings_seller ON marketplace_listings(seller_id);
CREATE INDEX idx_listings_categoria ON marketplace_listings(categoria, condicion);
CREATE INDEX idx_listings_ciudad ON marketplace_listings(ciudad);
CREATE INDEX idx_listings_disponible ON marketplace_listings(disponible);
CREATE INDEX idx_listings_created ON marketplace_listings(created_at DESC);
CREATE INDEX idx_orders_buyer ON marketplace_orders(buyer_id);
CREATE INDEX idx_orders_seller ON marketplace_orders(seller_id);
CREATE INDEX idx_orders_estado ON marketplace_orders(estado);
CREATE INDEX idx_reviews_reviewed ON marketplace_reviews(reviewed_id);
CREATE INDEX idx_messages_listing ON marketplace_messages(listing_id);
CREATE INDEX idx_messages_riders ON marketplace_messages(remitente_id, destinatario_id);
CREATE INDEX idx_favorites_rider ON marketplace_favorites(rider_id);
CREATE INDEX idx_seller_profiles_seller ON marketplace_seller_profiles(seller_id);

-- Activar RLS
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_seller_profiles ENABLE ROW LEVEL SECURITY;

-- RLS: Listings - todos pueden ver, service_role es owner
CREATE POLICY "Listings visible a todos" ON marketplace_listings FOR SELECT USING (true);
CREATE POLICY "Seller puede editar sus listings" ON marketplace_listings FOR UPDATE USING (auth.uid() = seller_id);
CREATE POLICY "Seller puede crear listings" ON marketplace_listings FOR INSERT WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Seller puede eliminar sus listings" ON marketplace_listings FOR DELETE USING (auth.uid() = seller_id);

-- RLS: Orders - solo participantes y service_role
CREATE POLICY "Ver propias órdenes" ON marketplace_orders FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "Comprador puede crear orden" ON marketplace_orders FOR INSERT WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "Participantes pueden actualizar orden" ON marketplace_orders FOR UPDATE USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- RLS: Reviews - solo participantes
CREATE POLICY "Ver reseñas de vendedores" ON marketplace_reviews FOR SELECT USING (true);
CREATE POLICY "Crear reseña propia" ON marketplace_reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

-- RLS: Messages - solo participantes
CREATE POLICY "Ver propios mensajes" ON marketplace_messages FOR SELECT USING (auth.uid() = remitente_id OR auth.uid() = destinatario_id);
CREATE POLICY "Enviar mensaje" ON marketplace_messages FOR INSERT WITH CHECK (auth.uid() = remitente_id);

-- RLS: Favorites - solo del usuario
CREATE POLICY "Ver propios favoritos" ON marketplace_favorites FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Agregar favorito" ON marketplace_favorites FOR INSERT WITH CHECK (auth.uid() = rider_id);
CREATE POLICY "Eliminar favorito" ON marketplace_favorites FOR DELETE USING (auth.uid() = rider_id);

-- RLS: Search history - solo del usuario
CREATE POLICY "Ver propio historial" ON marketplace_search_history FOR SELECT USING (auth.uid() = rider_id);
CREATE POLICY "Guardar búsqueda" ON marketplace_search_history FOR INSERT WITH CHECK (auth.uid() = rider_id);

-- RLS: Seller profiles - público
CREATE POLICY "Ver perfiles de vendedores" ON marketplace_seller_profiles FOR SELECT USING (true);
CREATE POLICY "Vendedor puede editar perfil" ON marketplace_seller_profiles FOR UPDATE USING (auth.uid() = seller_id);
