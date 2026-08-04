# Quickstart: Almacén Registration System

## ✅ Completado

- [x] Formulario completo de registro (6 secciones)
- [x] API Netlify para procesar registros
- [x] API Netlify para subir imágenes
- [x] Schema SQL para base de datos
- [x] Rutas configuradas en _redirects
- [x] Código desplegado en branch `claude/si-bcemqt`

## 🔨 TODO (3 pasos)

### 1️⃣ Ejecutar SQL en Supabase (5 min)

```
URL: https://app.supabase.com → Tu Proyecto → SQL Editor
Archivo: supabase-migrations/extend-almacenes-schema.sql
Acción: Copiar y Ejecutar
```

Esto agrega:
- Columnas a `almacenes`: logo_url, fotos_urls, categorias, brands, etc.
- Nueva tabla: `almacen_horarios` (horarios por día)

### 2️⃣ Crear bucket de Storage en Supabase (2 min)

```
Supabase Dashboard → Storage → New Bucket
Nombre: almacenes
Public: Sí ✓
```

Esto permite subir logos y fotos.

### 3️⃣ Testear formulario (5 min)

```
URL: https://gruas.ridera.com.co/registrar-almacen

Test Checklist:
- [ ] Completa nombre, ciudad, email, teléfono
- [ ] Sube logo (imagen cuadrada)
- [ ] Sube 1-3 fotos
- [ ] Selecciona categorías (ej: Repuestos OEM)
- [ ] Selecciona marcas (ej: Honda, KTM)
- [ ] Configura horarios (ej: Lunes-Viernes 8am-6pm)
- [ ] Selecciona opciones de entrega
- [ ] Crea contraseña
- [ ] Click "Registrar Almacén"
- [ ] Redirige a dashboard (/mi-almacen?slug=...)
```

## 📍 Rutas Disponibles

| URL | Descripción |
|-----|-------------|
| `/registrar-almacen` | ← Nuevo formulario completo |
| `/almacenes` | Lista de todos los almacenes |
| `/almacen/[slug]` | Catálogo público del almacén |
| `/mi-almacen?slug=...` | Dashboard del propietario |

## 🔗 Flujo del Usuario

1. Usuario va a `/registrar-almacen`
2. Completa formulario con 6 secciones
3. Sube logo + fotos (guardadas en Supabase Storage)
4. Sistema crea:
   - Cuenta en Supabase Auth
   - Registro en tabla `almacenes`
   - Horarios en tabla `almacen_horarios`
5. Redirige a `/mi-almacen` para editar productos

## 💾 Datos Guardados

### En `almacenes` table:
```
- slug (auto-generado de nombre)
- nombre, ciudad, telefono, email
- ubicacion, contacto_nombre
- logo_url (Supabase Storage public URL)
- fotos_urls (array de URLs)
- categorias (array: "Repuestos OEM", "Aftermarket", etc.)
- brands (array: "Honda", "KTM", "BMW", etc.)
- delivery_options (array: "en_ciudad", "nacional", "no")
- auth_id (usuario propietario)
- status (siempre "activo" al registrar)
```

### En `almacen_horarios` table:
```
- almacen_id (FK)
- dia_semana (0-6: domingo-sábado)
- hora_apertura (HH:MM)
- hora_cierre (HH:MM)
- abierto (true/false)
```

## 🎯 Resultado Final

Después de esto, los almacenes:
1. ✓ Pueden registrarse en `/registrar-almacen`
2. ✓ Tienen dashboard en `/mi-almacen` para editar catálogo
3. ✓ Aparecen en lista pública `/almacenes`
4. ✓ Sus productos son buscables por Rita (WhatsApp)
5. ✓ Tienen página pública `/almacen/[slug]` con catálogo

## 🚀 Para "ir a producción"

```bash
# 1. Testear completamente (ver checklist arriba)
# 2. Merge a main cuando esté listo:
git checkout main
git merge claude/si-bcemqt
git push origin main

# 3. Esto auto-despliega en Netlify
# 4. Verificar en https://gruas.ridera.com.co
```

## ❓ Troubleshooting

| Problema | Solución |
|----------|----------|
| "Error: campo requerido" | Completa todos los campos del formulario |
| "Error subiendo imagen" | Verifica que el bucket `almacenes` existe en Supabase Storage |
| "No se guardó en BD" | Ejecuta la migración SQL: `extend-almacenes-schema.sql` |
| "Redirige a error" | Verifica `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` en Netlify env |

---

**Tiempo total estimado**: 15-20 min (SQL + bucket + testing)

Cualquier duda: Revisa `ALMACEN-SETUP-GUIDE.md` para instrucciones detalladas.
