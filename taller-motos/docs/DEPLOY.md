# Despliegue

## Requisitos

- Node.js 20 o superior
- PostgreSQL 14 o superior
- Un proxy inverso con HTTPS (nginx, Caddy o el que ofrezca tu proveedor)

## Variables de entorno

Copia `.env.example` a `.env` y ajusta:

| Variable | Obligatoria | Para qué |
|---|---|---|
| `DATABASE_URL` | sí | Conexión a PostgreSQL |
| `JWT_SECRET` | **sí en producción** | Firma de los tokens. El arranque falla si queda el valor de ejemplo |
| `PORT` | no | Puerto (3000) |
| `NODE_ENV` | no | `production` oculta el detalle de los errores internos |
| `PUBLIC_URL` | sí | URL pública; con ella se arman los enlaces que recibe el cliente |
| `JWT_EXPIRES_IN` | no | Duración de la sesión (`12h`) |
| `BCRYPT_ROUNDS` | no | Coste del hash (10) |
| `ALLOW_SIGNUP` | no | `false` cierra el registro público de talleres nuevos |
| `UPLOADS_DIR` | no | Dónde se guardan las fotos (`uploads`) |
| `UPLOADS_MAX_BYTES` | no | Tamaño máximo por archivo (8 MB) |
| `CORS_ORIGINS` | no | Sólo si el frontend se sirve desde otro dominio |

Genera el secreto así:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Puesta en producción

```bash
npm ci --omit=dev
npm run db:setup
NODE_ENV=production npm start
```

Si es una instalación para un solo taller, crea el taller una vez y luego pon
`ALLOW_SIGNUP=false` para que nadie más registre otro.

### Como servicio del sistema

```ini
# /etc/systemd/system/taller-motos.service
[Unit]
Description=Taller Motos
After=network.target postgresql.service

[Service]
Type=simple
User=taller
WorkingDirectory=/opt/taller-motos
EnvironmentFile=/opt/taller-motos/.env
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now taller-motos
```

El proceso atiende `SIGINT` y `SIGTERM`: deja terminar las peticiones en curso
y cierra la base antes de salir, así que reiniciar no corta ninguna operación a
medias.

### Proxy inverso

```nginx
server {
    server_name taller.ejemplo.com;

    client_max_body_size 10M;   # las fotos de recepción

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`X-Forwarded-For` importa: es la IP que queda registrada cuando un cliente
aprueba una cotización.

**Sirve siempre por HTTPS.** Los tokens y los enlaces de aprobación viajan en
cada petición.

## Copias de seguridad

Dos cosas que respaldar, y las dos hacen falta:

```bash
# 1. Base de datos
pg_dump "$DATABASE_URL" --format=custom --file=/backups/taller-$(date +%F).dump

# 2. Archivos subidos (no están en la base)
tar czf /backups/uploads-$(date +%F).tar.gz -C /opt/taller-motos uploads
```

En cron, todos los días de madrugada:

```cron
0 3 * * * pg_dump "$DATABASE_URL" -Fc -f /backups/taller-$(date +\%F).dump
5 3 * * * tar czf /backups/uploads-$(date +\%F).tar.gz -C /opt/taller-motos uploads
0 4 * * * find /backups -name '*.dump' -mtime +30 -delete
```

Restaurar:

```bash
pg_restore --clean --if-exists -d "$DATABASE_URL" /backups/taller-2026-08-27.dump
```

> Prueba la restauración en una base vacía al menos una vez. Una copia que
> nunca se restauró no es una copia.

## Actualización

```bash
git pull
npm ci --omit=dev
npm run db:setup          # el esquema es idempotente
sudo systemctl restart taller-motos
```

Haz la copia **antes** de actualizar.

## Comprobación

```bash
curl https://taller.ejemplo.com/api/health
# {"ok":true,"service":"taller-motos", …}
```

Sirve para el monitor de disponibilidad: no toca la base ni exige token.

## Pruebas antes de publicar

```bash
DATABASE_URL=postgres://…/taller_test npm test
```

Contra una base **distinta** de la de producción: las pruebas escriben en ella.
