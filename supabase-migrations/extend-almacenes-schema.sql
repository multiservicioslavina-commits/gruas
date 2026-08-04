-- Extensión del schema almacenes para soportar el formulario completo de WordPress
-- Este migration agrega campos para logo, fotos, categorias, marcas, horarios y opciones de entrega

-- Agregar columnas a la tabla almacenes si no existen
ALTER TABLE almacenes
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS fotos_urls JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS categorias JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS brands JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS delivery_options JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS ubicacion TEXT,
ADD COLUMN IF NOT EXISTS contacto_nombre TEXT;

-- Crear tabla para horarios de atención (permite múltiples rangos de hora por día)
CREATE TABLE IF NOT EXISTS almacen_horarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id UUID NOT NULL REFERENCES almacenes(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL, -- 0=domingo, 1=lunes, ..., 6=sabado
  hora_apertura TIME NOT NULL,
  hora_cierre TIME NOT NULL,
  abierto BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_almacen_horarios_almacen_id ON almacen_horarios(almacen_id);
CREATE INDEX IF NOT EXISTS idx_almacen_horarios_dia ON almacen_horarios(almacen_id, dia_semana);

-- RLS: permitir que dueños vean/editen sus propios horarios
ALTER TABLE almacen_horarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY almacen_horarios_owner_access ON almacen_horarios
  USING (almacen_id IN (
    SELECT id FROM almacenes WHERE auth_id = auth.uid()
  ));

CREATE POLICY almacen_horarios_owner_insert ON almacen_horarios
  FOR INSERT WITH CHECK (almacen_id IN (
    SELECT id FROM almacenes WHERE auth_id = auth.uid()
  ));
