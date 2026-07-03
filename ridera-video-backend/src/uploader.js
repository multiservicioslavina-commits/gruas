import { createClient } from '@supabase/supabase-js';
import { readFile } from 'fs/promises';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn('WARNING: SUPABASE_URL o SUPABASE_SERVICE_KEY no configurados');
}

const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_KEY || '');
const BUCKET = 'ride-videos';

/**
 * Sube el mp4 a Supabase Storage y devuelve la URL pública.
 */
export async function uploadVideo(rideId, localPath) {
  const buffer = await readFile(localPath);
  const path = `${rideId}/${Date.now()}.mp4`;
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
