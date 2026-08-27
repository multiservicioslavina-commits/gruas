import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SignJWT } from 'https://esm.sh/jose@5';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const SALT = 'ridera-club-2026';
async function hash(p: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SALT + p));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Firma un JWT real (mismo secreto que valida PostgREST) con el club_id como
// claim personalizado, para que las politicas RLS puedan confiar en el
// dato sin depender de que el navegador "diga la verdad".
async function signClubToken(clubId: string): Promise<string> {
  // Supabase reserva el prefijo SUPABASE_ y no permite crear secretos con el,
  // asi que el JWT secret del proyecto se guarda bajo este nombre.
  const secret = Deno.env.get('CLUB_JWT_SECRET');
  if (!secret) throw new Error('CLUB_JWT_SECRET no configurado en el proyecto');
  const key = new TextEncoder().encode(secret);
  return await new SignJWT({ role: 'authenticated', club_id: clubId, aud: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(key);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  const action = (body.action || '').toString();
  const codigo = (body.codigo || '').toString();
  const clubId = (body.clubId || body.club_id || '').toString();
  const password = (body.password || '').toString();
  const newPassword = (body.newPassword || body.new_password || '').toString();

  let q;
  if (clubId) q = sb.from('clubs').select('id,nombre,codigo,datos').eq('id', clubId).limit(1);
  else if (codigo) q = sb.from('clubs').select('id,nombre,codigo,datos').eq('codigo', codigo).limit(1);
  else return json({ error: 'Falta identificar el club' }, 400);
  const { data } = await q;
  const club = data && data[0];
  if (!club) return json({ error: 'Club no encontrado' }, 404);

  const datos = club.datos || {};
  const hasPass = !!datos.admin_pass_hash;

  if (action === 'estado') {
    return json({ ok: true, clubId: club.id, nombre: club.nombre, codigo: club.codigo, tienePass: hasPass });
  }

  if (action === 'set') {
    if (hasPass) return json({ error: 'Este club ya tiene clave. Usa "Cambiar clave".' }, 400);
    if (password.length < 4) return json({ error: 'La clave debe tener al menos 4 caracteres' }, 400);
    const nuevo = { ...datos, admin_pass_hash: await hash(password) };
    const { error } = await sb.from('clubs').update({ datos: nuevo }).eq('id', club.id);
    if (error) return json({ error: error.message }, 500);
    const token = await signClubToken(club.id);
    return json({ ok: true, clubId: club.id, nombre: club.nombre, codigo: club.codigo, token });
  }

  if (action === 'login') {
    if (!hasPass) return json({ ok: false, error: 'Este club aún no tiene clave. Créala.' }, 400);
    const ok = datos.admin_pass_hash === await hash(password);
    if (!ok) return json({ ok: false, clubId: club.id, nombre: club.nombre, codigo: club.codigo });
    const token = await signClubToken(club.id);
    return json({ ok: true, clubId: club.id, nombre: club.nombre, codigo: club.codigo, token });
  }

  if (action === 'change') {
    if (hasPass && datos.admin_pass_hash !== await hash(password)) return json({ ok: false, error: 'Clave actual incorrecta' }, 401);
    if (newPassword.length < 4) return json({ error: 'La nueva clave debe tener al menos 4 caracteres' }, 400);
    const nuevo = { ...datos, admin_pass_hash: await hash(newPassword) };
    const { error } = await sb.from('clubs').update({ datos: nuevo }).eq('id', club.id);
    if (error) return json({ error: error.message }, 500);
    const token = await signClubToken(club.id);
    return json({ ok: true, token });
  }

  // Confirma un reseteo de clave iniciado por Rita vía WhatsApp. El token
  // se genera y valida server-side (rita-whatsapp) solo tras verificar que
  // quien escribe es el whatsapp/lider_tel registrado del club — este paso
  // solo confirma que el link no expiró ni fue usado ya.
  if (action === 'reset-confirm') {
    const resetToken = (body.token || '').toString();
    if (!resetToken) return json({ error: 'Falta el token del link' }, 400);
    if (!datos.reset_token || datos.reset_token !== resetToken) {
      return json({ error: 'Este link ya fue usado o no es válido. Pide uno nuevo por WhatsApp.' }, 401);
    }
    if (!datos.reset_token_expires || new Date(datos.reset_token_expires) < new Date()) {
      return json({ error: 'Este link expiró. Pide uno nuevo por WhatsApp.' }, 401);
    }
    if (newPassword.length < 4) return json({ error: 'La nueva clave debe tener al menos 4 caracteres' }, 400);
    const nuevo = { ...datos, admin_pass_hash: await hash(newPassword) };
    delete nuevo.reset_token;
    delete nuevo.reset_token_expires;
    const { error } = await sb.from('clubs').update({ datos: nuevo }).eq('id', club.id);
    if (error) return json({ error: error.message }, 500);
    const token = await signClubToken(club.id);
    return json({ ok: true, clubId: club.id, nombre: club.nombre, codigo: club.codigo, token });
  }

  return json({ error: 'Acción no válida' }, 400);
});
