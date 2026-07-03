import { createClient } from '@supabase/supabase-js';
import { readFile } from 'fs/promises';

const BUCKET = 'ride-videos';

let _client;
function client() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      `SUPABASE_URL o SUPABASE_SERVICE_KEY no configurados. ` +
      `URL="${url ? 'set' : 'MISSING'}" KEY="${key ? 'set' : 'MISSING'}"`
    );
  }
  _client = createClient(url, key);
  return _client;
}

/**
 * Sube el mp4 a Supabase Storage y devuelve la URL pública.
 */
export async function uploadVideo(rideId, localPath) {
  const buffer = await readFile(localPath);
  const path = `${rideId}/${Date.now()}.mp4`;
  const supabase = client();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: 'video/mp4',
      upsert: false,
    });
  if (error) throw new Error(`Supabase upload: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
