import './env-fix.js';
import express from 'express';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import puppeteer from 'puppeteer';
import { renderRideVideo } from './renderer.js';
import { uploadVideo } from './uploader.js';
import { unlink } from 'fs/promises';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;

// Autodiagnóstico: qué Chrome resuelve Puppeteer y si el binario existe
let chromeInfo = 'no resuelto';
try {
  const p = puppeteer.executablePath();
  chromeInfo = `${p} (${existsSync(p) ? 'existe' : 'NO EXISTE'})`;
} catch (e) {
  chromeInfo = `error: ${e.message.split('\n')[0]}`;
}

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'ridera-video-backend',
    version: '2026-07-07-cinematic1',
    chrome: chromeInfo,
    env: {
      MAPBOX_TOKEN: process.env.MAPBOX_TOKEN ? 'set' : 'FALTA',
      SUPABASE_URL: process.env.SUPABASE_URL ? 'set' : 'FALTA',
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? 'set' : 'FALTA',
    },
  });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Trabajos asíncronos ─────────────────────────────────────────────────
// El render frame a frame tarda más que cualquier timeout HTTP razonable,
// así que POST /render responde de inmediato con un jobId y la app
// consulta GET /status/:jobId hasta que esté listo.
const jobs = new Map(); // jobId -> { state, url, error, progress, createdAt }

// Limpieza de trabajos viejos (>2h)
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 10 * 60 * 1000).unref();

// Cola FIFO — un solo Chromium a la vez
let renderChain = Promise.resolve();
function enqueue(fn) {
  renderChain = renderChain.then(fn, fn);
  return renderChain;
}

app.post('/render', (req, res) => {
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

  // Dedup: si la misma rodada ya tiene un render en cola o en curso
  // (ej. "Reintentar" repetido), devolver ese jobId en vez de duplicar
  // 30 minutos de trabajo del servidor.
  for (const [id, job] of jobs) {
    if (job.rideId === rideId && (job.state === 'queued' || job.state === 'rendering')) {
      console.log(`[${rideId}] dedup: reutilizando job ${id} (${job.state})`);
      return res.status(202).json({ jobId: id });
    }
  }

  const jobId = randomUUID();
  jobs.set(jobId, { state: 'queued', progress: 0, createdAt: Date.now(), rideId });
  console.log(`[${rideId}] job ${jobId} encolado — ${routePoints.length} puntos, ${(photos || []).length} fotos`);

  enqueue(async () => {
    const job = jobs.get(jobId);
    if (!job) return;
    job.state = 'rendering';
    const started = Date.now();
    try {
      const localPath = await renderRideVideo({
        rideId,
        rideName: rideName || 'Rodada',
        elapsed: elapsed || '00:00:00',
        distanceKm: String(distanceKm ?? '0'),
        maxSpeedKmh: String(maxSpeedKmh ?? '0'),
        routePoints,
        photos: photos || [],
        onProgress: (pct) => { job.progress = pct; },
      });
      console.log(`[${rideId}] video local: ${localPath}`);
      const url = await uploadVideo(rideId, localPath);
      console.log(`[${rideId}] subido: ${url} (total ${((Date.now() - started) / 1000).toFixed(0)}s)`);
      unlink(localPath).catch(() => {});
      job.state = 'done';
      job.progress = 100;
      job.url = url;
    } catch (err) {
      console.error(`[${rideId}] render error:`, err);
      const msg = err.message || String(err);
      job.state = 'error';
      job.error = msg.length > 700 ? '…' + msg.slice(-700) : msg;
    }
  });

  // 202 Accepted: el trabajo quedó encolado
  res.status(202).json({ jobId });
});

app.get('/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job no encontrado' });
  res.json({
    state: job.state,
    progress: job.progress,
    url: job.url || null,
    error: job.error || null,
  });
});

app.listen(PORT, () => {
  console.log(`ridera-video-backend listening on :${PORT}`);
});
