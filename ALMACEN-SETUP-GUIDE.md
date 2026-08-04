# Guía de Configuración: Sistema Completo de Almacenes

## Resumen

Se ha implementado un sistema completo de registro y gestión de almacenes con:
- ✅ Formulario de registro completo (logo, fotos, categorías, marcas, horarios, entregas)
- ✅ Netlify functions para procesar registros y subidas
- ✅ Integración con Supabase Auth y Storage
- ⏳ **Requiere**: Aplicar migraciones SQL en Supabase

## Pasos de Configuración

### 1. Aplicar Migraciones de Base de Datos

La migración SQL extenderá la tabla `almacenes` con nuevos campos y creará `almacen_horarios`.

**Ubicación del SQL**: `/supabase-migrations/extend-almacenes-schema.sql`

**Cómo ejecutar**:

#### Opción A: Supabase Dashboard (Recomendado)
1. Ve a [Supabase Dashboard](https://app.supabase.com)
2. Selecciona tu proyecto
3. Ve a "SQL Editor" → "New Query"
4. Copia el contenido de `extend-almacenes-schema.sql`
5. Ejecuta (Ctrl+Enter o Cmd+Enter)

#### Opción B: CLI de Supabase
```bash
supabase db push
```
(Requiere tener los archivos de migración en `supabase/migrations/`)

### 2. Crear el Bucket de Storage

La aplicación espera un bucket llamado `almacenes` para guardar logos y fotos.

1. En Supabase Dashboard → "Storage"
2. Crea un nuevo bucket: `almacenes`
3. Haz que sea **público** (Public)
4. Aplica esta política de acceso anónimo:

```sql
CREATE POLICY "Public access" ON storage.objects FOR SELECT
  USING (bucket_id = 'almacenes');
```

### 3. Verificar Variables de Entorno

Asegúrate de que en Netlify/tu hosting tienes:

```
SUPABASE_URL=https://[tu-proyecto].supabase.co
SUPABASE_SERVICE_KEY=[tu-service-key]
```

### 4. Nuevas Rutas Disponibles

Después de desplegar, estas rutas estarán disponibles:

| Ruta | Descripción |
|------|-------------|
| `/registrar-almacen` | Formulario completo de registro (nuevo) |
| `/registro-almacen` | Alias antiguo (redirige al nuevo) |
| `/.netlify/functions/register-almacen` | API para procesar registro |
| `/.netlify/functions/upload-almacen-image` | API para subir imágenes |

## Estructura de Datos

### Tabla `almacenes` (extendida)

Nuevas columnas:
```sql
- logo_url TEXT                   -- URL pública del logo
- fotos_urls JSONB               -- Array de URLs de fotos
- categorias JSONB               -- Array de categorías seleccionadas
- brands JSONB                   -- Array de marcas
- delivery_options JSONB         -- Array de opciones (en_ciudad, nacional, no)
- ubicacion TEXT                 -- Dirección del almacén
- contacto_nombre TEXT           -- Nombre de contacto
```

### Nueva Tabla `almacen_horarios`

```sql
id UUID PRIMARY KEY
almacen_id UUID (FK -> almacenes)
dia_semana INTEGER (0-6: domingo-sábado)
hora_apertura TIME
hora_cierre TIME
abierto BOOLEAN (default: true)
created_at TIMESTAMP
updated_at TIMESTAMP
```

## Flujo de Registro

1. Usuario completa `/registrar-almacen`
2. Sube logo y fotos (base64 → Supabase Storage)
3. Selecciona categorías, marcas, horarios, entregas
4. Envía al `register-almacen` function:
   - Crea cuenta en Supabase Auth
   - Crea registro en `almacenes`
   - Crea horarios en `almacen_horarios`
5. Redirige a `/mi-almacen?slug=[slug]`

## Integración con Rita (WhatsApp)

El bot Rita ya busca productos en la tabla `almacen_productos`. Con este nuevo sistema:

- Los almacenes pueden editar su catálogo en `/mi-almacen`
- Rita busca productos en tiempo real
- La información de categorías/marcas está disponible para filtrar búsquedas futuras

## Validaciones

### En el Cliente (registro-almacen-completo.html)
- Contraseña mínimo 8 caracteres
- Contraseñas coinciden
- Email válido
- Teléfono requerido
- Máximo 3 fotos, 5MB cada una

### En el Servidor (register-almacen.js)
- Campos obligatorios validados
- Manejo de errores de Auth
- Limpieza si falla inserción en almacenes
- Manejo de conflictos de slug (si existe)

## Próximas Mejoras

- [ ] Agregar modal de edición de horarios en `/mi-almacen`
- [ ] Mostrar categorías/marcas en `/almacen/[slug]`
- [ ] Filtrar búsquedas de Rita por categoría/marca
- [ ] Integración con WordPress para sincronizar datos
- [ ] Analytics: ver quién visitó tu catálogo

## Troubleshooting

### "Error: No se pudo crear el almacén"
- Verifica que la migración SQL se ejecutó correctamente
- Comprueba que `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` están configurados

### "Error subiendo imagen"
- Verifica que el bucket `almacenes` existe y es público
- Comprueba que `SUPABASE_SERVICE_KEY` tiene permisos de Storage

### "Slug ya existe"
- Agregar validación de unicidad de slug (próxima mejora)
- Por ahora, si hay conflicto, cambiar nombre del almacén

## Contacto para Preguntas

- Bot Rita: WhatsApp al número de Ridera
- Soporte: [tu email aquí]
