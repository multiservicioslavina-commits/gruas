# Taller Motos

Software de gestión para talleres de motocicletas: clientes, motos, agenda,
recepción digital, órdenes de trabajo, diagnóstico, cotizaciones con aprobación
del cliente, inventario de repuestos, pagos, historial y reportes.

Es un **producto independiente**. No depende de ninguna plataforma externa: su
propia base de datos, su propia API y su propio frontend. Trae desde el primer
día una API de integración versionada para conectarlo con otros sistemas
cuando se decida, sin tener que rehacer nada.

---

## Qué necesitas

| Requisito   | Versión              |
|-------------|----------------------|
| Node.js     | 20 o superior        |
| PostgreSQL  | 14 o superior        |

No hay paso de compilación: el frontend es JavaScript nativo servido por el
mismo backend.

## Puesta en marcha

```bash
# 1. Dependencias
npm install

# 2. Configuración
cp .env.example .env
#    Edita DATABASE_URL y genera un JWT_SECRET propio:
#    node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 3. Base de datos (crea o actualiza las tablas; se puede repetir sin riesgo)
npm run db:setup

# 4. Arranca
npm start
```

Abre `http://localhost:3000` y registra tu taller desde la propia pantalla.

### Datos de demostración

Para probarlo sin capturar nada a mano:

```bash
npm run db:seed
```

Crea un taller con cinco usuarios (uno por rol), catálogo de servicios,
inventario, clientes con sus motos y dos órdenes abiertas. Entra con
`admin@tallerdemo.test` / `demo12345`. **No lo uses en producción.**

### Pruebas

```bash
DATABASE_URL=postgres://…/taller_test npm test
```

58 pruebas funcionales contra un PostgreSQL real: flujo completo de la orden,
cálculo de totales e impuestos, movimiento de inventario, aprobación del
cliente, permisos por rol y aislamiento entre talleres. Usa una base
**distinta** a la de producción: las pruebas escriben en ella.

---

## Cómo está organizado

```
db/schema.sql        Esquema completo (idempotente)
src/
  config.js          Configuración por variables de entorno
  db.js              Pool de PostgreSQL, transacciones y consecutivos
  app.js             Ensamblado de Express y manejo de errores
  lib/               Validación, dinero, identificadores, autenticación, CRUD
  middleware/        Autenticación por token y por llave de API
  routes/            Un archivo por área de la API
  services/          Reglas de negocio de la orden de trabajo
public/              Frontend (una sola página, sin compilación)
scripts/             Preparación de la base y datos de demostración
test/                Pruebas funcionales
docs/                Documentación técnica y manual de uso
```

La lógica que decide (totales, estados, inventario) vive en
`src/services/workorders.js`, no repartida por las rutas. Las rutas validan la
entrada, abren la transacción y llaman a esas funciones.

## Documentación

| Documento | Contenido |
|---|---|
| [docs/API.md](docs/API.md) | Referencia de la API REST y de la API de integración |
| [docs/DATABASE.md](docs/DATABASE.md) | Modelo de datos, tabla por tabla, y decisiones de diseño |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Despliegue, copias de seguridad y actualización |
| [docs/MANUAL.md](docs/MANUAL.md) | Manual de uso para el taller |

## Roles

| Rol | Qué puede hacer |
|---|---|
| `admin` | Todo, más configuración, usuarios y llaves de API |
| `reception` | Clientes, motos, citas, recepción, órdenes y pagos |
| `mechanic` | Diagnóstico y trabajos de sus órdenes |
| `warehouse` | Inventario, movimientos y compras |
| `cashier` | Pagos y anulación de pagos |

El **cliente del taller no tiene cuenta**: consulta el estado de su moto con el
código de la orden y aprueba las cotizaciones por un enlace firmado. Es menos
fricción para él y una superficie de ataque menos para el sistema.

## Seguridad

- Contraseñas con bcrypt; el hash nunca sale en ninguna respuesta.
- Sesión por JWT, revalidada contra la base en cada petición: desactivar un
  usuario o cambiarle el rol surte efecto de inmediato.
- **Aislamiento entre talleres**: toda consulta filtra por el taller del token.
  Hay siete pruebas dedicadas sólo a comprobarlo.
- Las llaves de API se guardan como hash: el secreto se muestra una sola vez.
- La decisión del cliente sobre una cotización queda registrada con fecha, IP y
  navegador, y no se puede responder dos veces.

## Licencia

Propiedad del cliente. Todos los derechos reservados.
