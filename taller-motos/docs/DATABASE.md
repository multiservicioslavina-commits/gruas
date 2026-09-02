# Modelo de datos

PostgreSQL 14 o superior. El esquema completo está en
[`db/schema.sql`](../db/schema.sql) y es **idempotente**: se puede aplicar las
veces que haga falta (`npm run db:setup`).

## Convenciones

- **Identificadores**: `UUID` con `gen_random_uuid()`. Nunca enteros
  correlativos: no filtran cuántos clientes u órdenes tiene el taller.
- **Nombres**: tablas y columnas en inglés, en plural. El producto se pensó
  para poder venderse fuera; la interfaz y los mensajes van en español.
- **Dinero**: `NUMERIC(12,2)`. Nunca coma flotante.
- **Fechas**: `TIMESTAMPTZ`, siempre en UTC. La zona horaria del taller
  (`workshops.timezone`) sólo se usa al mostrar.
- **Borrado**: `ON DELETE CASCADE` de un taller hacia abajo;
  `ON DELETE SET NULL` en las referencias que no deben perder la fila
  (borrar un cliente no borra su historial de órdenes).

## Multi-taller

Cada tabla operativa lleva `workshop_id`. La API filtra **siempre** por el
taller del token, en un solo punto ([`src/lib/crud.js`](../src/lib/crud.js) y
las consultas explícitas de cada ruta), y `test/isolation.test.js` lo comprueba
para clientes, órdenes, inventario, consecutivos, panel y llaves de API.

Los consecutivos visibles (orden, cotización, factura) no son globales: viven
en `sequences` por taller, y se toman con un `INSERT … ON CONFLICT DO UPDATE
RETURNING`, que es atómico. Cada taller empieza en el número 1.

---

## Tablas

### Taller y acceso

| Tabla | Para qué |
|---|---|
| `workshops` | Datos de la empresa, moneda, IVA por defecto, zona horaria y `settings` libre en JSONB |
| `sequences` | Consecutivos por taller |
| `users` | Equipo. Rol en `admin`, `reception`, `mechanic`, `warehouse`, `cashier` |
| `api_keys` | Llaves de integración: `prefix` visible, `key_hash` del secreto, `scopes` |

El correo es único **en toda la instalación** (`users_email_key` sobre
`lower(email)`), no por taller: es la credencial de acceso y debe identificar a
una sola persona.

> **Sobre `mechanics`**: la especificación la listaba como tabla propia. Aquí un
> mecánico es un `user` con `role='mechanic'` y dos columnas suyas (`specialty`,
> `hourly_rate`). Una tabla aparte obligaría a mantener dos filas por persona y
> a un join en cada consulta, sin aportar nada: todo mecánico necesita cuenta
> para registrar su trabajo.

### Clientes y motos

| Tabla | Notas |
|---|---|
| `customers` | Índices por teléfono y por nombre en minúsculas, que es como se busca |
| `motorcycles` | Placa única por taller sobre `upper(replace(plate,' ',''))`: `ABC 12D` y `abc12d` son la misma moto |

### Operación

| Tabla | Notas |
|---|---|
| `appointments` | Agenda |
| `work_orders` | El centro del sistema (ver abajo) |
| `work_order_status_history` | Cada cambio de estado, con autor y fecha |
| `diagnostics` | Varios por orden: hallazgos, pruebas y recomendaciones |
| `work_order_services` | Mano de obra cargada |
| `work_order_parts` | Repuestos cargados; `stock_applied` dice si ya movió inventario |
| `services` | Catálogo de trabajos con precio |

`work_orders` guarda la recepción digital completa (`mileage_in`, `fuel_level`,
`accessories` en JSONB, `existing_damage`, `customer_signature`) y los totales
ya calculados. Tiene dos identificadores: `number`, el consecutivo que ve el
taller, y `public_code`, seis caracteres de un alfabeto sin `0/O` ni `1/I/L`,
pensado para dictarse por teléfono.

### Cotización y aprobación

| Tabla | Notas |
|---|---|
| `quotes` | `public_token` para el enlace del cliente; `valid_until` la vence |
| `quote_items` | `optional` marca lo que el cliente puede rechazar suelto; `approved` es `NULL` hasta que responde |
| `approvals` | Registro **inmutable** de la decisión: qué aprobó, cuándo, desde qué IP y navegador |

`quote_items` apunta a la línea real de la orden (`work_order_service_id` /
`work_order_part_id`). Sin ese vínculo, aprobar una cotización no podría
autorizar el trabajo concreto ni disparar la salida de bodega.

### Dinero

| Tabla | Notas |
|---|---|
| `payments` | Abonos; `amount > 0` por restricción |
| `invoices` | Preparada para facturación electrónica: `external_id` y `payload` guardan lo que devuelva el proveedor cuando se integre |

### Inventario

| Tabla | Notas |
|---|---|
| `parts` | SKU único por taller cuando no está vacío |
| `inventory_movements` | `type` en `in`/`out`/`adjust`; `quantity` siempre positiva y `balance_after` deja la existencia del momento |
| `suppliers`, `purchases`, `purchase_items` | Compras que entran al inventario y actualizan el costo |

Guardar `balance_after` permite auditar el inventario sin reconstruirlo sumando
todo el histórico.

### Soporte

| Tabla | Notas |
|---|---|
| `attachments` | Fotos y documentos; `entity_type` + `entity_id` los asocian a órdenes, motos, clientes, diagnósticos o cotizaciones |
| `notifications` | Cola de avisos al cliente, lista para conectar WhatsApp o correo |
| `maintenance_rules` | Intervalos por kilómetros o días, por marca y línea |

### Vista `service_history`

El historial de cada moto **no es una tabla**: es una vista derivada de las
órdenes que reúne diagnóstico, repuestos instalados, trabajos, valores y
próximo servicio. Duplicar esos datos en una tabla obligaría a mantenerlos
sincronizados y abriría la puerta a que el historial y la orden dijeran cosas
distintas.

---

## Dónde viven las reglas

Los totales, las transiciones de estado y el movimiento de inventario se
calculan en la capa de servicio
([`src/services/workorders.js`](../src/services/workorders.js)), dentro de una
transacción, no en disparadores de base de datos.

La razón: la API es el único escritor. Tenerlas en JavaScript las deja
depurables, cubiertas por pruebas y visibles para quien lea el código, en vez
de escondidas en `plpgsql`. Si algún día escribe otro proceso directamente
contra la base, habría que subirlas a disparadores.

Lo que sí protege la base:

- `CHECK` en cada campo de estado o tipo, para que no entre un valor inventado.
- Índices únicos para placas, SKU, consecutivos, códigos públicos y correos.
- Llaves foráneas con el `ON DELETE` correcto en cada relación.
- `payments.amount > 0`.

## Copias de seguridad

Ver [DEPLOY.md](DEPLOY.md). En resumen: `pg_dump` diario y los archivos de
`UPLOADS_DIR`, que no están en la base.
