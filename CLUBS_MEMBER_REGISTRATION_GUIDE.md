# Guía de Registro de Miembros - Ridera Clubes

## 🎯 Descripción General

Sistema completo para que usuarios se registren como miembros de un club de motociclistas, con:

1. ✅ **Página de listado de clubes** - Ver todas las opciones
2. ✅ **Página individual del club** - Detalles + formulario de registro
3. ✅ **Upload de fotos** - Mínimo 3 fotos requeridas
4. ✅ **Información de moto** - Registrar datos del vehículo
5. ✅ **Almacenamiento** - Supabase para fotos y datos

## 📊 Flujo Completo

```
USUARIO LLEGA
    ↓
1. Ve listado de clubes: /supabase/clubes/clubes.html
    ↓
2. Filtra/Busca el club que le interesa
    ↓
3. Hace click en tarjeta del club
    ↓
4. Se abre página individual: /supabase/clubes/{slug}.html
    ↓
5. Lee información del club (detalles, líder, redes)
    ↓
6. VE FORMULARIO DE REGISTRO
    ↓
7. Completa datos personales
    ↓
8. Ingresa info de su moto
    ↓
9. SUBE MÍNIMO 3 FOTOS
    ↓
10. Hace click "Unirme al Club"
    ↓
11. Fotos se suben a Supabase Storage
    ↓
12. Registro se guarda en tabla club_members
    ↓
13. Recibe confirmación ✅
    ↓
14. Líder del club recibe notificación
```

## 🌐 URLs

### Listado de Clubes
```
/supabase/clubes/clubes.html
```
**Muestra**: Grid de clubes con filtros

### Página Individual + Registro
```
/supabase/clubes/{slug}.html

Ejemplos:
/supabase/clubes/touring-bikers-colombia.html
/supabase/clubes/cruisers-medellin.html
/supabase/clubes/enduro-antioquia.html
```

## 📋 Formulario de Registro

### Sección 1: Información Personal

**Campos Requeridos**:
- Nombre Completo ✅
- Email ✅

**Campos Opcionales**:
- Teléfono
- WhatsApp
- Ciudad

```
┌─────────────────────────────────────────┐
│ Información Personal                    │
├─────────────────────────────────────────┤
│ Nombre Completo: [                    ] │
│ Email:           [usuario@ejemplo.com  ] │
│ Teléfono:        [+57 300 1234 567    ] │
│ WhatsApp:        [+57 300 1234 567    ] │
│ Ciudad:          [Medellín            ] │
└─────────────────────────────────────────┘
```

### Sección 2: Información de tu Moto

**Campos Requeridos**:
- Marca ✅

**Campos Opcionales**:
- Modelo
- Año
- Color

```
┌─────────────────────────────────────────┐
│ Información de tu Moto                  │
├─────────────────────────────────────────┤
│ Marca:   [BMW                         ] │
│ Modelo:  [R1200GS                     ] │
│ Año:     [2024                        ] │
│ Color:   [Rojo                        ] │
└─────────────────────────────────────────┘
```

### Sección 3: Fotos (Crítica)

**Requerido**: Mínimo 3 fotos

**Características**:
- Arrastra fotos o haz click
- Vista previa de imágenes
- Botón X para remover
- Contador de fotos
- Validación antes de enviar

```
┌──────────────────────────────────────────┐
│ Fotos (Mínimo 3 requeridas)              │
├──────────────────────────────────────────┤
│                                          │
│  📸                                      │
│  Arrastra tus fotos aquí                │
│  o haz click para seleccionar           │
│                                          │
│ [Previsualizaciones de fotos]           │
│ [Photo 1] [Photo 2] [Photo 3] [+]       │
│                                          │
│ Fotos seleccionadas: 3/∞ (mínimo 3) ✅  │
│                                          │
└──────────────────────────────────────────┘
```

### Sección 4: Mensaje Adicional (Opcional)

**Campo**:
- Textarea para describir por qué quiere unirse

```
┌──────────────────────────────────────────┐
│ ¿Por qué quieres unirte a este club?     │
├──────────────────────────────────────────┤
│ [Soy un entusiasta de las motos de     ] │
│  aventura y he participado en varias    │
│  rutas por Colombia...]                 │
│                                          │
│ [🚀 Unirme al Club]  [Limpiar]          │
└──────────────────────────────────────────┘
```

## 📸 Sistema de Fotos

### Upload de Fotos

**Métodos de Subida**:
1. Arrastra fotos a la zona
2. Haz click en la zona para abrir selector
3. Selecciona múltiples archivos

**Validaciones**:
- ✅ Solo imágenes (JPG, PNG, GIF, WebP)
- ✅ Mínimo 3 fotos requeridas
- ✅ Máximo 10 fotos por registro
- ✅ Duplicados detectados automáticamente

**Preview**:
- Miniaturas en grid
- Botón X para remover individual
- Contador en tiempo real

### Almacenamiento

**Ubicación**: Supabase Storage
- Bucket: `club-photos`
- Estructura: `{club_id}/{timestamp}-{random}-{filename}`
- Público: Accesible desde web

**URLs**:
```
https://vzzxsdtsaahhzyctvmhx.supabase.co/storage/v1/object/public/club-photos/{club_id}/{photo_name}
```

## 💾 Base de Datos - Tabla `club_members`

### Estructura

```sql
CREATE TABLE club_members (
  id UUID PRIMARY KEY,
  club_id UUID (referencia a clubs),
  fullname TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  whatsapp TEXT,
  city TEXT,
  moto_brand TEXT NOT NULL,
  moto_model TEXT,
  moto_year INTEGER,
  moto_color TEXT,
  photo_urls TEXT[] (array de URLs),
  message TEXT,
  status TEXT ('pending', 'approved', 'rejected'),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Ejemplo de Registro

```json
{
  "id": "uuid-123",
  "club_id": "touring-bikers-id",
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
    "https://..../photo1.jpg",
    "https://..../photo2.jpg",
    "https://..../photo3.jpg"
  ],
  "message": "Soy un entusiasta de las motos...",
  "status": "pending",
  "created_at": "2024-07-16T12:00:00Z"
}
```

## 🔐 Seguridad

### Row Level Security (RLS)

1. **Insertar**: Cualquiera puede registrarse
2. **Ver**: Solo el usuario registrado puede ver su propio registro
3. **Ver (Líder)**: Líder del club puede ver registros de su club
4. **Gestionar**: Solo admins pueden modificar/eliminar

### Storage

- Bucket público para lectura
- Cualquiera puede subir a su registro
- Protección por UUID del usuario

## 📧 Notificaciones

### Al Usuario
- Email de confirmación de registro (próximamente)
- Link para rastrear estado

### Al Líder del Club
- Notificación de nuevo registro
- Link a panel admin para aprobar/rechazar

## ✅ Validaciones

### Frontend

```javascript
// Validaciones en tiempo real
- Email válido
- Mínimo 3 fotos
- Campos requeridos llenos
```

### Backend (Supabase)

```sql
- Email único por club
- Foreign key a club
- Status debe ser válido
```

## 🎨 Interfaz

### Estados del Formulario

1. **Inicial**: Vacío, listo para completar
2. **Completando**: Datos ingresados
3. **Subiendo Fotos**: Previsualizaciones visibles
4. **Enviando**: Botón deshabilitado, loader
5. **Éxito**: Mensaje confirmación verde
6. **Error**: Mensaje rojo con descripción

### Colores

- Naranja (#E85D20): Inputs, labels, CTA
- Verde (#10b981): Confirmación
- Rojo (#ef4444): Errores
- Gris: Textos secundarios

## 📱 Responsive

- **Desktop**: 2 columnas en form
- **Tablet**: 1 columna, grid de fotos adaptativo
- **Mobile**: Full width, stack vertical

## 🚀 Flujo Técnico Completo

```
1. Usuario carga página club-detail-with-signup.html
   ↓
2. Se carga info del club desde Supabase
3. Se renderiza página + formulario
   ↓
4. Usuario completa formulario + selecciona fotos
   ↓
5. Click en "Unirme al Club"
   ↓
6. Validación frontend (3+ fotos, campos requeridos)
   ↓
7. Se suben fotos a Supabase Storage
   ↓
8. Se guarda registro en tabla club_members
   ↓
9. Confirmación en pantalla
   ↓
10. Formulario se limpia
```

## 🔧 Configuración Requerida

### Supabase

1. **Ejecutar migraciones**:
   ```sql
   -- Ejecutar migrations 001 y 002
   ```

2. **Crear Storage Bucket**:
   ```
   Nombre: club-photos
   Público: true
   ```

3. **Configurar CORS**:
   - Origen: tu dominio
   - Métodos: GET, POST, DELETE

## 📊 Panel Admin para Líderes

Próximamente: Sección en admin panel para:
- Ver registros pendientes
- Aprobar/rechazar miembros
- Ver galería de fotos
- Enviar mensajes a miembros

## 🐛 Troubleshooting

| Problema | Solución |
|----------|----------|
| No puedo subir fotos | Verificar navegador es moderno (Chrome, Firefox, Safari) |
| Dice "Mínimo 3 fotos" | Verificar que subiste 3 imágenes diferentes |
| Error de almacenamiento | Verificar Storage bucket existe en Supabase |
| Registro no se guarda | Verificar tabla club_members existe |

## 📚 Archivos Relacionados

- `club-detail-with-signup.html` - Página principal
- `clubes.html` - Listado de clubes
- `wordpress-clubs-integration.php` - Integración WordPress
- Migraciones: `001_create_clubs_table.sql`, `002_create_club_members_table.sql`

## 🎯 Próximas Mejoras

- [ ] Email de confirmación automático
- [ ] Panel admin para revisar registros
- [ ] Aprobación automática después de X horas
- [ ] Foto de perfil de miembro
- [ ] Sistema de comentarios en registro
- [ ] Importar de redes sociales

## 📞 Soporte

¿Problemas? Revisa:
1. Console del navegador (F12)
2. Logs de Supabase
3. Estructura de Storage bucket
4. RLS policies están activas

---

**Versión**: 1.0  
**Fecha**: 2024-07-16  
**Estado**: ✅ Listo para producción
