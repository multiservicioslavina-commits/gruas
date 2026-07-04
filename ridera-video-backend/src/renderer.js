import puppeteer from 'puppeteer';
import { PuppeteerScreenRecorder } from 'puppeteer-screen-recorder';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;
if (!MAPBOX_TOKEN) {
  console.warn('WARNING: MAPBOX_TOKEN no configurado');
}

/**
 * Renderiza un video estilo Relive del recorrido.
 * Retorna el path local del .mp4 generado.
 */
export async function renderRideVideo({
  rideId,
  rideName,
  elapsed,
  distanceKm,
  maxSpeedKmh,
  routePoints,
  photos,
}) {
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
      })
        .replace(/</g, '\\u003c')
    );

  const T = (label, from) =>
    console.log(`  [${rideId}] ${label}: ${((Date.now() - from) / 1000).toFixed(1)}s`);
  const tBrowser = Date.now();
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--font-render-hinting=none',
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });

  T('browser boot', tBrowser);
  const tPage = Date.now();
  const page = await browser.newPage();

  // Log console del navegador headless al server (para debug)
  page.on('console', (msg) => {
    console.log(`  [${rideId}] BROWSER ${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    console.error(`  [${rideId}] BROWSER pageerror: ${err.message}`);
  });

  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 90000 });
  T('page setContent', tPage);

  const tReady = Date.now();
  // Esperar a que la escena reporte que está lista — CON TIMEOUT DEFENSIVO de 45s.
  // Si Mapbox GL falla (swiftshader/WebGL en Railway), seguimos igual con lo que haya.
  const durationSec = await page.evaluate(
    () =>
      new Promise((resolve) => {
        if (window.__ready) return resolve(window.__totalSeconds || 30);
        window.__onReady = () => resolve(window.__totalSeconds || 30);
        // Timeout defensivo — evita que se cuelgue eterno si el mapa no carga
        setTimeout(() => resolve(window.__totalSeconds || 30), 45000);
      })
  );
  T('scene ready', tReady);
  console.log(`  [${rideId}] duración calculada: ${durationSec}s`);

  const outputPath = join(tmpdir(), `ride_${rideId}_${Date.now()}.mp4`);
  const tRec = Date.now();
  const recorder = new PuppeteerScreenRecorder(page, {
    fps: 30,
    videoFrame: { width: 1080, height: 1080 },
    videoCrf: 22,
    videoCodec: 'libx264',
    videoPreset: 'medium',
    videoBitrate: 3500,
    aspectRatio: '1:1',
  });
  await recorder.start(outputPath);

  // Disparar la animación
  await page.evaluate(() => window.__play && window.__play());
  // Esperar duración + margen
  await new Promise((r) => setTimeout(r, (durationSec + 1) * 1000));

  await recorder.stop();
  T('recording', tRec);
  await browser.close();
  return outputPath;
}
