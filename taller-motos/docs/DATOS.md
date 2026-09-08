# Dónde están los datos y cómo se los lleva el taller

Una pregunta legítima de cualquier taller antes de meter ahí la historia de su
negocio: *¿esto de quién es y qué pasa si un día me voy?*

---

## Dónde vive la información

Depende de cómo se use el software.

**Si el taller entra a una instalación compartida** (la forma habitual: tú
alojas y le das acceso), sus datos viven en tu base de datos PostgreSQL, en las
mismas tablas que las de los demás talleres, pero **separados por taller**.
Toda consulta del sistema filtra por el taller de quien pregunta: no hay una
sola forma de leer, escribir ni exportar lo de otro. Siete pruebas
automatizadas comprueban exactamente eso en cada cambio.

**Si el taller instala el software en su propia máquina**, los datos son suyos
y sólo suyos: viven en su servidor y nadie más los ve, ni tú.

---

## Cómo se los lleva

En **Ajustes → Tus datos**, el administrador del taller descarga su información
cuando quiera. Sin pedir permiso, sin avisar y sin trámite.

| Formato | Qué trae |
|---|---|
| **JSON** | Absolutamente todo: taller, usuarios, clientes, motos, citas, órdenes con sus repuestos, diagnósticos, pagos e historial, cotizaciones con las respuestas del cliente, inventario, movimientos, proveedores, compras y facturas |
| **CSV** | Clientes, motos, órdenes, inventario y pagos, cada uno en su archivo, listos para abrir en Excel |

Lo que **no** sale en la exportación: las contraseñas (ni siquiera cifradas) y
el código de activación. Lo primero por seguridad, lo segundo porque no es
información del taller.

El archivo JSON está pensado para que otro sistema pueda leerlo: no es un
volcado interno de la base, sino una estructura ordenada y estable.

**Esto funciona aunque la licencia esté vencida.** Es deliberado: la
información es del taller, y retenerla para presionar un pago sería otra cosa.

---

## Qué protege esa información

**Entre talleres.** El aislamiento no depende de que la interfaz esconda
botones: está en cada consulta al servidor, y hay pruebas dedicadas sólo a
intentar romperlo —leer, modificar y borrar datos ajenos, cargar un repuesto de
otro taller, ver su panel—. Todas deben fallar, y fallan.

**Las contraseñas** se guardan cifradas con bcrypt y nunca salen en ninguna
respuesta del sistema, ni siquiera para el administrador.

**Las sesiones** caducan a las 12 horas, y desactivar a un empleado le corta el
acceso de inmediato, sin esperar a que caduque nada.

**Los clientes finales** (los dueños de las motos) no tienen cuenta: consultan
con un código que sólo sirve para su orden, y lo que ven no incluye costos
internos, notas del taller ni datos de otros clientes.

---

## Copias de seguridad: quién responde por qué

Aquí conviene ser explícito, porque es donde se pierden los negocios.

**Si el taller usa tu instalación**, las copias son responsabilidad de quien la
aloja: tú. La exportación que puede bajar el taller sirve para llevarse la
información, pero **no es una copia de seguridad**: si tu base se pierde, lo
último exportado es lo único que queda.

**Si el taller instala el software**, las copias son suyas. En
[INSTALAR.md](INSTALAR.md) están los comandos.

En cualquiera de los dos casos, respaldar significa dos cosas:

1. **La base de datos** — todo el trabajo registrado.
2. **La carpeta de archivos subidos** — las fotos de recepción, que no están en
   la base.

Una copia que nunca se restauró no es una copia: pruébala al menos una vez.

### Lo que ya está montado

El proyecto incluye un servicio de copias (`respaldo/`) que corre solo cada
día: saca el volcado de la base, comprueba que se pueda abrir y que tenga
dentro lo que debe, borra las de más de catorce días y se apaga.

Si una copia sale corrupta, la borra y falla con ruido en el registro, en vez
de dejar un archivo inservible que parezca una copia.

Detalles y cómo restaurar, en [`respaldo/README.md`](../respaldo/README.md).

---

## Si el taller se va

Baja su JSON y sus CSV, y ya tiene todo. Si quiere seguir por su cuenta, puede
instalar el software en su máquina; el formato de exportación es el mismo
proyecto, así que su información no queda atrapada en ningún lado.

Del lado de la instalación, borrar el taller elimina en cascada todo lo suyo
—clientes, motos, órdenes, inventario— sin tocar lo de nadie más.
