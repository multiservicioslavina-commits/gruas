import express from 'express';
import { renderRideVideo } from './renderer.js';
import { uploadVideo } from './uploader.js';
import { unlink } from 'fs/promises';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'ridera-video-backend', version: '2026-07-06-cft127' });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/render', async (req, res) => {
  const started = Date.now();
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
    // La línea fatal de Chromium está al FINAL del mensaje — devolver
    // la cola, no el inicio (el inicio es ruido de dbus)
    const msg = err.message || String(err);
    const tail = msg.length > 700 ? '…' + msg.slice(-700) : msg;
    res.status(500).json({ error: tail });
  }
});

app.listen(PORT, () => {
  console.log(`ridera-video-backend listening on :${PORT}`);
});
