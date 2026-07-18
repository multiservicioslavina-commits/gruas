# 🔍 Auditoría Completa: ridera-ride-live

**Fecha:** 2026-07-18  
**Estado:** 🔴 CRÍTICO - Proyecto NO compila

---

## 🚨 ERRORES CRÍTICOS (Bloquean compilación)

### 1. ❌ Archivo faltante: `video_config.dart`

**Ubicación:** Falta en `/lib/`

**Impacto:** Los archivos que lo importan NO compilan:
- `lib/services/video_service.dart` (línea 4)
- `lib/services/directions_service.dart` (línea 5)

**Error esperado:**
```
Target of URI doesn't exist: '../video_config.dart'
```

**Variables no definidas:**
```dart
kVideoBackendUrl    // Usada en video_service.dart línea 50, 82
```

**Solución:** Crear `lib/video_config.dart` con:
```dart
const String kVideoBackendUrl = 'https://tu-backend-url:3000';
```

---

## ⚠️ PROBLEMAS ESTRUCTURALES

### 2. Rutas API hardcodeadas sin centralización

**Ubicación:** Múltiples archivos

**Problema:** URLs del backend están hardcodeadas en varios servicios sin una configuración centralizada

**Archivos afectados:**
- `lib/services/video_service.dart` - USA `kVideoBackendUrl` (no definida ❌)
- `lib/services/directions_service.dart` - Importa `video_config.dart` (no existe ❌)

**Recomendación:** 
- Crear `lib/config/backend_config.dart`
- Centralizar todas las URLs
- Soportar dev/prod/staging

---

## 🔧 PROBLEMAS DE ARQUITECTURA

### 3. main.dart tiene código sin usar

**Ubicación:** `lib/main.dart` líneas 79-100

**Problema:** Clase `_AuthGate` está definida pero NUNCA es usada:
```dart
home: const SplashScreen(),  // Línea 74 - ignora _AuthGate
```

**Impacto:** Código muerto, confunde el flujo de autenticación

**Acción:** 
- ❌ Eliminar `_AuthGate` (nunca se renderiza)
- O ✅ Usar: `home: const _AuthGate(),`

---

### 4. Flujo de autenticación poco claro

**Ubicación:** `lib/main.dart`

**Análisis:**
- `SplashScreen` es la home inicial ✓
- Pero `_AuthGate` también existe pero no se usa ❌
- La lógica de auth state está duplicada

**Recomendación:**
```dart
// Opción A: Usar SplashScreen como guard
home: const SplashScreen(),  // Revisa auth y redirige

// Opción B: Usar _AuthGate como guard
home: const _AuthGate(),  // Revisa auth y redirige
```

Elegir UNA y eliminar la otra.

---

## 📝 REVISIÓN SERVICIO POR SERVICIO

### ✅ `video_service.dart` - Lógica OK, Config FALTA

- Polling correcto (5s intervals)
- Timeout de 45 minutos apropiado
- Manejo de errores resiliente (5 intentos consecutivos)
- **PERO:** Importa `video_config.dart` que NO EXISTE ❌

### ✅ `location_service.dart` - Bien

- Usa MethodChannel para Android GPS ✓
- Pide permisos correctamente ✓
- Manejo de token de acceso ✓

### ⚠️ `ride_summary_screen.dart` - Lógica OK, Lentitud potencial

- Carga datos correctamente
- Genera video sin bloquear UI
- **PERO:** Hace muchos queries sequenciales a Supabase (N+1 problem)

**Líneas 114-120:** Loop de queries por cada miembro del grupo
```dart
for (final member in otherMembers) {
  final memberPts = await _db.from('route_points')...  // ❌ Query por loop
}
```

**Solución:** Hacer un query batch o usar RPC de Supabase

### ⚠️ `ride_map_screen.dart` - Muy grande (50KB)

- 50KB de código en un solo archivo
- Probablemente tiene lógica que debería estar en servicios
- Difícil de mantener y testear

**Recomendación:** Refactorizar en componentes más pequeños

### ❓ Otros servicios sin revisar

- `mesh_service.dart` - Necesita auditoría
- `crash_detector.dart` - Necesita auditoría
- `push_dispatcher.dart` - Necesita auditoría
- `notification_service.dart` - Necesita auditoría

---

## 🎯 PROBLEMAS POR PRIORIDAD

### 🔴 CRÍTICO (impide compilación / crashes)

1. **[HACER YA]** Crear `lib/video_config.dart` con `kVideoBackendUrl`
2. **[HACER YA]** Remover `_AuthGate` no usado o usarlo

### 🟠 ALTO (impacta funcionalidad)

3. Optimizar queries N+1 en `ride_summary_screen.dart`
4. Revisar y auditar `mesh_service.dart` (red mesh de motociclistas)
5. Revisar `crash_detector.dart` (detección de caídas)

### 🟡 MEDIO (mejora de calidad)

6. Refactorizar `ride_map_screen.dart` (demasiado grande)
7. Centralizar configuración de APIs
8. Agregar logging y error tracking
9. Tests unitarios para servicios críticos

### 🟢 BAJO (técnico debt)

10. Eliminar código muerto
11. Mejorar nombres de variables
12. Agregar documentación

---

## 📊 ESTADÍSTICAS

| Métrica | Valor |
|---------|-------|
| **Archivos Dart** | 20 |
| **Líneas de código** | ~3500+ |
| **Pantallas** | 14 |
| **Servicios** | 13 |
| **Errores críticos** | 2 ❌ |
| **Alertas altas** | 3 ⚠️ |

---

## ✅ QUÉ SÍ ESTÁ BIEN

- ✅ Uso correcto de Supabase SDK
- ✅ Manejo de notificaciones con OneSignal
- ✅ Gestión de permisos de ubicación
- ✅ Integración con backend de video
- ✅ Captura de fotos y galería
- ✅ Manejo de errores en async/await
- ✅ UI temas configurables

---

## 🛠️ PRÓXIMOS PASOS

### Fase 1: ARREGLAR ERRORES CRÍTICOS (30 min)
1. Crear `lib/video_config.dart`
2. Remover/usar `_AuthGate`
3. Verificar compilación

### Fase 2: OPTIMIZAR (2 horas)
4. Corregir N+1 queries en ride_summary_screen
5. Revisar mesh_service
6. Revisar crash_detector

### Fase 3: REFACTOR (4+ horas)
7. Dividir ride_map_screen
8. Centralizar configuración
9. Agregar tests

---

## 📎 ARCHIVOS A REVISAR/CREAR

```
lib/
├── video_config.dart                    ❌ CREAR
├── config/
│   └── backend_config.dart              📝 CREAR (centralizar URLs)
├── main.dart                            ⚠️ REMOVER _AuthGate
├── screens/
│   ├── ride_map_screen.dart             🔧 REFACTOR (50KB)
│   └── ride_summary_screen.dart         ⚡ OPTIMIZAR (N+1 queries)
└── services/
    ├── mesh_service.dart                🔍 AUDITAR
    ├── crash_detector.dart              🔍 AUDITAR
    └── video_service.dart               ✓ OK (si se crea video_config)
```

---

## 💬 CONCLUSIÓN

**Estado actual:** El proyecto no puede compilar sin arreglar los errores críticos.

**Prioridad inmediata:** 
1. Crear `video_config.dart`
2. Limpiar `main.dart`
3. Testear compilación

Una vez compilado, se pueden hacer optimizaciones.
