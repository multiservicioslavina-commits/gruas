import { readFile } from 'fs/promises';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn('WARNING: SUPABASE_URL o SUPABASE_SERVICE_KEY no configurados');
}

const BUCKET = 'ride-videos';

// ── Cloudflare R2 (opcional) ───────────────────────────────────────────
// Si están las 5 variables, los videos van a R2: egress GRATIS (compartir
// un video viral no cuesta nada, en Supabase Storage cada vista se paga).
// Sin las variables — o si R2 falla — se usa Supabase como siempre.
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
//   R2_PUBLIC_URL  (dominio público del bucket, ej: https://videos.ridera.co
//                   o https://pub-xxxx.r2.dev)
//   R2_ENDPOINT    (opcional, solo para tests — default el endpoint real)
const R2_ENABLED =
  !!process.env.R2_ACCOUNT_ID &&
  !!process.env.R2_ACCESS_KEY_ID &&
  !!process.env.R2_SECRET_ACCESS_KEY &&
  !!process.env.R2_BUCKET &&
  !!process.env.R2_PUBLIC_URL;

let s3Client = null;
async function getR2Client() {
  if (s3Client) return s3Client;
  const { S3Client } = await import('@aws-sdk/client-s3');
  s3Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT ||
      `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return s3Client;
}

async function uploadToR2(path, buffer) {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await getR2Client();
  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: path,
    Body: buffer,
    ContentType: 'video/mp4',
  }));
  const base = process.env.R2_PUBLIC_URL.replace(/\/$/, '');
  return `${base}/${path}`;
}

async function uploadToSupabase(path, buffer) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY no configurados');
  }
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
        'Content-Type': 'video/mp4',
        'x-upsert': 'false',
      },
      body: buffer,
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase upload ${res.status}: ${text.slice(0, 300)}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

/**
 * Sube el mp4 y devuelve la URL pública.
 * Prioridad: R2 (egress gratis) → fallback Supabase Storage.
 * Sin @supabase/supabase-js: sus versiones nuevas exigen WebSocket
 * nativo (Node 22) y rompían la subida en Node 20. Storage es un POST
 * HTTP simple que fetch nativo resuelve.
 */
export async function uploadVideo(rideId, localPath) {
  const buffer = await readFile(localPath);
  const path = `${rideId}/${Date.now()}.mp4`;

  if (R2_ENABLED) {
    try {
      const url = await uploadToR2(path, buffer);
      console.log(`  [${rideId}] subido a R2: ${url}`);
      return url;
    } catch (e) {
      console.warn(`  [${rideId}] R2 falló (${e.message.slice(0, 120)}) — fallback a Supabase`);
    }
  }
  return uploadToSupabase(path, buffer);
}
