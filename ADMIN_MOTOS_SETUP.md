# Panel Administración Mercadoalce - Setup Guide

## Resumen
Este documento explica cómo deployar el panel de administración para gestionar las motos del marketplace.

## Archivos Nuevos
- `admin-motos.html` - Panel web para administrar motos (editar, subir fotos, aprobar, eliminar)
- `supabase/functions/admin-motos/index.ts` - Edge Function que maneja las operaciones en Supabase

## Pasos de Instalación

### 1. Preparar la Edge Function

La Edge Function ya está lista en `supabase/functions/admin-motos/index.ts`. Necesitas:

#### a) Instalar Supabase CLI (si no lo tienes)
```bash
npm install -g supabase
```

#### b) Loginear a tu proyecto Supabase
```bash
supabase login
```

#### c) Deployar la función
```bash
supabase functions deploy admin-motos
```

### 2. Configurar Variables de Entorno

En el dashboard de Supabase:
1. Ve a **Project Settings** → **Edge Functions** → **admin-motos**
2. Agrega una variable de entorno llamada `ADMIN_PASSWORD_MOTOS`
3. Dale el valor que desees usar como clave de acceso (ej: `tu-clave-segura`)

**Nota**: Usa la misma clave que configuraste para el admin de grueros si quieres que sea igual, o usa una diferente para mayor seguridad.

### 3. Verificar la Base de Datos

Asegúrate que la tabla `motos_venta` existe con las siguientes columnas:
- `id` (UUID, primary key)
- `titulo` (TEXT)
- `precio` (INTEGER)
- `km` (INTEGER)
- `descripcion` (TEXT)
- `ciudad` (TEXT)
- `telefono` (TEXT)
- `email` (TEXT)
- `aprobado` (BOOLEAN)
- `foto_url` (TEXT, nullable)
- `created_at` (TIMESTAMP)

Si la tabla no existe, créala en el SQL editor de Supabase:
```sql
CREATE TABLE public.motos_venta (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  precio INTEGER,
  km INTEGER,
  descripcion TEXT,
  ciudad TEXT,
  telefono TEXT,
  email TEXT,
  aprobado BOOLEAN DEFAULT false,
  foto_url TEXT,
  created_at TIMESTAMP DEFAULT now()
);

ALTER TABLE public.motos_venta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_select" ON public.motos_venta
  FOR SELECT USING (true);

CREATE POLICY "service_role_all" ON public.motos_venta
  FOR ALL USING (true);
```

### 4. Verificar Permisos del Storage

Asegúrate que el bucket `motos-venta` existe en Supabase Storage:
1. Ve a **Storage** → **Buckets**
2. Si no existe, créalo como público
3. Verifica que las políticas permitan subir archivos:
   - SELECT: public (para ver las fotos)
   - INSERT/UPDATE/DELETE: service_role (para admin)

### 5. Acceder al Panel

Una vez deployado, accede al panel en:
```
https://tu-dominio.com/admin-motos.html
```

O si estás en desarrollo local:
```
http://localhost/admin-motos.html
```

### 6. Funcionalidades

El panel permite:

**Listar motos:**
- Ver todas las motos publicadas
- Filtrar por: Todos, Pendientes aprobación, Aprobadas, Sin foto
- Buscar por título, marca, modelo

**Editar moto:**
- Cambiar título, precio, km, descripción
- Modificar ciudad, teléfono, email
- Aprobar/desaprobar para marketplace
- Subir/reemplazar foto

**Eliminar moto:**
- Remover listado permanentemente

**Estadísticas:**
- Total de motos
- Pendientes de aprobación
- Aprobadas
- Con foto

## Solución de Problemas

### Error "Clave incorrecta"
- Verifica que la variable de entorno `ADMIN_PASSWORD_MOTOS` está configurada correctamente en Supabase
- Asegúrate de usar la misma clave al loginear

### Error al subir fotos
- Verifica que el bucket `motos-venta` existe en Storage
- Verifica que las políticas de storage permiten INSERT
- Revisa los logs de la Edge Function en Supabase

### Las motos no carga
- Verifica que la tabla `motos_venta` existe
- Asegúrate que la Edge Function está deployada correctamente
- Revisa los logs en Supabase

## Próximos Pasos Opcionales

1. **Integrar con WordPress**: Agrega un link en el dashboard de WordPress a `admin-motos.html`
2. **Backups**: Configura backups automáticos de la tabla `motos_venta`
3. **Auditoría**: Agrega columna `updated_by` y `updated_at` para tracking

## Notas de Seguridad

- La clave de acceso se almacena en memoria en el navegador (no se persiste)
- La comunicación con la Edge Function es HTTPS
- Las operaciones se validan en el servidor (la función verifica la clave)
- Las fotos se suben directamente a Supabase Storage (no a través de Edge Function)
