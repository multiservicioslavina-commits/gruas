# Guía de Despliegue - Sistema Ridera Clubes

Este documento proporciona instrucciones paso a paso para desplegar el nuevo sistema de gestión de clubes de motociclistas.

## 📋 Tabla de Contenidos

1. [Requisitos Previos](#requisitos-previos)
2. [Fase 1: Base de Datos](#fase-1-base-de-datos)
3. [Fase 2: Archivos y Código](#fase-2-archivos-y-código)
4. [Fase 3: Configuración de Netlify](#fase-3-configuración-de-netlify)
5. [Fase 4: Pruebas](#fase-4-pruebas)
6. [Fase 5: Subdominio adminridera.com.co (Opcional)](#fase-5-subdominio-adminrideracomco-opcional)
7. [Verificación Final](#verificación-final)

## Requisitos Previos

- ✅ Acceso a Supabase (proyecto existente)
- ✅ Acceso a Netlify
- ✅ Acceso a configuración de DNS del dominio
- ✅ Git y comandos básicos
- ✅ Navegador web moderno

## Fase 1: Base de Datos

### Paso 1.1: Crear la tabla de clubes en Supabase

1. Ir a [Supabase Dashboard](https://app.supabase.com/)
2. Seleccionar el proyecto `vzzxsdtsaahhzyctvmhx`
3. Ir a **SQL Editor**
4. Crear una nueva query
5. Copiar y ejecutar el contenido de `supabase/migrations/001_create_clubs_table.sql`:

```sql
-- Copiar todo el contenido del archivo SQL aquí
```

6. Click en "Run"
7. Verificar que se crear la tabla `clubs` sin errores

### Paso 1.2: Verificar Row Level Security (RLS)

1. En Supabase, ir a **Authentication > Policies**
2. Seleccionar tabla `clubs`
3. Verificar que existan 3 políticas:
   - "Anyone can view active clubs"
   - "Club leaders can manage their club"
   - "Admins can manage all clubs"

**Si no existen**, ejecutar nuevamente el SQL de migración.

### Paso 1.3: Verificar datos iniciales

1. En Supabase, ir a **Table Editor**
2. Seleccionar tabla `clubs`
3. Debe haber 3 clubes de ejemplo:
   - Touring Bikers Colombia
   - Cruisers Medellín
   - Enduro Antioquia

Si no los ve, ejecutar la sección `INSERT` del SQL nuevamente.

## Fase 2: Archivos y Código

### Paso 2.1: Verificar estructura de archivos

Los siguientes archivos ya están en su lugar:

```
gruas/
├── supabase/
│   ├── clubes/
│   │   ├── clubes.html              (Listado de clubes)
│   │   ├── club-template.html       (Template individual)
│   │   └── README.md
│   ├── admin/
│   │   ├── admin-clubs.html         (Panel admin)
│   │   └── SETUP.md
│   └── migrations/
│       └── 001_create_clubs_table.sql
├── netlify/
│   └── edge-functions/
│       └── club-page.js             (Routing dinámico)
└── netlify.toml                     (Actualizado con edge function)
```

### Paso 2.2: Verificar credenciales Supabase

**IMPORTANTE**: Las credenciales ya están configuradas en los archivos:

- URL: `https://vzzxsdtsaahhzyctvmhx.supabase.co`
- Anon Key: `sb_publishable_r1ImtuUXs1zM02OgwserGQ_F7R26Niu`

Si necesitas cambiar de proyecto Supabase, actualizar en:
- `supabase/clubes/clubes.html`
- `supabase/clubes/club-template.html`
- `supabase/admin/admin-clubs.html`

## Fase 3: Configuración de Netlify

### Paso 3.1: Push a GitHub

```bash
cd /home/user/gruas
git push -u origin claude/ridera-work-ta774b
```

### Paso 3.2: Verificar despliegue

1. Ir a [Netlify Dashboard](https://app.netlify.com/)
2. Seleccionar sitio `gruas` (o tu sitio Ridera)
3. Ir a **Deploys**
4. Verificar que el último deploy incluya los archivos nuevos
5. Esperar a que el deploy termine (status "Published")

### Paso 3.3: Verificar edge functions

1. En Netlify, ir a **Functions**
2. Debe aparecer `club-page` en la lista
3. Verificar que está en estado "Ready"

Si no aparece:
- Esperar 2-3 minutos
- Refrescar la página
- Verificar que `netlify.toml` se pusheó correctamente

## Fase 4: Pruebas

### Prueba 4.1: Acceder al listado de clubes

```
https://gruas.netlify.app/supabase/clubes/clubes.html
```

Esperado:
- ✅ Se carga página con hero section
- ✅ Se ven 3 clubes en la grid
- ✅ Filtros funcionan
- ✅ Búsqueda funciona
- ✅ Ordenamiento funciona

### Prueba 4.2: Acceder a un club específico

```
https://gruas.netlify.app/supabase/clubes/touring-bikers-colombia.html
```

Esperado:
- ✅ Se carga página individual del club
- ✅ Se ve avatar, nombre, categoría
- ✅ Se muestran estadísticas (miembros, rutas, año)
- ✅ Se ve descripción y secciones
- ✅ Botones de contacto y redes sociales funcionan

### Prueba 4.3: Admin panel - Sin autenticación

```
https://gruas.netlify.app/supabase/admin/admin-clubs.html
```

Esperado:
- ✅ Redirige a `/login-gruero.html` para iniciar sesión

### Prueba 4.4: Admin panel - Con autenticación

1. Iniciar sesión en Ridera con una cuenta valida
2. Acceder a:
   ```
   https://gruas.netlify.app/supabase/admin/admin-clubs.html
   ```

Esperado:
- ✅ Se carga el panel de admin
- ✅ Se muestra nombre y email del usuario
- ✅ Pestaña "Clubes" muestra tabla con 3 clubs
- ✅ Pestaña "Crear Club" muestra formulario
- ✅ Pestaña "Mi Club" se puede acceder

### Prueba 4.5: Crear un club desde admin

1. En panel admin, ir a pestaña "Crear Club"
2. Llenar formulario:
   - Nombre: "Mi Club Test"
   - Slug: "mi-club-test"
   - Categoría: "Touring"
   - Ciudad: "Medellín"
3. Click "Crear Club"

Esperado:
- ✅ Mensaje de éxito
- ✅ Club aparece en tabla "Clubes"
- ✅ Se puede acceder en:
   ```
   https://gruas.netlify.app/supabase/clubes/mi-club-test.html
   ```

### Prueba 4.6: Rita compatibility

En consola del navegador (F12), en página individual del club:

```javascript
console.log(window.clubData.extractClubInfo());
```

Esperado:
- ✅ Se retorna objeto con toda la info del club
- ✅ Contiene: name, description, stats, contact, social, brands, routes

## Fase 5: Subdominio adminridera.com.co (Opcional)

### Paso 5.1: Configurar DNS

1. Ir a tu proveedor DNS (GoDaddy, Namecheap, etc.)
2. Crear un subdominio `adminridera`:
   - Nombre: `adminridera`
   - Tipo: `CNAME`
   - Valor: `gruas.netlify.app` (o tu dominio actual)

### Paso 5.2: Configurar Netlify

1. En Netlify, ir a **Site Settings > Domain Management**
2. Click "Add domain alias"
3. Ingresar: `adminridera.com.co`

### Paso 5.3: Configurar redirección

En `netlify.toml`, añadir:

```toml
[[redirects]]
  from = "/admin/*"
  to = "/supabase/admin/admin-clubs.html"
  status = 200

[[redirects]]
  from = "https://adminridera.com.co/*"
  to = "https://gruas.netlify.app/supabase/admin/admin-clubs.html"
  status = 301
```

Luego:
```bash
git add netlify.toml
git commit -m "Add adminridera.com.co redirect"
git push
```

### Paso 5.4: Verificar

```
https://adminridera.com.co
```

Esperado:
- ✅ Se abre el panel de admin
- ✅ URL muestra `adminridera.com.co`

## Verificación Final

Crear checklist final:

- [ ] Tabla `clubs` existe en Supabase
- [ ] RLS policies están activas
- [ ] Clubes de ejemplo están visibles
- [ ] `clubes.html` se carga correctamente
- [ ] Filtros y búsqueda funcionan
- [ ] Club individual se carga por URL (`touring-bikers-colombia.html`)
- [ ] Panel admin requiere autenticación
- [ ] Se puede crear un club desde admin
- [ ] Nuevo club es visible en listado
- [ ] `window.clubData.extractClubInfo()` retorna datos
- [ ] (Opcional) `adminridera.com.co` funciona

## Solución de Problemas

### Problema: Tabla `clubs` no se crea

**Solución**:
1. Verificar que ejecutaste el SQL completo
2. Verificar que no hay errores en la consola de Supabase
3. Intentar ejecutar solo la parte de CREATE TABLE
4. Si sigue fallando, contactar soporte de Supabase

### Problema: Clubes no cargan en la página

**Solución**:
1. Abrir consola del navegador (F12)
2. Verificar que no haya errores de CORS
3. Verificar credenciales Supabase en el código
4. Verificar que los clubes tengan `active = true`

### Problema: Admin panel no carga

**Solución**:
1. Verificar que estés autenticado
2. Abrir consola del navegador
3. Buscar errores de conexión a Supabase
4. Verificar que la página se carga desde la URL correcta

### Problema: Edge function no funciona

**Solución**:
1. Esperar 5 minutos a que Netlify recompile
2. Refrescar page en Netlify dashboard
3. Verificar que `netlify.toml` está correcto
4. Intentar acceder con URL completa

## Próximos Pasos

Una vez el sistema esté activo:

1. **Comunicar a usuarios**: Informar sobre la nueva plataforma de clubes
2. **Invitar líderes**: Pedir que creen perfiles de sus clubes
3. **Agregar contenido**: Subir información de clubes existentes
4. **Recopilar feedback**: Mejorar basado en comentarios
5. **Integrar con Rita**: Configurar la edge function para leer datos de clubes

## Documentación Disponible

- `supabase/clubes/README.md` - Guía de uso para usuarios
- `supabase/admin/SETUP.md` - Guía de uso para admin
- Este archivo - Guía de despliegue

## Soporte

Para preguntas o problemas:

1. Revisar la documentación relevante
2. Revisar errores en consola del navegador (F12)
3. Verificar Supabase logs
4. Verificar Netlify build logs
5. Contactar al equipo de desarrollo

---

**Versión**: 1.0  
**Fecha**: 2024-07-16  
**Autor**: Claude Code
