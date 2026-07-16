import './env-fix.js';
console.log('[startup] Node.js arrancando, PORT=' + (process.env.PORT || 3000));
import express from 'express';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import puppeteer from 'puppeteer';
import { renderRideVideo } from './renderer.js';
import { uploadVideo } from './uploader.js';
import { unlink } from 'fs/promises';

const app  = express();
app.use(express.json({ limit: '10mb' }));

const PORT           = process.env.PORT || 3000;
const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY;
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '3', 10);
const WORKER_ID      = randomUUID().slice(0, 8); // identifica esta instancia Railway

// ── Semáforo: limita renders simultáneos en este proceso ──────────────────
class Semaphore {
  constructor(n) { this._n = n; this._q = []; }
  acquire() {
    if (this._n > 0) { this._n--; return Promise.resolve(); }
    return new Promise(r => this._q.push(r));
  }
  release() {
    if (this._q.length) this._q.shift()();
    else this._n++;
  }
}
const sem = new Semaphore(MAX_CONCURRENT);

// ── Cliente REST de Supabase (sin SDK — solo fetch) ───────────────────────
function sbFetch(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || '',
      ...opts.headers,
    },
  });
}

async function sbInsertJob(rideId, inputData) {
  const res = await sbFetch('/video_jobs', {
    method: 'POST',
    prefer: 'return=representation',
    body: JSON.stringify({ ride_id: rideId, input_data: inputData }),
  });
  if (!res.ok) throw new Error(`sbInsertJob ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows[0];
}

async function sbGetJob(jobId) {
  const res = await sbFetch(`/video_jobs?id=eq.${jobId}&limit=1`);
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function sbUpdateJob(jobId, patch) {
  await sbFetch(`/video_jobs?id=eq.${jobId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

async function sbFindQueued(rideId) {
  const res = await sbFetch(
    `/video_jobs?ride_id=eq.${rideId}&state=in.(queued,rendering)&limit=1`
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

// Reclamar el próximo job de la cola (atómico, safe para múltiples instancias)
async function sbClaimNext() {
  const res = await sbFetch('/rpc/claim_next_video_job', {
    method: 'POST',
    body: JSON.stringify({ p_worker_id: WORKER_ID }),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows || null;
}

// ── Diagnóstico de Chrome ─────────────────────────────────────────────────
let chromeInfo = 'no resuelto';
try {
  const p = puppeteer.executablePath();
  chromeInfo = `${p} (${existsSync(p) ? 'existe' : 'NO EXISTE'})`;
} catch (e) { chromeInfo = `error: ${e.message.split('\n')[0]}`; }

app.get('/', (_req, res) => res.json({
  ok: true,
  service: 'ridera-video-backend',
  version: '2026-07-16-queue',
  workerId: WORKER_ID,
  maxConcurrent: MAX_CONCURRENT,
  chrome: chromeInfo,
  env: {
    MAPBOX_TOKEN:        process.env.MAPBOX_TOKEN        ? 'set' : 'FALTA',
    SUPABASE_URL:        SUPABASE_URL                    ? 'set' : 'FALTA',
    SUPABASE_SERVICE_KEY: SUPABASE_KEY                   ? 'set' : 'FALTA',
  },
}));

app.get('/health', (_req, res) => res.json({ ok: true }));

// ── POST /render ──────────────────────────────────────────────────────────
app.post('/render', async (req, res) => {
  const {
    rideId, rideName, elapsed, distanceKm, maxSpeedKmh,
    routePoints, photos, municipios, rideStartedAt, groupRiders,
  } = req.body || {};

  if (!rideId || !Array.isArray(routePoints) || routePoints.length < 2) {
    return res.status(400).json({ error: 'Se requiere rideId y al menos 2 routePoints' });
  }

  // Dedup: si ya hay un job activo para esta rodada, reutilizarlo
  try {
    const existing = await sbFindQueued(rideId);
    if (existing) {
      console.log(`[${rideId}] dedup → job existente ${existing.id.slice(0,8)} (${existing.state})`);
      return res.status(202).json({ jobId: existing.id });
    }
  } catch (e) {
    console.warn(`[${rideId}] dedup check falló: ${e.message}`);
  }

  const inputData = {
    rideId, rideName: rideName || 'Rodada',
    elapsed: elapsed || '00:00:00',
    distanceKm: String(distanceKm ?? '0'),
    maxSpeedKmh: String(maxSpeedKmh ?? '0'),
    routePoints, photos: photos || [],
    municipios: Array.isArray(municipios) ? municipios : [],
    rideStartedAt: rideStartedAt || null,
    groupRiders: Array.isArray(groupRiders) ? groupRiders : [],
  };

  let job;
  try {
    job = await sbInsertJob(rideId, inputData);
  } catch (e) {
    console.error(`[${rideId}] error creando job en Supabase:`, e.message);
    return res.status(500).json({ error: 'No se pudo encolar el render' });
  }

  console.log(`[${rideId}] job ${job.id.slice(0,8)} encolado`);

  // Disparar el worker sin bloquear la respuesta HTTP
  processJob(job.id, inputData).catch(err =>
    console.error(`[${rideId}] processJob error:`, err.message)
  );

  res.status(202).json({ jobId: job.id });
});

// ── GET /status/:jobId ────────────────────────────────────────────────────
app.get('/status/:jobId', async (req, res) => {
  const job = await sbGetJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job no encontrado' });
  res.json({
    state:    job.state,
    progress: job.progress,
    url:      job.url    || null,
    error:    job.error  || null,
  });
});

// ── GET /jobs — diagnóstico ───────────────────────────────────────────────
app.get('/jobs', async (_req, res) => {
  const r = await sbFetch('/video_jobs?order=created_at.desc&limit=20');
  const rows = r.ok ? await r.json() : [];
  res.json({
    workerId: WORKER_ID,
    maxConcurrent: MAX_CONCURRENT,
    jobs: rows.map(j => ({
      id:       j.id.slice(0,8),
      rideId:   j.ride_id,
      state:    j.state,
      progress: j.progress,
      worker:   j.worker_id,
      age:      Math.round((Date.now() - new Date(j.created_at)) / 1000) + 's',
      error:    j.error ? j.error.slice(0,80) : null,
    })),
  });
});

// ── Worker: procesa un job ────────────────────────────────────────────────
async function processJob(jobId, inputData) {
  await sem.acquire();
  const started = Date.now();
  try {
    await sbUpdateJob(jobId, { state: 'rendering', worker_id: WORKER_ID, started_at: new Date().toISOString() });

    const TIMEOUT = 25 * 60 * 1000;
    const localPath = await Promise.race([
      renderRideVideo({
        ...inputData,
        municipiosFromClient: inputData.municipios,
        onProgress: async (pct) => {
          await sbUpdateJob(jobId, { progress: pct }).catch(() => {});
        },
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Render superó 25 minutos')), TIMEOUT)),
    ]);

    const url = await uploadVideo(inputData.rideId, localPath);
    unlink(localPath).catch(() => {});

    await sbUpdateJob(jobId, {
      state: 'done', progress: 100, url,
      finished_at: new Date().toISOString(),
    });
    console.log(`[${inputData.rideId}] done en ${((Date.now()-started)/1000).toFixed(0)}s → ${url}`);

  } catch (err) {
    const msg = err.message || String(err);
    console.error(`[${inputData.rideId}] error:`, msg.slice(0, 300));
    await sbUpdateJob(jobId, {
      state: 'error',
      error: msg.length > 700 ? '…' + msg.slice(-700) : msg,
      finished_at: new Date().toISOString(),
    }).catch(() => {});
  } finally {
    sem.release();
    // Intentar procesar el siguiente job en cola si hay slots libres
    pickNextJob();
  }
}

// ── Polling de la cola: tomar el próximo job disponible ───────────────────
async function pickNextJob() {
  if (sem._n <= 0) return; // todos los slots ocupados
  try {
    const job = await sbClaimNext();
    if (!job) return;
    console.log(`[queue] reclamando job ${job.id.slice(0,8)} para ride ${job.ride_id}`);
    processJob(job.id, job.input_data).catch(() => {});
  } catch (e) {
    console.warn('[queue] pickNextJob error:', e.message);
  }
}

// Polling periódico: por si un job fue encolado mientras todos los slots estaban llenos
setInterval(pickNextJob, 10_000).unref();

// ── Al arrancar: recuperar jobs interrumpidos ─────────────────────────────
// Si el servidor se cayó con jobs en 'rendering', volverlos a 'queued'
// para que los retome este u otro worker.
async function recoverStaleJobs() {
  try {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // >30min
    const res = await sbFetch(
      `/video_jobs?state=eq.rendering&started_at=lt.${cutoff}`,
      { method: 'PATCH', prefer: 'return=representation', body: JSON.stringify({ state: 'queued', worker_id: null }) }
    );
    if (res.ok) {
      const rows = await res.json();
      if (rows.length) console.log(`[startup] recuperados ${rows.length} jobs interrumpidos`);
    }
  } catch (e) { console.warn('[startup] recoverStaleJobs:', e.message); }
}

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`ridera-video-backend :${PORT} | worker ${WORKER_ID} | max ${MAX_CONCURRENT} renders`);
  await recoverStaleJobs();
  // Procesar jobs que hayan quedado encolados mientras el servidor estaba caído
  for (let i = 0; i < MAX_CONCURRENT; i++) pickNextJob();
});
