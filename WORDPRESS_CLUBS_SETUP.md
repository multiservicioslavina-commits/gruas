# 🚀 WordPress Clubs System - Setup Guide

## 📋 Resumen

Sistema completo de clubes para WordPress con:
- ✅ Listado de clubes con filtros y búsqueda
- ✅ Página individual de club + formulario de registro
- ✅ Upload de mínimo 3 fotos
- ✅ Integración con Supabase
- ✅ Compatible con Rita (data attributes y JSON-LD)
- ✅ Diseño elegante y responsive

## 🔧 Instalación Rápida

### Paso 1: Agregar a functions.php

En tu tema de WordPress, abre `wp-content/themes/[TU-TEMA]/functions.php` y agrega al final:

```php
// Ridera Clubs System
require_once(WP_CONTENT_DIR . '/wordpress-clubs-main.php');
```

### Paso 2: Subir archivo PHP

1. Sube `wordpress-clubs-main.php` a la raíz de `wp-content/`
   - Ruta: `wp-content/wordpress-clubs-main.php`
   - NO lo coloques en la carpeta de plugins (va en wp-content directamente)

### Paso 3: Crear Páginas en WordPress

#### **Página 1: Listado de Clubes**

1. WordPress → Páginas → Agregar nueva
2. Título: "Clubes"
3. Contenido: Agrega el bloque de shortcode:
   ```
   [ridera_clubs_listing]
   ```
4. Slug (URL): `clubes`
5. Publica la página

**URL resultante**:
```
https://tudominio.com/clubes/
```

#### **Página 2: Detalle + Registro**

Para permitir acceso dinámico por slug, crea UNA página:

1. WordPress → Páginas → Agregar nueva
2. Título: "Registrate en un Club"
3. Contenido: Agrega el bloque de shortcode:
   ```
   [ridera_club_detail slug="%get_param(slug)%"]
   ```
   
   ⚠️ Si tu tema no soporta `get_param`, usa en su lugar:
   ```
   [ridera_club_detail slug="touring-bikers-colombia"]
   ```
   
4. Slug: `club-registro`
5. Publica

**URL resultante**:
```
https://tudominio.com/club-registro/?slug=touring-bikers-colombia
https://tudominio.com/club-registro/?slug=cruisers-medellin
```

### Paso 4: Verificar Supabase

Antes de que funcione, verifica:

✅ **Tabla `clubs` existe**:
```sql
SELECT * FROM clubs LIMIT 1;
```

✅ **Tabla `club_members` existe**:
```sql
SELECT * FROM club_members LIMIT 1;
```

✅ **Storage bucket `club-photos` existe**:
- Supabase → Storage → Ver `club-photos`
- Debe estar marcado como Público

✅ **RLS policies están activas**:
- Supabase → Authentication → Policies
- Debe haber policies para inserción pública

### Paso 5: Probar

1. Abre en navegador: `https://tudominio.com/clubes/`
2. Verifica que aparezca:
   - ✅ Título "Clubes de Motociclistas"
   - ✅ Filtros (Categoría, Región, Buscar, Ordenar)
   - ✅ Grid de clubes con tarjetas

3. Haz click en un club
4. Abre el modal de detalles
5. Haz click en "Unirme al Club"
6. Completa el formulario

## 📝 Shortcodes Disponibles

### 1. Listado de Clubes

```
[ridera_clubs_listing]
```

**Parámetros**: Ninguno requerido

**Características**:
- Filtro por categoría
- Filtro por región
- Búsqueda por nombre
- Ordenamiento (Destacados, Miembros, Nuevos)
- Grid responsive
- Modal de detalles

### 2. Detalle + Registro

```
[ridera_club_detail slug="touring-bikers-colombia"]
```

**Parámetros requeridos**:
- `slug`: El slug del club (ej: `touring-bikers-colombia`)

**Características**:
- Información del club
- Formulario de datos personales
- Formulario de info de moto
- Upload de fotos (mínimo 3)
- Validaciones en tiempo real
- Integración con Supabase

## 🎨 Personalización

### Cambiar Colores

Abre `wordpress-clubs-main.php` y busca:

```css
:root {
    --orange: #E85D20;  /* Color principal */
    --orange-light: #f07a3a;
    --orange-dark: #c44d18;
}
```

Reemplaza los valores hex por tus colores.

### Cambiar Textos

Busca en el archivo las strings y cámbialas:
- `"Clubes de Motociclistas"` → Tu título
- `"Encuentra y únete..."` → Tu descripción
- `"Ver Detalles"` → Tu CTA

### Cambiar Fonts

Las fonts por defecto son:
- **Títulos**: Bebas Neue, Barlow Condensed
- **Cuerpo**: DM Sans
- **Código**: DM Mono

Para cambiar, busca en el `<style>` y reemplaza la propiedad `font-family`.

## 🔒 Seguridad

### Validaciones Incluidas

✅ **Frontend**:
- Email válido
- Campos requeridos
- Mínimo 3 fotos
- Tipos de archivo

✅ **Backend (Supabase RLS)**:
- Políticas de inserción
- Validación de foreign keys
- Protección de storage

### Configuración Recomendada

1. **Enable RLS** en tablas `clubs` y `club_members`
2. **Policies**:
   - `clubs`: SELECT público, UPDATE/DELETE solo admin
   - `club_members`: INSERT público, SELECT solo propietario/líder
   - `storage.objects`: INSERT/DELETE restringido

## 📊 Datos Guardados

Cuando un usuario se registra:

```json
{
  "club_id": "uuid-del-club",
  "fullname": "Juan Pérez",
  "email": "juan@example.com",
  "phone": "+57 300 1234 567",
  "whatsapp": "+57 300 1234 567",
  "city": "Medellín",
  "moto_brand": "BMW",
  "moto_model": "R1200GS",
  "moto_year": 2024,
  "moto_color": "Rojo",
  "photo_urls": [
    "https://vzzxsdtsaahhzyctvmhx.supabase.co/storage/v1/object/public/club-photos/...",
    "...",
    "..."
  ],
  "message": "Soy entusiasta de motos de aventura...",
  "status": "pending",
  "created_at": "2024-07-16T12:00:00Z"
}
```

## 🤖 Compatibilidad con Rita

El código genera:

### Data Attributes (para parsing)
```html
<div id="ridera-club-detail" class="club-detail-container" data-club-id="..." data-club-slug="...">
```

### JSON-LD (para SEO)
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Nombre del Club",
  "description": "...",
  "memberCount": 0
}
</script>
```

### Window Object
```javascript
window.clubData = {
  id: "...",
  name: "...",
  slug: "...",
  extractClubInfo: function() { ... }
}
```

Rita puede acceder a toda esta información para procesar dinámicamente.

## 🚨 Troubleshooting

| Problema | Solución |
|----------|----------|
| "No se muestra nada" | Verifica que la línea en functions.php esté correcta |
| "Error: Especifica el slug" | Asegúrate que el shortcode tiene slug="" |
| "No carga clubes" | Verifica que la tabla clubs existe y tiene datos en Supabase |
| "Error al subir fotos" | Verifica que el bucket `club-photos` es público |
| "No aparecen filtros" | Limpia cache del navegador (Ctrl+Shift+Del) |
| "Formulario lento" | Podría ser conexión a Supabase, revisa en F12 → Network |

## 📱 Funcionalidades

### Listado de Clubes
- Grid responsive (3 columnas desktop, 1 móvil)
- Tarjetas con avatar, nombre, descripción
- Estadísticas (miembros, año, rutas/mes)
- Tags de categoría y región
- Filtros en tiempo real
- Modal de detalles

### Página de Club + Registro
- Hero con información del club
- Sección de información personal
- Sección de información de moto
- Área de upload de fotos con drag-drop
- Validación de mínimo 3 fotos
- Area de mensaje opcional
- Confirmación de éxito/error

## 🔗 URLs Importantes

**Dashboards**:
- WordPress: `https://tudominio.com/wp-admin/`
- Supabase: `https://supabase.com/dashboard/projects`

**Tus Páginas**:
- Listado: `https://tudominio.com/clubes/`
- Registro: `https://tudominio.com/club-registro/?slug=touring-bikers-colombia`

## ✅ Checklist Final

- [ ] Archivo `wordpress-clubs-main.php` subido a `wp-content/`
- [ ] Línea agregada a `wp-content/themes/[TEMA]/functions.php`
- [ ] Página de "Clubes" creada con shortcode `[ridera_clubs_listing]`
- [ ] Página de "Registrate" creada con shortcode `[ridera_club_detail slug="..."]`
- [ ] Supabase verificado (tablas, bucket, RLS)
- [ ] Probado en navegador (desktop y móvil)
- [ ] Formulario completo y guardando datos

## 📞 Soporte

Si algo no funciona:

1. Abre F12 (Developer Tools)
2. Revisa la pestaña Console para errores
3. Revisa la pestaña Network para requests a Supabase
4. Verifica que Supabase_URL y SUPABASE_KEY son correctas en el archivo PHP

---

**Versión**: 2.0  
**Fecha**: 2024-07-16  
**Estado**: ✅ Listo para producción
