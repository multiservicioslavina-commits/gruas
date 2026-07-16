# 📤 Cómo Subir la Página de Registro a WordPress

## 📁 Archivo a Subir

**`wordpress-club-registration.php`**

## 3️⃣ Opciones de Instalación

### **OPCIÓN 1: Como Shortcode (Más Fácil)**

Perfect para insertar en cualquier página existente.

1. **Subir el archivo a WordPress**:
   - FTP/SFTP: `wp-content/`
   - o WordPress → Plugins → Subir plugin (si lo empaques como plugin)

2. **Agregar a `functions.php`**:
   ```php
   // En wp-content/themes/tu-tema/functions.php
   require_once('wp-content/wordpress-club-registration.php');
   ```

3. **Usar en cualquier página**:
   - Crear página en WordPress
   - Añadir en el editor:
   ```
   [ridera_club_registration club_slug="touring-bikers-colombia"]
   ```
   - Cambiar `touring-bikers-colombia` por el slug real del club

4. **URL de la página**:
   ```
   https://tudominio.com/registro-club-touring-bikers/
   ```

---

### **OPCIÓN 2: Como Página Independiente HTML (Sin PHP)**

Perfect si no quieres tocar WordPress.

1. **Abrir `wordpress-club-registration.php` en editor de texto**
2. **Copiar solo la sección HTML entre `<?php ?>` y `</html>`**
3. **Crear archivo nuevo**: `club-registration.html`
4. **Subir a**: Carpeta raíz de tu sitio o carpeta específica
5. **URL**:
   ```
   https://tudominio.com/club-registration.html
   ```

---

### **OPCIÓN 3: Como Plugin (Más Profesional)**

Perfect para reutilizar y actualizar fácilmente.

**Paso 1: Crear estructura del plugin**

```
wp-content/plugins/
└── ridera-club-registration/
    ├── ridera-club-registration.php (header del plugin)
    ├── registration.php (el código de aquí)
    └── readme.txt
```

**Paso 2: Crear `ridera-club-registration.php`**:

```php
<?php
/*
Plugin Name: Ridera Club Registration
Plugin URI: https://ridera.com
Description: Formulario de registro para clubes de motos
Version: 1.0
Author: Ridera
Author URI: https://ridera.com
License: GPL v2
*/

// Incluir el archivo de registro
require_once(plugin_dir_path(__FILE__) . 'registration.php');
```

**Paso 3: Copiar el código de `wordpress-club-registration.php`** en `registration.php`

**Paso 4: Subir carpeta `ridera-club-registration` a `wp-content/plugins/`**

**Paso 5: En WordPress → Plugins → Activar "Ridera Club Registration"**

**Paso 6: Usar el shortcode**:
```
[ridera_club_registration club_slug="touring-bikers-colombia"]
```

---

## 🔧 CONFIGURACIÓN IMPORTANTE

### 1️⃣ **Crear tabla en Supabase**

Antes de usar, ejecutar la migración:

```sql
-- Ir a Supabase → SQL Editor → Nueva Query
-- Ejecutar: supabase/migrations/002_create_club_members_table.sql
```

### 2️⃣ **Crear Storage Bucket**

```
Supabase → Storage → Nueva Carpeta
Nombre: club-photos
Público: ✅ SÍ
```

### 3️⃣ **Verificar CORS** (si es necesario)

```
Supabase → Authentication → Settings → CORS
Agregar: https://tudominio.com
```

### 4️⃣ **Actualizar credenciales** (si usas otro proyecto)

En el archivo, cambiar:

```php
const SUPABASE_URL = "https://TU-URL.supabase.co";
const SUPABASE_ANON_KEY = "tu-clave-anónima";
```

---

## 📝 EJEMPLOS DE USO

### **Ejemplo 1: En una página nueva**

```
Página: Registro de Miembros
URL: /registro-miembros/
Contenido:
[ridera_club_registration club_slug="touring-bikers-colombia"]
```

### **Ejemplo 2: En varias páginas**

```
/registro-touring/
[ridera_club_registration club_slug="touring-bikers-colombia"]

/registro-cruisers/
[ridera_club_registration club_slug="cruisers-medellin"]

/registro-enduro/
[ridera_club_registration club_slug="enduro-antioquia"]
```

### **Ejemplo 3: Página customizada**

```
Crear página "Registro" con:

<h1>Únete a un Club de Motos</h1>
<p>Selecciona tu club favorito y regístrate como miembro.</p>

[ridera_club_registration club_slug="touring-bikers-colombia"]
```

---

## 🎨 ESTILOS Y PERSONALIZADOR

El formulario viene con estilos inline. Para cambiar colores:

**Buscar en el código**:
```css
--orange: #E85D20;  /* Color naranja principal */
```

**Cambiar a**:
```css
--orange: #FF6B35;  /* Nuevo color */
```

---

## ✅ PRUEBAS

### 1. Cargar la página

```
https://tudominio.com/registro-club/
```

### 2. Verificar que carga:
- ✅ Título del club
- ✅ Descripción
- ✅ Formulario
- ✅ Área de fotos

### 3. Completar formulario:
- ✅ Nombres y email
- ✅ Info de moto
- ✅ Subir 3+ fotos
- ✅ Mensaje
- ✅ Click en "Unirme"

### 4. Verificar en Supabase:
```
Ir a Supabase → Table Editor → club_members
Debe aparecer el nuevo registro
Las fotos deben estar en Storage
```

---

## 🔒 SEGURIDAD

✅ **Incluido**:
- Validación de email
- Validación de fotos (mínimo 3)
- CORS configurado
- RLS policies en Supabase
- Encriptación de conexiones

⚠️ **Verificar**:
- [ ] SUPABASE_ANON_KEY no debe ser privada
- [ ] Storage bucket es público (es normal)
- [ ] RLS policies están activas
- [ ] Email verification activado (opcional)

---

## 🚨 TROUBLESHOOTING

| Problema | Solución |
|----------|----------|
| "No se muestra nada" | Verificar que ejecutaste el shortcode correcto |
| "Error de fotos" | Verificar bucket `club-photos` existe y es público |
| "No guarda en BD" | Ejecutar migración 002 en Supabase |
| "CORS error" | Agregar tu dominio en Supabase CORS settings |
| "Fotos no se suben" | Verificar permisos de Storage en Supabase |

---

## 📊 DATOS GUARDADOS

Cuando un usuario se registra, se guardan:

```json
{
  "club_id": "id-del-club",
  "fullname": "Juan Pérez",
  "email": "juan@example.com",
  "phone": "+57 300 1234 567",
  "whatsapp": "+57 300 1234 567",
  "city": "Medellín",
  "moto_brand": "BMW",
  "moto_model": "R1200GS",
  "moto_year": 2024,
  "moto_color": "Rojo",
  "photo_urls": ["url1", "url2", "url3"],
  "message": "Mensaje del usuario",
  "status": "pending",
  "created_at": "2024-07-16T12:00:00Z"
}
```

---

## 🔗 INTEGRACIÓN CON OTROS SISTEMAS

### Con el listado de clubes

```html
<!-- clubes.html -->
<a href="/registro-club/?slug=touring-bikers-colombia">
  Unirme
</a>

<!-- La URL pasa el slug dinámicamente -->
```

### Con WordPress CPT

```php
// En template del club
<?php
$slug = get_post_meta(get_the_ID(), '_club_data', true)['slug'];
echo do_shortcode('[ridera_club_registration club_slug="' . $slug . '"]');
```

---

## 📱 RESPONSIVE

El formulario es totalmente responsive:
- **Desktop**: 2 columnas
- **Tablet**: 1 columna adaptada
- **Mobile**: Stack vertical completo

---

## 📞 SOPORTE

Si necesitas help:

1. Verificar console del navegador (F12)
2. Ver logs de Supabase
3. Revisar permisos de Storage
4. Confirmar tabla club_members existe

---

## 🎉 ¡LISTO!

Ya está todo listo para que los usuarios se registren en tus clubes. 

**Pasos rápidos**:
1. ✅ Ejecutar migración en Supabase
2. ✅ Crear bucket `club-photos`
3. ✅ Subir `wordpress-club-registration.php` a WordPress
4. ✅ Agregar shortcode en página
5. ✅ ¡Probar!

---

**Versión**: 1.0  
**Fecha**: 2024-07-16  
**Estado**: ✅ Listo para producción
