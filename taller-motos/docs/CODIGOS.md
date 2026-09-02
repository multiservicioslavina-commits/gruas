# Códigos de activación

Sirven para que el software no se use sin tu permiso: quien lo instale o quiera
registrar un taller necesita un código que sólo tú puedes emitir. También
determinan el **plan** del taller: qué módulos ve (ver más abajo).

---

## Cómo funciona

El código en sí es corto y al azar —tipo `TM-C4X9-K3M7`—, para poder dictarlo
por teléfono o pasarlo por WhatsApp sin copiar y pegar. No lleva nada
codificado adentro: el servidor guarda en una tabla a qué taller, plan y
plazo corresponde cada uno.

Para que **emitirlo** siga sin necesitar tu llave privada en el servidor
(ese es el punto: que nadie con acceso al servidor pueda fabricar códigos),
el script de emisión no genera el código él solo. En cambio:

1. Firma una **solicitud** ("quiero un código para tal taller, tal plan,
   tantos días") con tu llave privada — eso pasa en tu computador.
2. Se la manda al servidor.
3. El servidor comprueba la firma con la llave pública que ya tiene
   configurada, y sólo si es válida, genera el código y lo guarda.

Hay dos llaves, igual que antes:

| Llave | Dónde vive | Para qué |
|---|---|---|
| **Privada** | Sólo en tu computador | Firmar solicitudes de emisión |
| **Pública** | En el servidor | Comprobar la firma (no puede crear códigos) |

Por eso emitir un código **necesita internet**: el paso 2 de arriba habla con
tu servidor. A cambio, el código que le das al taller es corto de verdad.

---

## Preparación (una sola vez)

```bash
npm run licencia:claves
```

Crea `licencia-privada.pem` en tu carpeta y te muestra la llave pública.

> **Guarda bien ese archivo.** Quien lo tenga puede emitir códigos válidos. Y
> si lo pierdes, no podrás emitir más: tendrías que generar llaves nuevas, y
> todos los códigos ya entregados dejarían de servir.
>
> Está en `.gitignore`, así que no se sube a GitHub por accidente. Haz una
> copia en un lugar seguro.

Después, en el servidor, configura dos variables:

```
LICENSE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
LICENSE_REQUIRED=true
```

En Railway: proyecto → servicio `app` → pestaña **Variables**.

---

## Emitir un código

```bash
# Plan completo, 30 días de prueba
npm run licencia -- --taller "Motos del Sur" --dias 30

# Plan básico, sin vencimiento
npm run licencia -- --taller "Motos del Sur" --plan basico

# Si el servidor no es el de siempre (local, otro ambiente)
npm run licencia -- --taller "Motos del Sur" --url https://taller.ridera.com.co
```

Por defecto habla con `http://localhost:3000`; en producción usa `--url` o
la variable `LICENSE_API_URL`.

Sale un código corto tipo `TM-C4X9-K3M7`. Mándaselo por WhatsApp o díctaselo
por teléfono a quien va a usar el software. Lo escribe en la pantalla de
registro y listo.

Cada código **sirve una sola vez**: activa un taller y ya no vuelve a servir,
ni siquiera en otra instalación de la misma base de datos.

---

## Planes

El código determina el plan con el que arranca el taller (`--plan`):

| Plan | Incluye |
|---|---|
| **basico** | Órdenes, recepción digital, clientes y motos, agenda, cotizaciones y aprobación del cliente, y factura de venta normal (sin la DIAN) |
| **completo** *(por defecto)* | Todo lo anterior + inventario (repuestos, proveedores, compras), reportes de periodo, notificaciones por WhatsApp e integraciones (API) |
| **premium** | Todo lo anterior + contabilidad básica, CRM y facturación electrónica DIAN vía Factus (ver [docs/FACTURACION.md](FACTURACION.md)) |

Un taller sin código (instalaciones que no exigen `LICENSE_REQUIRED`) o
activado antes de que existiera esta distinción queda con acceso completo:
nunca se le cierra una función a quien nunca compró un plan.

Para agregarle un módulo nuevo a esta lista: envuélvelo con
`requirePlan('completo')` (o `'premium'`) desde `src/middleware/auth.js`,
igual que están hoy `parts`/`suppliers`/`purchases`, `reports.summary` y
`api-keys` (plan Completo) o `accounting`/`crm` y la factura electrónica
DIAN (plan Premium) en `src/app.js` y sus respectivos archivos de rutas —
`requirePlan` va por ruta, no por router,
como en `src/routes/invoices.routes.js`.

---

## Qué pasa cuando vence

El taller **no pierde su información**. Puede seguir entrando, consultar sus
órdenes, su historial y sus reportes. Lo que no puede es **registrar trabajo
nuevo**: crear órdenes, clientes o movimientos.

Diez días antes le aparece un aviso; cuando vence, un mensaje claro pidiéndole
que renueve. Para renovarle, emite un código nuevo.

---

## Qué protege esto y qué no

Conviene tenerlo claro para no confiarse.

**Lo que sí evita:**

- Que alguien que reciba el software lo instale y lo use sin tu permiso.
- Que un código circule y sirva para varios talleres: cada uno sirve una vez.
- Que alguien fabrique códigos: sin tu llave privada, no puede.
- Que una prueba se quede usándose para siempre.

**Lo que no evita:**

Si entregas el **código fuente**, quien lo reciba y sepa programar puede quitar
la comprobación: tiene el programa entero en las manos. Ningún candado
resiste eso, en ningún software del mundo.

Por eso, si te importa el control:

1. **La forma más segura es no entregar el software.** Que el taller entre a
   tu instalación en internet con su código. Tú tienes el control, ves quién
   lo usa, y el día que quieras cobrar ya está todo montado.
2. Si alguien necesita tenerlo en su máquina, entrégale la **imagen de
   Docker**, no el código fuente.
3. Entregar el código fuente sólo a quien de verdad se lo quieras dar.

Para lo que estás haciendo —regalarlo a talleres conocidos a través de
Ridera— la opción 1 es la que te conviene: cero instalación para ellos, control
total para ti.
