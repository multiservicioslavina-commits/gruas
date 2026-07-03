# RIDERA video backend

Genera videos estilo Relive con Mapbox GL 3D + Puppeteer, sube a Supabase Storage y devuelve la URL pública.

## Endpoint

```
POST /render
Content-Type: application/json

{
  "rideId": "K7P2M",
  "rideName": "Rodada Oriente",
  "elapsed": "01:23:45",
  "distanceKm": "58.4",
  "maxSpeedKmh": "113",
  "routePoints": [{"lat": 6.25, "lon": -75.57}, ...],
  "photos": [{"url": "https://...", "lat": 6.25, "lon": -75.57}]
}
```

Respuesta:

```
{"url": "https://<supabase>/storage/v1/object/public/ride-videos/K7P2M/....mp4"}
```

## Variables de entorno

| Variable | Descripción |
|---|---|
| `MAPBOX_TOKEN` | Token público de Mapbox (pk.*) |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | Service role key (no la anon) |
| `PORT` | Puerto HTTP (default 3000) |

## Deploy en Railway

1. Ir a https://railway.app y conectar el repo `multiservicioslavina-commits/gruas`.
2. Root directory: `ridera-video-backend`.
3. En variables agregar `MAPBOX_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.
4. Generate Domain → copiar URL pública.
5. Pegar esa URL en `ridera-ride-live/lib/video_config.dart` como `kVideoBackendUrl`.

## Local

```bash
cp .env.example .env
# editar .env con las claves
npm install
npm start
```

Prueba:
```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d @sample-request.json
```
