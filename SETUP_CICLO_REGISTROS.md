# Ciclo Completo: Registro → Supabase → Aprobación → WordPress

## 📋 Flujo

```
1. Usuario completa formulario (Rider/Taller/Almacén/Grúa)
   ↓
2. Datos se envían a Supabase (estado: 'pendiente')
   ↓
3. Admin revisa y aprueba en Supabase (estado: 'aprobado')
   ↓
4. Trigger en Supabase dispara Edge Function
   ↓
5. Edge Function crea post en WordPress (publicado)
   ↓
6. WordPress sincroniza aprobación de vuelta a Supabase
```

---

## ✅ Checklist de Configuración

### 1️⃣ Crear Tablas en Supabase

Ejecuta la migración SQL en tu proyecto Supabase:

```bash
# Copiar contenido de supabase/migrations/create_business_tables.sql
# Ir a: Project → SQL Editor → Crear Query
# Pegar y ejecutar
```

Esto crea:
- `talleres` table
- `almacenes` table
- `gruas` table
- `admin_registros_pendientes` view (para revisar pendientes)
- Triggers automáticos

### 2️⃣ Habilitar Extensión `pg_net` en Supabase

Esto permite que los triggers llamen funciones HTTP.

```sql
create extension if not exists pg_net with schema extensions;
```

### 3️⃣ Desplegar Edge Function

```bash
cd /home/user/gruas

# Desplegar approve-and-publish
supabase functions deploy approve-and-publish

# Establecer variables de entorno
supabase secrets set WP_USER="1"
supabase secrets set WP_PASSWORD="tu_password_wordpress"
```

> **WP_PASSWORD**: Genera una contraseña de aplicación en WordPress → Usuarios → Tu usuario → Contraseña de aplicación

### 4️⃣ Instalar Hook en WordPress

Copia el contenido de `wordpress-hook.php` a:
- `wp-content/themes/tu-tema-hijo/functions.php` (tema hijo)
- O crea un plugin personalizado

El hook:
- Escucha cuando un post se publica
- Sincroniza aprobación de vuelta a Supabase

### 5️⃣ Configurar SUPABASE_URL en HTML

En `ridera-join-guild-fixed.html`, reemplaza:

```javascript
const SUPABASE_URL = 'https://YOUR_SUPABASE_URL.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

Encuéntralos en:
- Supabase Dashboard → Project Settings → API

### 6️⃣ Crear Formularios en WordPress

Para que admins aprueben registros, crea un formulario personalizado o usa:

```sql
-- Query para ver pendientes
select id, nombre, email, telefono, ciudad, estado
from admin_registros_pendientes
where estado = 'pendiente'
order by created_at asc;

-- Aprobar un registro
update talleres
set estado = 'aprobado'
where id = 'uuid-aqui';
```

O crea un dashboard en WordPress que lea directamente de Supabase.

---

## 🧪 Prueba del Ciclo

### Test 1: Registrar en formulario

```bash
# Abre ridera-join-guild-fixed.html
# Completa el formulario de Taller
# Verifica que llegue a Supabase
```

En Supabase SQL Editor:
```sql
select * from talleres where estado = 'pendiente' order by created_at desc limit 1;
```

### Test 2: Aprobar registro

```sql
update talleres
set estado = 'aprobado'
where id = 'el-uuid-del-test';
```

Espera 2-3 segundos y verifica:
- ✅ Aparece post en WordPress
- ✅ `wp_post_id` se llena en Supabase
- ✅ Estado dice `aprobado`

### Test 3: Publicar desde WordPress

Publica un post tipo "Taller" en WordPress y verifica:
- ✅ Supabase se actualiza con `aprobado_en`

---

## 📊 Variables de Entorno Requeridas

**En Supabase (Secrets):**
```
WP_USER = "1"
WP_PASSWORD = "abc123defg..."
```

**En HTML (constantes JavaScript):**
```javascript
SUPABASE_URL = "https://xxx.supabase.co"
SUPABASE_ANON_KEY = "eyJhbG..."
```

---

## 🔧 Troubleshooting

### Error: "Edge Function not found"

- Verifica que `approve-and-publish` esté deployed
- `supabase functions list`

### Error: "WordPress post no se crea"

- Verifica credenciales WordPress (WP_USER, WP_PASSWORD)
- Revisa logs en Supabase → Functions → approve-and-publish

### Trigger no se dispara

- Verifica que `pg_net` extensión esté habilitada
- Los triggers solo se activan cuando `estado` cambia A 'aprobado'

### RLS bloquea inserts

- Las políticas RLS permiten inserts sin auth
- Asegúrate que `SUPABASE_ANON_KEY` sea válida en HTML

---

## 📝 Schema Tabla

```sql
-- Ejemplo estructura
create table talleres (
  id uuid primary key,
  nombre text,
  email text,
  telefono text,
  ciudad text,
  descripcion text,
  estado text ('pendiente', 'aprobado', 'error'),
  wp_post_id bigint,
  error_msg text,
  aprobado_en timestamptz,
  created_at timestamptz,
  updated_at timestamptz
);
```

Mismo schema para `almacenes` y `gruas`.

---

## 🚀 Resumen

El ciclo está completo cuando:

1. ✅ Formularios envían a Supabase
2. ✅ Registros se guardan en estado 'pendiente'
3. ✅ Admin aprueba (estado = 'aprobado')
4. ✅ Trigger dispara Edge Function
5. ✅ Edge Function crea post en WordPress
6. ✅ WordPress sincroniza de vuelta a Supabase

**Tiempo estimado de configuración:** 15-20 minutos
