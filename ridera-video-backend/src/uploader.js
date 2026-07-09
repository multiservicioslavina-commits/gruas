import { readFile } from 'fs/promises';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn('WARNING: SUPABASE_URL o SUPABASE_SERVICE_KEY no configurados');
}

const BUCKET = 'ride-videos';

/**
 * Sube el mp4 a Supabase Storage vía REST y devuelve la URL pública.
 * Sin @supabase/supabase-js: sus versiones nuevas exigen WebSocket
 * nativo (Node 22) y rompían la subida en Node 20. Storage es un POST
 * HTTP simple que fetch nativo resuelve.
 */
export async function uploadVideo(rideId, localPath) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY no configurados');
  }
  const buffer = await readFile(localPath);
  const path = `${rideId}/${Date.now()}.mp4`;

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
