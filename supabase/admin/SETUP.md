# Panel de Administración - Ridera Clubes

## Descripción

El panel de administración permite a los líderes de clubes y administradores gestionar la información de clubes de motociclistas.

## URL de Acceso

**Desarrollo Local**:
```
file:///home/user/gruas/supabase/admin/admin-clubs.html
```

**Producción (Recomendado)**:
```
https://adminridera.com.co
```

Para servir desde `adminridera.com.co`:
1. Crear un subdominio en tu proveedor de DNS
2. Configurar Netlify para servir este archivo en esa ruta
3. O usar un redirect en netlify.toml

Ejemplo de configuración en netlify.toml:
```toml
[[redirects]]
  from = "/admin/*"
  to = "/supabase/admin/admin-clubs.html"
  status = 200
```

## Autenticación

El panel requiere que el usuario esté autenticado con Supabase Auth.

### Requisitos Previos
1. Cuenta en la plataforma Ridera (registrado como gruero)
2. Email verificado en Supabase Auth

### Cómo Iniciar Sesión
1. Navega a `admin-clubs.html`
2. Se redirige automáticamente a `/login-gruero.html` si no estás autenticado
3. Inicia sesión con tu email y contraseña

## Funcionalidades Principales

### 📊 Pestaña: Clubes (Todos)

Muestra una tabla con **todos los clubes** en el sistema.

**Columnas**:
- Nombre
- Categoría
- Ubicación (Ciudad, Departamento)
- Cantidad de Miembros
- Estado (Activo/Inactivo)
- Acciones (Editar, Eliminar)

**Acciones**:
- **Editar**: Modificar información del club (próximamente con editor completo)
- **Eliminar**: Remover club del sistema

**Filtros**:
- Búsqueda por nombre o ubicación
- Ordenamiento por miembros, antigüedad, destacados

### ➕ Pestaña: Crear Club

Formulario para crear un nuevo club.

**Campos Generales**:
- **Nombre del Club** (requerido)
- **Slug** (URL-friendly, ej: touring-bikers-colombia)
- **Descripción**: Propósito y visión del club
- **Categoría**: Touring, Cruiser, Enduro, Sport, Adventure
- **Emoji Avatar**: Icono representativo

**Ubicación**:
- **Ciudad**: Ciudad sede del club
- **Departamento**: Por defecto "Antioquia"
- **Región**: Metropolitana, Oriente, Occidente, Valle

**Información del Líder**:
- **Nombre del Líder**
- **Email**: Se vincula automáticamente al usuario logueado
- **Teléfono**
- **WhatsApp**: Para contacto directo

**Redes Sociales**:
- **Facebook**: URL del perfil
- **Instagram**: URL del perfil
- **Twitter/X**: URL del perfil

**Botones**:
- ✅ **Crear Club**: Guardar nuevo club en la base de datos
- 🔄 **Limpiar**: Limpiar todos los campos

### 👤 Pestaña: Mi Club

Muestra la información del club del cual eres líder.

**Funcionalidades**:
- Ver detalles de tu club
- Editar información (próximamente)
- Gestionar miembros (próximamente)
- Ver estadísticas (próximamente)

## Información del Usuario

Parte superior derecha del panel:
- Nombre del usuario logueado
- Email
- Botón "Cerrar sesión"

## Flujo de Creación de un Club

1. Navega a la pestaña "Crear Club"
2. Completa los campos requeridos:
   - Nombre del Club
   - Slug (ej: mi-club-motos)
   - Ciudad
3. Completa información del líder
4. (Opcional) Añade redes sociales
5. Click en "Crear Club"
6. Se muestra confirmación de éxito
7. Se puede ver el club en la pestaña "Clubes"

## Validaciones

### Slug
- Debe ser único en el sistema
- Caracteres permitidos: letras, números, guiones
- Convertir espacios a guiones automáticamente
- Sin caracteres especiales o acentos

### Email
- Debe ser email válido
- Se vincula al usuario autenticado

### URL de Redes Sociales
- Deben ser URLs válidas
- Campos opcionales

## Estructura de Datos Guardados

Cuando creas un club, se guardan los siguientes datos en Supabase:

```json
{
  "id": "uuid-generado",
  "name": "Touring Bikers Colombia",
  "slug": "touring-bikers-colombia",
  "description": "Descripción del club...",
  "category": "Touring",
  "city": "Envigado",
  "state": "Antioquia",
  "region": "Metropolitana",
  "leader_name": "Pau",
  "leader_email": "pau@example.com",
  "leader_phone": "+57 312 3123 213",
  "whatsapp": "+57 312 3123 213",
  "facebook_url": "https://facebook.com/...",
  "instagram_url": "https://instagram.com/...",
  "twitter_url": "https://twitter.com/...",
  "members_count": 0,
  "routes_completed": 0,
  "founded_year": 2024,
  "motorcycle_brands": [],
  "route_types": [],
  "avatar_emoji": "🏍",
  "active": true,
  "created_at": "2024-07-16T...",
  "updated_at": "2024-07-16T..."
}
```

## Mensajes del Sistema

### Éxito (Verde)
- ✅ "Club creado exitosamente"
- ✅ "Club actualizado"
- ✅ "Club eliminado"

### Error (Rojo)
- ❌ "Error al crear club"
- ❌ "El slug ya existe"
- ❌ "Error de autenticación"

### Información (Naranja)
- ℹ️ "Función de edición: [nombre] (pronto disponible)"
- ℹ️ "Cargando..."

## Próximas Funcionalidades

- [ ] **Edición completa de clubes**: Modificar todos los campos
- [ ] **Gestión de miembros**: Agregar/remover miembros
- [ ] **Estadísticas**: Dashboard con KPIs
- [ ] **Galería de fotos**: Subir y gestionar imágenes
- [ ] **Eventos**: Crear y gestionar eventos del club
- [ ] **Rutas**: Registro de rutas completadas
- [ ] **Notificaciones**: Alertas sobre nueva actividad

## Configuración Técnica

### Supabase

Credenciales (ver archivos HTML):
```javascript
const SUPABASE_URL = "https://vzzxsdtsaahhzyctvmhx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_r1ImtuUXs1zM02OgwserGQ_F7R26Niu";
```

### Permisos RLS

El panel funciona con estas políticas de Row Level Security:

1. **Ver clubes**: Cualquier usuario autenticado puede ver clubes activos
2. **Crear clubes**: Usuarios autenticados pueden crear
3. **Editar clubes**: 
   - Líderes pueden editar sus propios clubes
   - Admins pueden editar todos
4. **Eliminar clubes**: Solo admins

## Troubleshooting

### No puedo iniciar sesión
- Verifica que tengas una cuenta registrada
- Verifica que tu email esté verificado
- Intenta recuperar tu contraseña en `/login-gruero.html`

### El club no se crea
- Verifica que el slug sea único
- Verifica que todos los campos requeridos estén llenos
- Revisa la consola del navegador para más detalles

### No veo mis clubes
- Verifica que el club tenga `active = true`
- Verifica que seas el `leader_email` del club
- Intenta recargar la página

### Error de conexión a Supabase
- Verifica conexión a internet
- Verifica que Supabase esté activo
- Revisa credenciales SUPABASE_URL y SUPABASE_ANON_KEY

## Soporte

Para asistencia:
1. Revisa esta documentación
2. Verifica los mensajes de error en el navegador
3. Contacta al equipo de desarrollo
