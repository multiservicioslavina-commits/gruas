import { readFile } from 'fs/promises';

const BUCKET = 'ride-videos';

/**
 * Sube el mp4 a Supabase Storage vía REST directo (sin @supabase/supabase-js).
 * Evita la dependencia de realtime-js/ws en Node 20.
 * Devuelve la URL pública.
 */
export async function uploadVideo(rideId, localPath) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      `SUPABASE_URL o SUPABASE_SERVICE_KEY no configurados. ` +
      `URL="${url ? 'set' : 'MISSING'}" KEY="${key ? 'set' : 'MISSING'}"`
    );
  }

  const buffer = await readFile(localPath);
  const path = `${rideId}/${Date.now()}.mp4`;
  const uploadUrl = `${url}/storage/v1/object/${BUCKET}/${path}`;

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': 'video/mp4',
      'x-upsert': 'false',
    },
    body: buffer,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase upload ${res.status}: ${body}`);
  }

  return `${url}/storage/v1/object/public/${BUCKET}/${path}`;
}
