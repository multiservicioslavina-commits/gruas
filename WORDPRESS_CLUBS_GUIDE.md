# Guía de Integración - Clubes en WordPress

## 📋 Descripción

El archivo `wordpress-clubs-integration.php` integra el sistema Ridera Clubes con WordPress, permitiendo:

- ✅ CPT (Custom Post Type) para clubes
- ✅ Meta boxes para información de clubes
- ✅ Sincronización automática con Supabase
- ✅ Shortcodes para mostrar clubes
- ✅ Taxonomías para categorías y regiones

## 🚀 Instalación

### Opción 1: Agregar a functions.php

1. Copiar el contenido de `wordpress-clubs-integration.php`
2. Pegar en `wp-content/themes/tu-tema/functions.php` **al final del archivo**

### Opción 2: Como Plugin

1. Crear carpeta: `wp-content/plugins/ridera-clubes/`
2. Crear archivo: `ridera-clubes.php` con el siguiente contenido:

```php
<?php
/*
Plugin Name: Ridera Clubes
Description: Integración de clubes Supabase con WordPress
Version: 1.0
Author: Ridera
*/

// Incluir el archivo de integración
require_once __DIR__ . '/../../wordpress-clubs-integration.php';
```

3. Copiar `wordpress-clubs-integration.php` en esa carpeta
4. Activar en **Plugins** de WordPress

## 💡 Uso

### 1. Crear un Club desde WordPress

1. Dashboard → **Clubes Ridera** → **Añadir nuevo**
2. Llenar campos:
   - Título: Nombre del club
   - Contenido: Descripción
   - Categoría: Elegir categoría
   - Región: Elegir región
3. En meta box "Información del Club":
   - Ciudad, Departamento
   - Información del líder
   - Redes sociales
   - Estadísticas
4. Publicar

**El club se sincroniza automáticamente a Supabase**

### 2. Usar Shortcodes

#### Listar todos los clubes

```
[ridera_clubes]
```

Muestra todos los clubes activos en una grid.

#### Mostrar club específico

```
[ridera_club slug="touring-bikers-colombia"]
```

Muestra detalles completos de un club.

### Ejemplo en página

```
<h1>Nuestros Clubes</h1>
[ridera_clubes]

<h1>Club Destacado</h1>
[ridera_club slug="touring-bikers-colombia"]
```

## 🔧 Sincronización Manual

1. Dashboard → **Clubes Ridera** → **Sincronizar**
2. Click en **"🔄 Sincronizar Ahora"**
3. Esperar a que todos se sincronicen
4. Confirmación: "✅ X/X clubes sincronizados"

## 📊 Campos de Club

| Campo | Tipo | Requerido |
|-------|------|-----------|
| Título | Text | ✅ |
| Contenido | Editor | ✅ |
| Ciudad | Text | ✅ |
| Departamento | Text | ✅ |
| Nombre Líder | Text | ❌ |
| Email Líder | Email | ❌ |
| Teléfono | Phone | ❌ |
| WhatsApp | Phone | ❌ |
| Facebook | URL | ❌ |
| Instagram | URL | ❌ |
| Twitter | URL | ❌ |
| Miembros | Number | ❌ |
| Rutas Completadas | Number | ❌ |
| Año Fundación | Number | ❌ |
| Filosofía | Textarea | ❌ |
| Frecuencia | Text | ❌ |
| Marcas Motos | Text | ❌ |
| Tipos Ruta | Text | ❌ |

## 🌐 URLs Generadas

Después de publicar un club:

- **Archivo**: `/clubes/nombre-del-club/`
- **Listado**: `/clubes/` (archive)
- **Shortcode**: Funciona en cualquier página

## 🔐 Sincronización Automática

Cuando publicas/actualizas un club en WordPress:

1. Se guarda en meta boxes
2. Se genera automáticamente en Supabase
3. Aparece en listado público Ridera
4. Disponible en Rita

## 🎯 Flujo Completo

```
WordPress Admin
    ↓
Crear/Editar Club
    ↓
Guardar Post
    ↓
Sincronizar a Supabase
    ↓
Club aparece en:
  - clubes.html
  - Shortcodes WordPress
  - Disponible para Rita
```

## 📱 Ejemplo de Meta Box

```
┌─────────────────────────────────────────┐
│ INFORMACIÓN DEL CLUB                    │
├─────────────────────────────────────────┤
│ Ciudad: [Envigado        ] [Antioquia    ] │
│                                         │
│ INFORMACIÓN DEL LÍDER                   │
│ Nombre: [Pau             ] [Email...]   │
│ Teléfono: [+57...       ] [WhatsApp...] │
│                                         │
│ REDES SOCIALES                          │
│ Facebook: [https://facebook.com/...]    │
│ Instagram: [https://instagram.com/...]  │
│ Twitter: [https://twitter.com/...]      │
│                                         │
│ ESTADÍSTICAS                            │
│ Miembros: [15   ] Rutas: [42  ]         │
│ Año Fundación: [2022]                   │
│                                         │
│ INFORMACIÓN ADICIONAL                   │
│ Filosofía: [Aventura, comunidad...    ] │
│ Frecuencia: [Rutas semanales...       ] │
│ Marcas: [BMW, Harley-Davidson, ...]    │
│ Rutas: [Carretera, Off-Road, ...]      │
└─────────────────────────────────────────┘
```

## 🗂️ Estructura CPT

**Post Type**: `ridera_club`
- Slug: `clubes`
- URL pattern: `/clubes/{slug}/`
- Archive: `/clubes/`

**Taxonomías**:
- `club_category` - Categoría (Touring, Cruiser, etc)
- `club_region` - Región (Metropolitana, Oriente, etc)

## 🔗 Datos en Supabase

Cuando WordPress sincroniza, estos datos llegan a Supabase:

```json
{
  "name": "Touring Bikers Colombia",
  "slug": "touring-bikers-colombia",
  "description": "Descripción del club...",
  "city": "Envigado",
  "state": "Antioquia",
  "leader_name": "Pau",
  "leader_email": "pau@example.com",
  "leader_phone": "+57 312 3123 213",
  "whatsapp": "+57 312 3123 213",
  "facebook_url": "https://facebook.com/...",
  "instagram_url": "https://instagram.com/...",
  "twitter_url": "https://twitter.com/...",
  "members_count": 15,
  "routes_completed": 42,
  "founded_year": 2022,
  "motorcycle_brands": ["BMW", "Harley-Davidson", ...],
  "route_types": ["Carretera", "Off-Road", ...],
  "philosophy": "Aventura, comunidad...",
  "frequency": "Rutas semanales cada sábado",
  "active": true
}
```

## 🎨 Estilo de Shortcode

El shortcode genera HTML con estilos básicos:

### [ridera_clubes]
```css
Grid responsive (auto-fill, minmax(300px, 1fr))
Cards con:
- Nombre
- Categoría
- Ubicación
- Descripción
- Estadísticas
- Link "Ver Club"
```

### [ridera_club slug="..."]
```css
Contenedor max-width: 800px
Con:
- Título y categoría
- Descripción
- Estadísticas
- Contacto
- Redes sociales
```

## 🚨 Troubleshooting

### El club no aparece en Supabase
- Verificar que el club esté **Publicado** (no borrador)
- Verificar conexión a Supabase
- Ver console del navegador (F12) para errores

### Shortcode no muestra nada
- Verificar que el slug sea correcto
- Verificar que el club esté activo en Supabase
- Ver console del navegador

### Error "CORS"
- Supabase debe permitir origen de WordPress
- Ir a Supabase → Authentication → Settings
- Agregar dominio de WordPress en "Allowed Redirect URLs"

### Meta box no guarda datos
- Verificar nonce `club_meta_nonce` en HTML
- Ver error en console del navegador
- Verificar permisos de usuario

## 📚 Funciones Disponibles

```php
// Sincronizar un club a Supabase
ridera_sync_club_to_supabase($post_id, $club_data);

// Obtener meta data de un club
$club_data = get_post_meta($post_id, '_club_data', true);

// Actualizar meta data
update_post_meta($post_id, '_club_data', $new_data);
```

## 🔄 API REST

Si necesitas acceder vía API:

```php
// Obtener todos los clubes
$response = wp_remote_get(
    'https://vzzxsdtsaahhzyctvmhx.supabase.co/rest/v1/clubs',
    array(
        'headers' => array(
            'apikey' => 'sb_publishable_r1ImtuUXs1zM02OgwserGQ_F7R26Niu',
        ),
    )
);

$clubs = json_decode(wp_remote_retrieve_body($response));
```

## 💾 Backup de Datos

Los clubes se guardan en dos lugares:

1. **WordPress**: Post Type + Meta boxes
2. **Supabase**: Tabla `clubs`

Si sincronización falla, los datos están seguros en ambos lados.

## 🎯 Casos de Uso

### Caso 1: Blog sobre clubes
```
[ridera_clubes]
```
Muestra todos los clubs en página de blog.

### Caso 2: Página destacada de club
```
Heading: Touring Bikers - Club del Mes
[ridera_club slug="touring-bikers-colombia"]
```

### Caso 3: Múltiples clubes en una página
```
<div>
  [ridera_club slug="touring-bikers-colombia"]
</div>
<div>
  [ridera_club slug="cruisers-medellin"]
</div>
```

## 📞 Soporte

Si necesitas ayuda:

1. Verificar este documento
2. Ver console del navegador (F12)
3. Ver logs de Supabase
4. Contactar soporte

---

**Versión**: 1.0  
**Fecha**: 2024-07-16  
**Compatible**: WordPress 5.0+  
**PHP**: 7.2+
