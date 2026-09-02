# Instalar el software en tu propio equipo

Hay dos formas de usar Taller Motos. Elige según tu caso.

---

## Opción 1 — Sin instalar nada (recomendada para probar)

El software atiende **varios talleres a la vez**, y cada uno ve únicamente lo
suyo: sus clientes, sus motos, sus órdenes y su inventario. Nadie ve lo de
nadie.

Así que para probarlo sólo hace falta entrar a la dirección donde ya está
funcionando y **registrar tu taller** desde la propia pantalla. Toma un minuto,
no requiere instalar nada, y funciona igual desde el computador del taller, una
tablet o el celular.

Es la forma de dar pruebas: se comparte el enlace y cada taller crea su cuenta.

---

## Opción 2 — En tu propio servidor, con Docker

Para quien quiera tenerlo en su propia máquina, con sus datos en su casa.

### Lo que necesitas

**Docker.** Es lo único. Trae dentro todo lo demás, incluida la base de datos.

- **Windows y Mac**: [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- **Linux**: [instrucciones oficiales](https://docs.docker.com/engine/install/)

### Instalación

Descarga el proyecto, entra a su carpeta y ejecuta:

**Linux y Mac**

```bash
./instalar.sh
```

**Windows** (PowerShell, dentro de la carpeta del proyecto)

```powershell
copy .env.ejemplo .env
# Abre .env y cambia JWT_SECRET por un texto largo e irrepetible
docker compose up -d --build
```

La primera vez tarda unos minutos: está descargando y construyendo todo. Al
terminar, abre **http://localhost:3000** y crea tu taller.

### Comandos del día a día

| Para... | Comando |
|---|---|
| Ver si está funcionando | `docker compose ps` |
| Detenerlo | `docker compose down` |
| Volver a levantarlo | `docker compose up -d` |
| Ver qué está pasando | `docker compose logs -f app` |
| Actualizar a una versión nueva | `git pull && docker compose up -d --build` |

Los datos **no se pierden** al detener, actualizar ni reconstruir: viven en
volúmenes de Docker aparte de los contenedores.

### Antes de dejarlo en producción

**Cambia `JWT_SECRET`.** Si no lo haces, la aplicación se niega a arrancar: es
la clave con la que se firman las sesiones, y una conocida deja entrar a
cualquiera. `instalar.sh` genera una sola para ti; en Windows tienes que
ponerla a mano.

**Cierra el registro** cuando ya hayas creado tu taller. En `.env`, pon
`ALLOW_SIGNUP=false` y ejecuta `docker compose up -d`. Si no, cualquiera que
llegue a la dirección puede registrar otro taller en tu instalación.

**Si va a estar en internet, ponle HTTPS.** Sin él, las contraseñas y las
sesiones viajan a la vista. Lo más simple es poner delante
[Caddy](https://caddyserver.com/), que consigue el certificado solo.

### Copias de seguridad

Dos cosas hay que respaldar, y las dos hacen falta:

```bash
# La base de datos
docker compose exec -T db pg_dump -U taller taller_motos > respaldo-$(date +%F).sql

# Las fotos de recepción, que no están en la base
docker run --rm -v taller-motos_archivos-taller:/datos -v "$PWD":/copia alpine \
  tar czf /copia/fotos-$(date +%F).tar.gz -C /datos .
```

Para restaurar la base:

```bash
docker compose exec -T db psql -U taller taller_motos < respaldo-2026-08-27.sql
```

> Prueba a restaurar una copia al menos una vez. Una copia que nunca se
> restauró no es una copia.

---

## Opción 3 — En un servidor en la nube

Si prefieres no encargarte de la máquina, el proyecto corre en cualquier
proveedor que soporte Node y PostgreSQL. En
[DEPLOY.md](DEPLOY.md) están las variables de entorno y la configuración del
proxy inverso.

---

## Preguntas frecuentes

**¿Cada taller necesita su propia instalación?**
No. Una sola atiende a muchos, y cada uno ve sólo lo suyo. Instalar por
separado tiene sentido si el taller quiere sus datos en su propia máquina.

**¿Funciona sin internet?**
Instalado en el taller, funciona en su red local aunque se caiga internet. Lo
que deja de funcionar sin conexión es el seguimiento del cliente desde fuera.

**¿Cuántas máquinas puedo conectar?**
Las que quieras. Se instala en una y las demás entran por el navegador a la
dirección de esa máquina, dentro de la misma red.

**¿Puedo cambiarlo de servidor después?**
Sí: sacas una copia de la base, la restauras en el nuevo y listo.
