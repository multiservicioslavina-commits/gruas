# API REST

Base: `/api`. Todo entra y sale en JSON con `UTF-8`.

## Autenticación

Salvo lo marcado como público, cada petición lleva el token en la cabecera:

```
Authorization: Bearer <token>
```

El token sale de `POST /api/auth/login` y caduca según `JWT_EXPIRES_IN` (12 h por
defecto). En cada petición se revalida el usuario contra la base, así que
desactivarlo corta su acceso al instante, sin esperar a que el token expire.

### Errores

| Código | Cuándo |
|---|---|
| `400` | Datos inválidos o incompletos |
| `401` | Sin token, token vencido o usuario inactivo |
| `403` | El rol o la llave no tienen permiso para esa acción |
| `404` | No existe, **o pertenece a otro taller** |
| `409` | Conflicto: duplicado, transición de estado no permitida, stock insuficiente |
| `413` | Archivo demasiado grande |
| `500` | Error interno |

Formato: `{ "error": "mensaje en español", "details": … }`.

> Un recurso de otro taller responde `404`, no `403`: así la API no confirma
> siquiera que ese identificador exista.

---

## Sesión

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/auth/register` | **Público.** Crea taller + usuario administrador. Se puede desactivar con `ALLOW_SIGNUP=false` |
| `POST` | `/auth/login` | **Público.** Devuelve `{ token, user }` |
| `GET` | `/auth/me` | Usuario y taller de la sesión |
| `POST` | `/auth/change-password` | Requiere la contraseña actual |

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@tallerdemo.test","password":"demo12345"}'
```

## Taller y equipo

| Método | Ruta | Rol |
|---|---|---|
| `GET` | `/workshop` | cualquiera |
| `PATCH` | `/workshop` | admin |
| `GET` | `/users` | cualquiera (filtros `?role=` `?active=`) |
| `POST` | `/users` | admin |
| `PATCH` | `/users/:id` | admin |

Un administrador no puede desactivarse ni quitarse el rol a sí mismo: dejaría
al taller sin quien lo administre.

## Clientes y motos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/customers` | `?search=` `?limit=` `?offset=` |
| `POST` `PATCH` `DELETE` | `/customers[/:id]` | Alta, edición y baja |
| `GET` | `/customers/:id/detail` | Cliente + sus motos + sus órdenes |
| `GET` | `/motorcycles` | `?search=` `?customer_id=` |
| `POST` `PATCH` `DELETE` | `/motorcycles[/:id]` | |
| `GET` | `/motorcycles/by-plate/:plate` | Búsqueda por placa (`404` si no existe) |
| `GET` | `/motorcycles/:id/history` | Historial de servicio completo |

La placa es única por taller (sin distinguir mayúsculas ni espacios). Dos
talleres distintos sí pueden tener la misma placa.

## Agenda

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/appointments` | `?status=` `?customer_id=` |
| `POST` `PATCH` `DELETE` | `/appointments[/:id]` | |
| `GET` | `/appointments/calendar/range?from=&to=` | Con cliente y moto resueltos |

Estados: `scheduled`, `confirmed`, `arrived`, `no_show`, `cancelled`, `done`.

## Órdenes de trabajo

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/work-orders` | `?status=` `?open=true` `?unpaid=true` `?search=` `?mechanic_id=` `?from=` `?to=` |
| `GET` | `/work-orders/statuses` | Mapa de transiciones permitidas |
| `POST` | `/work-orders` | Recepción de la moto |
| `GET` | `/work-orders/:id` | Ficha completa |
| `PATCH` | `/work-orders/:id` | Edita campos; recalcula si cambian descuento o IVA |
| `POST` | `/work-orders/:id/status` | Cambia el estado |
| `POST` `DELETE` | `/work-orders/:id/services[/:lineId]` | Mano de obra |
| `POST` `DELETE` | `/work-orders/:id/parts[/:lineId]` | Repuestos (mueven inventario) |
| `POST` | `/work-orders/:id/diagnostics` | Diagnóstico |
| `POST` | `/work-orders/:id/payments` | Pago (recepción o caja) |
| `DELETE` | `/work-orders/:id/payments/:paymentId` | Anula un pago (caja) |

### Recepción

Sólo hace falta la placa y el motivo. Si la placa ya existe, se reutiliza la
moto y su dueño; si no, se crean ambos en la misma transacción.

```bash
curl -X POST http://localhost:3000/api/work-orders \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
        "plate": "ABC12D",
        "customer_name": "Juan Motero",
        "customer_phone": "3001234567",
        "brand": "Yamaha", "model": "FZ 2.0", "year": 2021,
        "complaint": "Suena la cadena y no arranca en frío",
        "mileage_in": 24500,
        "fuel_level": "half",
        "accessories": ["Casco", "Baúl"],
        "existing_damage": "Rayón en el tanque, lado derecho"
      }'
```

La respuesta trae `public_code`: el código de seis caracteres con el que el
cliente sigue su moto.

### Flujo de estados

```
scheduled → received → diagnosing → quoted → pending_approval → approved
          → repairing ⇄ waiting_parts → quality_check → ready → delivered → closed
```

`cancelled` sale del flujo en cualquier punto. `closed` y `cancelled` son
terminales: no admiten más cambios ni nuevas líneas. Una transición no
permitida responde `409` con la lista de estados válidos desde el actual.

Consulta `GET /work-orders/statuses` en vez de codificar el mapa en el cliente.

### Totales

```
subtotal = mano de obra aprobada + repuestos aprobados
base     = subtotal − descuento          (nunca menor que cero)
impuesto = base × (tax_rate / 100)
total    = base + impuesto
```

**Sólo suman las líneas aprobadas.** Una línea con `approved: false` es una
propuesta: se cotiza, pero no se cobra ni sale de bodega hasta que el cliente
la autorice. Es lo que implementa el "bloqueo de trabajos no autorizados".

### Inventario en las órdenes

Cargar un repuesto con `part_id` descuenta el stock y deja un movimiento
trazable. Si no hay existencias suficientes responde `409`; para forzarlo (y
dejar el stock en negativo) se envía `allow_negative_stock: true`. Quitar la
línea devuelve la pieza al inventario.

## Cotizaciones y aprobación

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/work-orders/:id/quotes` | Arma la cotización con las líneas de la orden |
| `GET` | `/quotes/:id` | Cotización, ítems y decisiones registradas |
| `PATCH` | `/quotes/:id` | Descuento, validez y notas (antes de responder) |
| `POST` | `/quotes/:id/send` | La marca enviada y deja la orden esperando al cliente |

Al crearla, las líneas que aún no están aprobadas se marcan como `optional`:
son las que el cliente puede aceptar o rechazar por separado. La respuesta
incluye `public_url`, el enlace que se le pasa al cliente.

## Rutas públicas (sin token)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/public/orders/:code` | Estado de la orden por su código |
| `GET` | `/public/quotes/:token` | Cotización enviada |
| `POST` | `/public/quotes/:token/respond` | Aprobar o rechazar |

Devuelven sólo lo necesario: ni identificadores internos, ni costos, ni el
nombre completo del cliente (sólo el primer nombre). Una orden anulada deja de
ser consultable.

```bash
curl -X POST http://localhost:3000/api/public/quotes/$TOKEN/respond \
  -H 'Content-Type: application/json' \
  -d '{
        "decision": "approved",
        "customer_name": "Juan Motero",
        "items": [{ "id": "<id-del-ítem-opcional>", "approved": false }]
      }'
```

Al responder: se aprueban o descartan las líneas reales de la orden, se
descuenta el inventario de lo autorizado, se recalculan los totales, la orden
avanza sola (a `approved`, o a `cancelled` si se rechaza todo) y la decisión
queda registrada en `approvals` con fecha, IP y navegador. Una cotización sólo
se responde una vez, y no después de su fecha de validez.

## Catálogo e inventario

| Método | Ruta | Descripción |
|---|---|---|
| `GET` `POST` `PATCH` `DELETE` | `/services[/:id]` | Catálogo de mano de obra |
| `GET` `POST` `PATCH` `DELETE` | `/parts[/:id]` | Repuestos |
| `GET` | `/parts/alerts/low-stock` | Lo que hay que pedir |
| `POST` | `/parts/:id/movements` | Entrada, salida o ajuste por conteo |
| `GET` | `/parts/:id/movements` | Historial de movimientos |
| `GET` `POST` `PATCH` `DELETE` | `/suppliers[/:id]` | Proveedores |
| `GET` `POST` | `/purchases` | Compras (entran al inventario) |
| `GET` `POST` `PATCH` `DELETE` | `/maintenance-rules[/:id]` | Reglas de mantenimiento |

En un movimiento de tipo `adjust`, `quantity` es **el conteo físico real**: el
sistema registra la diferencia contra lo que tenía.

## Adjuntos

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/attachments` | `multipart/form-data`: `files[]`, `entity_type`, `entity_id`, `kind`, `stage` |
| `GET` | `/attachments?entity_type=&entity_id=` | Listado |
| `GET` | `/attachments/:id/file` | Descarga |
| `DELETE` | `/attachments/:id` | Borra registro y archivo. Sólo `admin` y `reception` |

Acepta JPEG, PNG, WebP, HEIC y PDF, hasta `UPLOADS_MAX_BYTES` (8 MB por
defecto). Se guardan en disco, en un directorio por taller.

## Reportes

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/reports/dashboard` | Panel del día |
| `GET` | `/reports/summary?from=&to=` | Ventas, servicios, repuestos, mecánicos e inventario |
| `GET` | `/reports/receivables` | Cartera pendiente |
| `GET` | `/reports/maintenance-due` | Motos que ya deberían volver |

---

# API de integración

Es la vía para conectar el taller con otra plataforma **sin que el producto
dependa de ella**. Va versionada (`/api/integration/v1`) para poder evolucionar
sin romper a quien ya la use.

## Llaves

Las gestiona el administrador del taller desde **Ajustes → Integraciones**, o
por API:

| Método | Ruta |
|---|---|
| `GET` `POST` `DELETE` | `/api-keys[/:id]` |

Al crearla se devuelve el secreto **una sola vez** (`tm_<prefijo>_<secreto>`);
en la base sólo queda su hash. Permisos disponibles: `read` y `write`.

## Uso

```
X-Api-Key: tm_a1b2c3d4e5f6_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| `GET` | `/integration/v1/workshop` | `read` | Datos del taller |
| `GET` | `/integration/v1/orders/:code` | `read` | Estado de una orden |
| `GET` | `/integration/v1/motorcycles/:plate/history` | `read` | Historial por placa |
| `POST` | `/integration/v1/appointments` | `write` | Agendar una cita |

```bash
curl -X POST http://localhost:3000/api/integration/v1/appointments \
  -H "X-Api-Key: $API_KEY" -H 'Content-Type: application/json' \
  -d '{
        "customer_name": "Pedro Pérez",
        "customer_phone": "3009998877",
        "plate": "XYZ45E",
        "brand": "Honda",
        "reason": "Mantenimiento de 10.000 km",
        "scheduled_at": "2026-09-15T14:00:00Z",
        "source": "nombre-de-la-plataforma"
      }'
```

Reconoce al cliente por su teléfono (ignorando espacios y guiones) para no
duplicarlo, crea la moto si la placa es nueva, y la cita aparece en la agenda
del taller como cualquier otra, marcada con su origen.

Una llave sólo alcanza los datos de su taller: con la llave del taller B, una
orden del taller A responde `404`.
