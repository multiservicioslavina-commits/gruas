# Setup: Sistema de Almacenes en Ridera

Este archivo documenta las migraciones y configuración necesaria en Supabase para el sistema de almacenes.

## Tablas requeridas

### 1. `almacenes`

```sql
CREATE TABLE almacenes (
  id BIGSERIAL PRIMARY KEY,
  auth_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  ciudad TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  ubicacion TEXT,
  contacto TEXT,
  categorias TEXT,
  slug TEXT UNIQUE,
  status TEXT DEFAULT 'activo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX almacenes_auth_id ON almacenes(auth_id);
CREATE INDEX almacenes_ciudad ON almacenes(ciudad);
CREATE INDEX almacenes_slug ON almacenes(slug);
```

### 2. `almacen_productos`

```sql
CREATE TABLE almacen_productos (
  id BIGSERIAL PRIMARY KEY,
  almacen_id BIGINT NOT NULL REFERENCES almacenes(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL,
  descripcion TEXT,
  precio DECIMAL(10, 2) NOT NULL,
  stock INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX almacen_productos_almacen_id ON almacen_productos(almacen_id);
CREATE INDEX almacen_productos_categoria ON almacen_productos(categoria);
```

### 3. `almacen_analytics` (opcional, para tracking)

```sql
CREATE TABLE almacen_analytics (
  id BIGSERIAL PRIMARY KEY,
  almacen_id BIGINT NOT NULL REFERENCES almacenes(id) ON DELETE CASCADE,
  evento TEXT NOT NULL,
  fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  datos JSONB
);

CREATE INDEX almacen_analytics_almacen_id ON almacen_analytics(almacen_id);
```

## RLS Policies

### Para `almacenes`:

```sql
-- Lectura pública (para Rita y búsquedas)
CREATE POLICY "almacenes_select_public" ON almacenes
  FOR SELECT USING (status = 'activo');

-- Lectura/escritura del propietario
CREATE POLICY "almacenes_select_owner" ON almacenes
  FOR SELECT USING (auth.uid() = auth_id);

CREATE POLICY "almacenes_update_owner" ON almacenes
  FOR UPDATE USING (auth.uid() = auth_id);

CREATE POLICY "almacenes_insert_auth" ON almacenes
  FOR INSERT WITH CHECK (auth.uid() = auth_id);
```

### Para `almacen_productos`:

```sql
-- Lectura pública (para Rita)
CREATE POLICY "productos_select_public" ON almacen_productos
  FOR SELECT USING (
    almacen_id IN (
      SELECT id FROM almacenes WHERE status = 'activo'
    )
  );

-- Lectura/escritura del propietario
CREATE POLICY "productos_select_owner" ON almacen_productos
  FOR SELECT USING (
    almacen_id IN (
      SELECT id FROM almacenes WHERE auth.uid() = auth_id
    )
  );

CREATE POLICY "productos_crud_owner" ON almacen_productos
  FOR ALL USING (
    almacen_id IN (
      SELECT id FROM almacenes WHERE auth.uid() = auth_id
    )
  );
```

## Integración con Rita

En `netlify/functions/lib/supabase.js`, agregar:

```javascript
async function searchProductos(categoria, termino, ciudad) {
  const url = `${SUPABASE_URL}/rest/v1/almacen_productos?select=*,almacenes(nombre,ciudad,telefono)&categoria=ilike.%${termino}%`;
  // ...
}
```

En `netlify/functions/rita-webhook.js`, agregar intent:

```javascript
if (intent === "producto_search") {
  const term = extractSearchTerm(text, "producto_search");
  const results = term ? await searchProductos(term) : [];
  // formato y respuesta a Claude
}
```

## Datos de prueba

```sql
INSERT INTO almacenes (auth_id, nombre, ciudad, telefono, email, categorias, slug, status)
VALUES 
  ('user-id-here', 'Repuestos La Montaña', 'Medellín', '+57 300 123 4567', 'contacto@lamontana.com', 'Bujías, Filtros', 'repuestos-la-montana', 'activo');

INSERT INTO almacen_productos (almacen_id, nombre, categoria, descripcion, precio, stock)
VALUES
  (1, 'Bujía Standard Champion', 'Bujías', 'Bujía estandar para motos 125cc', 15000, 50),
  (1, 'Filtro de aire', 'Filtros', 'Filtro de aire de papel', 8500, 30);
```

## Verificación

1. Ejecutar migraciones en Supabase SQL Editor
2. Verificar que las tablas aparezcan en `Tabla Editor`
3. Probar RLS policies con usuarios autenticados
4. Registrar un almacén en `/registro-almacen.html`
5. Crear productos en `/mi-almacen.html`
6. Verificar que Rita pueda buscar productos
