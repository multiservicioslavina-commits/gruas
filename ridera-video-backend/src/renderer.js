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

function ffmpegEncode(framesDir, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-framerate', String(FPS),
      '-i', join(framesDir, 'frame_%06d.jpg'),
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-vf', `scale=${WIDTH}:${HEIGHT}`,
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
  onProgress,
}) {
  const T = (label, from) =>
    console.log(`  [${rideId}] ${label}: ${((Date.now() - from) / 1000).toFixed(1)}s`);

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
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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
  let browser;
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
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 90000 });
  T('page load', tBrowser);

  // Esperar que el mapa y el terreno estén listos
  const tReady = Date.now();
  const totalSeconds = await page.evaluate(() =>
    new Promise(resolve => {
      if (window.__ready) return resolve(window.__totalSeconds || 30);
      window.__onReady = () => resolve(window.__totalSeconds || 30);
      setTimeout(() => resolve(window.__totalSeconds || 30), 50000);
    })
  );
  T('scene ready', tReady);

  // Si el script del template murió (token Mapbox inválido, CDN caído),
  // fallar YA con un error claro en vez de capturar frames de nada
  const sceneOk = await page.evaluate(
    () => typeof window.__seekTo === 'function' && window.__ready === true
  );
  if (!sceneOk) {
    await browser.close();
    throw new Error(
      'La escena Mapbox no cargó (revisar MAPBOX_TOKEN y acceso a api.mapbox.com — ver logs BROWSER)'
    );
  }
  console.log(`  [${rideId}] duración: ${totalSeconds}s, frames: ${Math.ceil(totalSeconds * FPS)}`);

  // ── Captura frame a frame ──────────────────────────────────────────────
  const tCapture = Date.now();
  const totalFrames = Math.ceil(totalSeconds * FPS);

  for (let f = 0; f < totalFrames; f++) {
    const t = f / FPS;
    // Seek al segundo exacto y esperar idle del mapa
    await page.evaluate(t => window.__seekTo(t), t);

    const frameNum = String(f).padStart(6, '0');
    // JPEG q90: ~10x más liviano y rápido que PNG, sin pérdida visible
    await page.screenshot({
      path: join(framesDir, `frame_${frameNum}.jpg`),
      type: 'jpeg',
      quality: 90,
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

  await browser.close();

  // ── Ensamblar con FFmpeg ───────────────────────────────────────────────
  const tFfmpeg = Date.now();
  await ffmpegEncode(framesDir, outputPath);
  T('ffmpeg encode', tFfmpeg);

  // Limpiar frames temporales
  rm(framesDir, { recursive: true, force: true }).catch(() => {});

  return outputPath;
}
