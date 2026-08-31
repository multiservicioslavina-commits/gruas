# Guía de Administración - Ridera Club Chat

## 🔐 Panel de Admin

### Acceso
- Solo administradores del chat pueden ver esta sección
- **Botón**: 👥 en el menú lateral (☰)
- Título: "Miembros del club"

---

## 📋 Gestionar Miembros

### Estado de Miembros
Los miembros tienen tres estados:

1. **🔴 Pide entrar** (Solicitud pendiente)
   - Usuario registró pero no fue aprobado
   - Muestra teléfono para verificar identidad
   - Acciones: ✅ Aprobar o ❌ Quitar

2. **🟡 Pendiente** (En proceso)
   - Admin aprobó la solicitud
   - Sistema envió notificación WhatsApp
   - Usuario va a entrar en los próximos minutos

3. **🟢 Vinculado** (Activo)
   - Usuario está dentro del club
   - Puede ver y escribir mensajes
   - Acciones: ❌ Quitar si es necesario

### Aprobar Solicitudes
1. Ve la lista de miembros
2. Busca quiénes tienen etiqueta "Pide entrar"
3. Presiona **✅ Aprobar**
4. Sistema envía WhatsApp automáticamente
5. Usuario verá mensaje: "✅ ¡Tu solicitud fue aprobada!"

**Nota**: Si ves "Aprobado (notificación no llegó)", el usuario fue aprobado pero:
- La notificación de WhatsApp no llegó
- Verifica que el número sea correcto
- Puedes contactarle por otro medio

### Agregar Miembros Manualmente
1. En el panel, completa:
   - **Nombre**: Nombre completo
   - **Teléfono**: Número celular (ej: 310 1234567)
2. Presiona **Agregar**
3. El miembro entra inmediatamente (sin necesidad de aprobación)
4. Puedes contactarle para darle el link del chat

### Quitar Miembros
1. Busca al miembro en la lista
2. Presiona **❌ Quitar**
3. Elige si deseas borrar sus mensajes
4. El miembro será removido del chat

**Importante**: 
- Solo admins ven el panel
- No puedes remover otro admin
- Los mensajes pueden ser borrados pero la acción es irreversible

---

## 💬 Moderar Conversaciones

### Acciones sobre Mensajes (Admins)
- Mantén presionado cualquier mensaje
- Opciones:
  - **✏️ Editar**: Solo en textos propios
  - **📋 Copiar**: Copia el texto
  - **🗑️ Eliminar**: Borra para todos (incluso de otros)

### Uso Responsable
- Borra solo spam, contenido ofensivo, o errores graves
- No uses para censurar opiniones legítimas
- Documenta si hay abusos repetitivos

---

## 📊 Ver Actividad

### Miembros En Línea
- **Punto verde con número** en header
- Muestra quiénes estuvieron activos en últimos 5 minutos
- Haz clic para ver detalles (nombre + tiempo de actividad)

### Última Actividad
- En la lista de miembros no aparece explícitamente
- Se registra automáticamente con cada mensaje
- Es lo que define el "En línea ahora"

---

## 🚀 Configuración del Club

### Link de Invitación
- Formato: `https://club.ridera.com.co/[CODIGO]`
- El código es único por club
- Comparte este link para que se unan

### Cambiar Nombre o Descripción
- Requiere acceso a base de datos (no disponible en UI)
- Contacta a soporte si necesitas cambios

### Salas (Channels)
- Chat general, Rita (asistente), Eventos, Comercio, etc.
- Crear nuevas salas requiere permisos especiales
- Contacta a soporte

---

## 🔧 Mejores Prácticas

✅ **Aprueba rápido**: Usuarios esperan validación  
✅ **Da bienvenida**: Saluda a miembros nuevos  
✅ **Mantén orden**: Elimina spam regularmente  
✅ **Sé justo**: Aplica reglas a todos igual  
✅ **Comunica cambios**: Anuncia nuevas reglas o cambios  

❌ **No hagas**: Borrar opiniones que no te gusten  
❌ **No abuse del poder**: El chat es de la comunidad  
❌ **No spam**: Evita promociones excesivas  
❌ **No reveles**: Datos privados de miembros  

---

## ⚠️ Reportes de Problema

### Miembro no recibe notificación de aprobación
- Verifica que el número telefónico sea correcto
- Revisa que el formato sea: 57XXXXXXXXXX o 3XXXXXXXXXX
- Espera un minuto y reintenta

### Mensajes enviados no aparecen
- Actualiza la página (F5)
- El mensaje podría estar en otra sala
- Si persiste, reporta el problema

### Usuario no puede entrar después de ser aprobado
- Verifica que esté en estado "Vinculado" (verde)
- Pide que recargue la página
- Verifica conexión a internet

### Necesito cambiar roles o permisos
- Solo el dueño del club puede hacer esto
- Contacta a soporte@ridera.com.co

---

## 📞 Soporte

¿Problemas técnicos? 
- Email: soporte@ridera.com.co
- WhatsApp: [número de soporte]
- Reporta: nombre del club + descripción del problema

---

**Última actualización**: 31 de agosto, 2026
**Versión**: 2.0 (Con búsqueda y miembros en línea)
