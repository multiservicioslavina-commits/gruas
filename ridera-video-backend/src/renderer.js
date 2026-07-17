import './env-fix.js';
import puppeteer from 'puppeteer';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFile, mkdir, rm } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;
if (!MAPBOX_TOKEN) {
  console.warn('WARNING: MAPBOX_TOKEN no configurado');
}


const FPS    = 24;
const WIDTH  = 1080;
const HEIGHT = 1080;
const MAX_DURATION_SEC = 60;

// Pista musical opcional: si existe assets/music.mp3 (o MUSIC_PATH),
// se mezcla con fade-out al final — el video mudo no emociona a nadie.
import { existsSync } from 'fs';
const MUSIC_PATH = process.env.MUSIC_PATH || join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'music.mp3');

function ffmpegEncode(framesDir, outputPath, durationSec) {
  const hasMusic = existsSync(MUSIC_PATH);
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-framerate', String(FPS),
      '-i', join(framesDir, 'frame_%06d.jpg'),
      ...(hasMusic ? ['-stream_loop', '-1', '-i', MUSIC_PATH] : []),
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-vf', `scale=${WIDTH}:${HEIGHT}`,
      ...(hasMusic
        ? [
            '-c:a', 'aac', '-b:a', '128k',
            '-af', `afade=t=out:st=${Math.max(0, durationSec - 2.5)}:d=2.5`,
            '-shortest',
          ]
        : []),
      '-movflags', '+faststart',
      outputPath,
    ];
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    ff.stderr.on('data', d => { stderr += d.toString(); });
    ff.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

/**
 * Renderiza un video de resumen de ruta con relieve 3D.
 * Estrategia: seekTo(t) frame a frame → screenshot PNG → FFmpeg → MP4 1080p.
 */
export async function renderRideVideo({
  rideId,
  rideName,
  elapsed,
  distanceKm,
  maxSpeedKmh,
  routePoints,
  photos,
  municipiosFromClient,
  rideStartedAt,
  groupRiders,
  onProgress,
}) {
  const T = (label, from) =>
    console.log(`  [${rideId}] ${label}: ${((Date.now() - from) / 1000).toFixed(1)}s`);

  // Municipios para sellos pasaporte: usar los que envió Flutter (ya filtrados
  // por la app al cargar la pantalla de resumen). Solo hacer el fetch de Supabase
  // si el cliente no mandó ninguno (versión antigua de la app, por ejemplo).
  let municipios = [];
  if (Array.isArray(municipiosFromClient) && municipiosFromClient.length > 0) {
    municipios = municipiosFromClient;
    console.log(`  [${rideId}] municipios del cliente: ${municipios.length}`);
  } else {
    try {
      const lats = routePoints.map(p => p.lat);
      const lons = routePoints.map(p => p.lon);
      const m = 0.05; // margen ~5km
      const url = `${process.env.SUPABASE_URL}/rest/v1/municipios` +
        `?select=nombre,lat,lon,puntos_sello,subregion` +
        `&lat=gte.${Math.min(...lats) - m}&lat=lte.${Math.max(...lats) + m}` +
        `&lon=gte.${Math.min(...lons) - m}&lon=lte.${Math.max(...lons) + m}` +
        `&limit=15`;
      const res = await fetch(url, {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const rows = await res.json();
        // Normalizar: Supabase devuelve 'subregion', el template espera 'departamento'
        municipios = rows.map(m => ({ ...m, departamento: m.departamento || m.subregion || 'Antioquia' }));
      }
      console.log(`  [${rideId}] municipios de Supabase: ${municipios.length}`);
    } catch (e) {
      console.warn(`  [${rideId}] municipios no disponibles: ${e.message}`);
    }
  }

  const templatePath = join(__dirname, 'mapbox-template.html');
  const html = (await readFile(templatePath, 'utf8'))
    .replace('__MAPBOX_TOKEN__', MAPBOX_TOKEN || '')
    .replace(
      '__RIDE_DATA__',
      JSON.stringify({
        rideName,
        elapsed,
        distanceKm,
        maxSpeedKmh,
        routePoints,
        photos: (photos || []).slice(0, 8),
        municipios,
        rideStartedAt: rideStartedAt || null,
        groupRiders: (groupRiders || []).map(r => ({
          uid: r.uid,
          name: r.name,
          routePoints: r.routePoints || [],
        })),
      }).replace(/</g, '\\u003c')
    );

  // Carpeta temporal de frames
  const framesDir  = join(tmpdir(), `frames_${rideId}_${Date.now()}`);
  const outputPath = join(tmpdir(), `ride_${rideId}_${Date.now()}.mp4`);
  await mkdir(framesDir, { recursive: true });

  const launchOpts = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-zygote',
      '--disable-crash-reporter',
      '--disable-crashpad',
      '--disable-breakpad',
      '--disable-extensions',
      '--mute-audio',
      // NO usar --use-gl=angle/--use-angle=swiftshader: en Chrome 127
      // deshabilitan WebGL (verificado). Sin ellos Chrome cae solo a
      // SwiftShader y WebGL funciona.
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--font-render-hinting=none',
      `--window-size=${WIDTH},${HEIGHT}`,
    ],
    // SIN executablePath: Puppeteer usa SIEMPRE su Chrome for Testing
    // emparejado (PUPPETEER_CACHE_DIR). No se obedece la env var
    // PUPPETEER_EXECUTABLE_PATH porque una variable vieja en Railway
    // apuntando al chromium de Debian reintroduciría el crash de launch.
    protocolTimeout: 15 * 60 * 1000,
    // Chromium necesita directorios escribibles — sin HOME válido crashea
    env: {
      ...process.env,
      HOME: '/tmp',
      XDG_CONFIG_HOME: '/tmp/.chromium',
      XDG_CACHE_HOME: '/tmp/.chromium',
    },
    dumpio: true, // stderr completo de Chromium a los logs de Railway
  };

  const tBrowser = Date.now();
  let browser = null;
  // try/finally: si CUALQUIER paso falla, el navegador se cierra y los
  // frames se borran — un Chromium zombi por job fallido agota la
  // memoria de Railway y tumba los renders siguientes.
  try {

  // El primer launch a veces falla en contenedores fríos — reintentar
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      browser = await puppeteer.launch(launchOpts);
      break;
    } catch (err) {
      console.error(`  [${rideId}] launch intento ${attempt}/3 falló: ${err.message.split('\n')[0]}`);
      if (attempt === 3) throw err;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  T('browser boot', tBrowser);

  const page = await browser.newPage();
  page.on('console', msg => console.log(`  [${rideId}] BROWSER ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => console.error(`  [${rideId}] BROWSER pageerror: ${err.message}`));

  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
  T('page load', tBrowser);

  // Esperar que el mapa y el terreno estén listos
  const tReady = Date.now();
  // idle inicial (12s) + pausa (2s) + 5 preloads×1.5s + 1 final = ~22s máx
  // Damos 70s para cubrir tiles lentos desde Railway-US a Mapbox CDN
  const totalSeconds = await page.evaluate(() =>
    new Promise(resolve => {
      if (window.__ready) return resolve(window.__totalSeconds || 30);
      window.__onReady = () => resolve(window.__totalSeconds || 30);
      setTimeout(() => resolve(window.__totalSeconds || 30), 70000);
    })
  );
  T('scene ready', tReady);

  // Si el script del template murió (token Mapbox inválido, CDN caído),
  // fallar YA con un error claro en vez de capturar frames de nada
  const sceneOk = await page.evaluate(
    () => typeof window.__seekTo === 'function' && window.__ready === true
  );
  if (!sceneOk) {
    throw new Error(
      'La escena Mapbox no cargó (revisar MAPBOX_TOKEN y acceso a api.mapbox.com — ver logs BROWSER)'
    );
  }
  const cappedSeconds = Math.min(totalSeconds, MAX_DURATION_SEC);
  console.log(`  [${rideId}] duración: ${cappedSeconds}s (original: ${totalSeconds}s), frames: ${Math.ceil(cappedSeconds * FPS)}`);

  // ── Captura frame a frame ──────────────────────────────────────────────
  const tCapture = Date.now();
  const totalFrames = Math.ceil(cappedSeconds * FPS);

  for (let f = 0; f < totalFrames; f++) {
    const t = f / FPS;
    // Seek al segundo exacto y esperar idle del mapa
    await page.evaluate(t => window.__seekTo(t), t);

    const frameNum = String(f).padStart(6, '0');
    // JPEG q90: ~10x más liviano y rápido que PNG, sin pérdida visible
    await page.screenshot({
      path: join(framesDir, `frame_${frameNum}.jpg`),
      type: 'jpeg',
      quality: 95,
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    });

    if (f % 48 === 0) {
      const pct = Math.round((f / totalFrames) * 100);
      // 5-95%: la captura es el grueso del trabajo (encode+upload al final)
      onProgress && onProgress(Math.min(95, 5 + Math.round(pct * 0.9)));
      console.log(`  [${rideId}] frames: ${f}/${totalFrames} (${pct}%) — ${((Date.now()-tCapture)/1000).toFixed(1)}s`);
    }
  }
  T('frame capture', tCapture);

  // Cerrar el navegador ANTES de ffmpeg para liberar memoria
  await browser.close();
  browser = null;

  // ── Ensamblar con FFmpeg ───────────────────────────────────────────────
  const tFfmpeg = Date.now();
  await ffmpegEncode(framesDir, outputPath, cappedSeconds);
  T('ffmpeg encode', tFfmpeg);

  return outputPath;

  } finally {
    if (browser) await browser.close().catch(() => {});
    rm(framesDir, { recursive: true, force: true }).catch(() => {});
  }
}
