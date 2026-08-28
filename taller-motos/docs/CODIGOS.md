# Códigos de activación

Sirven para que el software no se use sin tu permiso: quien lo instale o quiera
registrar un taller necesita un código que sólo tú puedes emitir.

---

## Cómo funciona

Un código es un texto firmado criptográficamente. Lleva dentro a quién se lo
diste y hasta cuándo vale, y **no se puede fabricar sin tu llave privada**.

Hay dos llaves:

| Llave | Dónde vive | Para qué |
|---|---|---|
| **Privada** | Sólo en tu computador | Emitir códigos |
| **Pública** | En el servidor | Comprobar códigos (no puede crearlos) |

Que la pública esté en el servidor no es un riesgo: comprobar una firma y
crearla son operaciones distintas.

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
# Prueba de 30 días
npm run licencia -- --taller "Motos del Sur" --dias 30

# Sin vencimiento
npm run licencia -- --taller "Motos del Sur"
```

Sale un texto que empieza por `TM1.`. Cópialo completo y pásaselo por WhatsApp
a quien va a usar el software. Lo pega en la pantalla de registro y listo.

Cada código **sirve una sola vez**: activa un taller y ya no vuelve a servir,
ni siquiera en otra instalación de la misma base de datos.

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
