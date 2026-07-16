# Ridera Clubes - Sistema de Gestión de Clubes de Motociclistas

## Descripción General

El sistema Ridera Clubes es una plataforma completa para gestionar y mostrar clubes de motociclistas. Integra Supabase para almacenamiento de datos, interfaces elegantes para usuarios, y un panel de administración para líderes de clubes.

## Características

- 📋 **Listado de Clubes**: Página elegante con filtros por categoría, región y búsqueda
- 🎯 **Página Individual del Club**: Detalles completos de cada club con información de contacto y redes sociales
- 🛠️ **Panel de Administración**: Interface para crear, editar y gestionar clubes
- 🤖 **Compatibilidad Rita**: Los datos están estructurados para que Rita (Supabase Edge Function) pueda leerlos y procesarlos
- 📱 **Diseño Responsivo**: Compatible con móvil, tablet y desktop
- 🔐 **Seguridad**: Row Level Security (RLS) en Supabase para control de acceso

## Archivos

### Públicos (Usuarios)
- **clubes.html**: Página principal de listado de clubes con filtros y búsqueda
- **club-template.html**: Template para páginas individuales de clubes (se sirve como `/supabase/clubes/{slug}.html`)

### Administración
- **../admin/admin-clubs.html**: Panel de administración para gestionar clubes

### Base de Datos
- **../migrations/001_create_clubs_table.sql**: Script SQL para crear la tabla de clubes en Supabase

## Cómo Usar

### 1. Configurar la Base de Datos

Ejecutar la migración en Supabase:

```sql
-- Copiar y ejecutar el contenido de migrations/001_create_clubs_table.sql
-- en la consola SQL de Supabase
```

O usar Supabase CLI:
```bash
supabase db push
```

### 2. Acceder al Listado de Clubes

Visita: `https://tudominio.com/supabase/clubes/clubes.html`

### 3. Administrar Clubes

Accede al panel de administración en: `https://tudominio.com/supabase/admin/admin-clubs.html`

**Requiere autenticación** con Supabase Auth

### 4. Ver un Club Específico

La URL sigue el patrón: `https://tudominio.com/supabase/clubes/{slug}.html`

Ejemplo: `https://tudominio.com/supabase/clubes/touring-bikers-colombia.html`

El `slug` se extrae automáticamente de la URL y se busca en Supabase.

## Estructura de Datos (Supabase)

### Tabla `clubs`

```sql
CREATE TABLE clubs (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT,  -- Touring, Cruiser, Enduro, Sport, Adventure
  city TEXT,
  state TEXT,
  country TEXT,
  region TEXT,
  leader_name TEXT,
  leader_phone TEXT,
  leader_email TEXT,
  facebook_url TEXT,
  instagram_url TEXT,
  whatsapp TEXT,
  twitter_url TEXT,
  members_count INTEGER,
  routes_completed INTEGER,
  founded_year INTEGER,
  philosophy TEXT,
  frequency TEXT,
  motorcycle_brands TEXT[],  -- Array de marcas
  route_types TEXT[],  -- Array de tipos de ruta
  avatar_emoji TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  highlights TEXT,
  featured BOOLEAN,
  active BOOLEAN,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## Integración con Rita

Rita puede extraer información de un club usando:

```javascript
// Rita puede acceder a este objeto
const clubInfo = window.clubData.extractClubInfo();

// Retorna un objeto con estructura:
{
  clubId: 'uuid',
  name: 'Nombre del Club',
  description: 'Descripción',
  category: 'Touring',
  stats: {
    members: 15,
    routes: 42,
    founded: 2022,
    location: 'Envigado, Antioquia'
  },
  contact: {
    leader: 'Pau',
    phone: '+57 312 3123 213',
    email: 'pau@touringbikerscolom.co',
    city: 'Envigado',
    region: 'Metropolitana'
  },
  social: {
    facebook: 'https://...',
    instagram: 'https://...',
    whatsapp: '+57 312 3123 213',
    twitter: 'https://...'
  },
  brands: ['BMW', 'Harley-Davidson', ...],
  routes: ['Carretera', 'Off-Road', ...],
  philosophy: 'Aventura, comunidad y responsabilidad...',
  frequency: 'Rutas semanales cada sábado...'
}
```

## Políticas de Seguridad (RLS)

- ✅ Cualquiera puede ver clubes **activos**
- ✏️ Líderes pueden editar sus propios clubes
- 🔐 Admins pueden gestionar todos los clubes

## Configuración de Supabase

### Variables de Entorno

En los archivos HTML se encuentran hardcodeadas:

```javascript
const SUPABASE_URL = "https://vzzxsdtsaahhzyctvmhx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_r1ImtuUXs1zM02OgwserGQ_F7R26Niu";
```

**Nota**: Para cambiar el proyecto Supabase, actualizar estos valores en:
- `clubes.html`
- `club-template.html`
- `../admin/admin-clubs.html`

## Filtros Disponibles

### Por Categoría
- Touring
- Cruiser
- Enduro
- Sport
- Adventure

### Por Región
- Metropolitana
- Oriente
- Occidente
- Valle de Aburrá

### Búsqueda
- Por nombre del club
- Por ciudad
- Por departamento

### Ordenamiento
- Destacados (featured)
- Por cantidad de miembros
- Por antigüedad (año de fundación)

## Respuestas del Sistema

El admin panel proporciona retroalimentación al usuario:
- ✅ Éxito: Club creado exitosamente
- ❌ Error: Mensaje descriptivo del problema
- ℹ️ Información: Notificaciones sobre acciones

## Próximas Mejoras

- [ ] Edición de clubes desde el panel admin
- [ ] Galería de fotos para clubes
- [ ] Sistema de eventos para clubes
- [ ] Integración con Rita para recomendaciones
- [ ] API REST para sincronización externa
- [ ] Sistema de notificaciones para nuevos clubes

## Troubleshooting

### Club no aparece en el listado
1. Verificar que `active = true` en la base de datos
2. Verificar el `slug` coincida con la URL

### Error de conexión a Supabase
1. Verificar credenciales SUPABASE_URL y SUPABASE_ANON_KEY
2. Verificar que el proyecto Supabase está activo
3. Verificar permisos de RLS

### Página individual del club no carga
1. Verificar que el slug exista en la base de datos
2. Revisar la consola del navegador para errores
3. Verificar que el club tiene `active = true`

## Soporte

Para reportar problemas o sugerir mejoras, contactar al equipo de desarrollo.
