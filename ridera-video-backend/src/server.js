import express from 'express';
import { renderRideVideo } from './renderer.js';
import { uploadVideo } from './uploader.js';
import { unlink } from 'fs/promises';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'ridera-video-backend',
    env: {
      MAPBOX_TOKEN: process.env.MAPBOX_TOKEN ? 'set' : 'MISSING',
      SUPABASE_URL: process.env.SUPABASE_URL ? 'set' : 'MISSING',
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? 'set' : 'MISSING',
    },
  });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// Cola FIFO — Railway no aguanta 2 Chromiums a la vez, así que serializamos.
let renderChain = Promise.resolve();
function serialize(fn) {
  const next = renderChain.then(fn, fn);
  renderChain = next.catch(() => {});
  return next;
}

app.post('/render', async (req, res) => {
  const started = Date.now();
  const queuedAt = Date.now();
  try {
    await serialize(async () => {
      const waited = Date.now() - queuedAt;
      if (waited > 500) console.log(`[queue] esperó ${(waited/1000).toFixed(1)}s`);
      return handleRender(req, res, started);
    });
  } catch (err) {
    if (!res.headersSent) {
      console.error('Render error:', err);
      res.status(500).json({ error: err.message || String(err) });
    }
  }
});

async function handleRender(req, res, started) {
  try {
    const {
      rideId,
      rideName,
      elapsed,
      distanceKm,
      maxSpeedKmh,
      routePoints,
      photos,
    } = req.body || {};

    if (!rideId || !Array.isArray(routePoints) || routePoints.length < 2) {
      return res.status(400).json({
        error: 'Se requiere rideId y al menos 2 routePoints',
      });
    }

    console.log(`[${rideId}] iniciando render — ${routePoints.length} puntos, ${(photos||[]).length} fotos`);
    const localPath = await renderRideVideo({
      rideId,
      rideName: rideName || 'Rodada',
      elapsed: elapsed || '00:00:00',
      distanceKm: String(distanceKm ?? '0'),
      maxSpeedKmh: String(maxSpeedKmh ?? '0'),
      routePoints,
      photos: photos || [],
    });
    console.log(`[${rideId}] video local: ${localPath}`);

    const url = await uploadVideo(rideId, localPath);
    console.log(`[${rideId}] subido: ${url} (total ${Date.now() - started}ms)`);

    unlink(localPath).catch(() => {});

    res.json({ url });
  } catch (err) {
    console.error('Render error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || String(err) });
    }
  }
}

app.listen(PORT, () => {
  console.log(`ridera-video-backend listening on :${PORT}`);
});
