import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SignJWT } from 'https://esm.sh/jose@5';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const WA_TOKEN   = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const RITA_PHONE = Deno.env.get('RITA_PHONE_ID') ?? '';
const GRAPH      = 'https://graph.facebook.com/v25.0';

const SALT = 'ridera-cliente-2026';
async function hashCode(code: string, telefono: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SALT + telefono + code));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Mismo secreto que valida PostgREST (guardado como CLUB_JWT_SECRET porque
// Supabase reserva el prefijo SUPABASE_) -- mismo patron que club-auth.
async function signClienteToken(clienteId: string, telefono: string): Promise<string> {
  const secret = Deno.env.get('CLUB_JWT_SECRET');
  if (!secret) throw new Error('CLUB_JWT_SECRET no configurado en el proyecto');
  const key = new TextEncoder().encode(secret);
  return await new SignJWT({ role: 'authenticated', sub: clienteId, telefono, aud: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key);
}

function normalizePhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('57') && digits.length === 12) return digits;
  if (digits.length === 10 && digits.startsWith('3')) return '57' + digits;
  return digits;
}

async function sendWhatsAppCode(to: string, code: string): Promise<{ ok: boolean; error?: string }> {
  if (!WA_TOKEN || !RITA_PHONE) return { ok: false, error: 'WhatsApp no configurado' };
  const texto = `Tu código de Ridera Grúas es: *${code}*\n\nVálido por 10 minutos. Si no lo pediste tú, ignora este mensaje.`;
  const res = await fetch(`${GRAPH}/${RITA_PHONE}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: texto } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    // Frecuente si el numero nunca le ha escrito a este WhatsApp antes: Meta
    // exige una plantilla aprobada (categoria "Autenticacion") para el primer
    // contacto -- un mensaje de texto libre no llega. Si esto falla seguido,
    // hay que crear esa plantilla en el Business Manager y usarla aqui.
    return { ok: false, error: data?.error?.message || 'No se pudo enviar el WhatsApp' };
  }
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  const action = (body.action || '').toString();
  const telefono = normalizePhone((body.telefono || '').toString());
  const codigo = (body.codigo || '').toString().trim();
  const nombre = (body.nombre || '').toString().trim();

  if (!telefono || telefono.length < 11) return json({ error: 'Número de WhatsApp inválido' }, 400);

  if (action === 'enviar-codigo') {
    // Evita reenvios en cadena: si hay un codigo sin usar de hace menos de
    // 60s para este telefono, no se genera otro.
    const { data: reciente } = await sb.from('otp_codigos')
      .select('created_at').eq('telefono', telefono).is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (reciente && (Date.now() - new Date(reciente.created_at).getTime()) < 60_000) {
      return json({ error: 'Ya te enviamos un código. Espera un momento antes de pedir otro.' }, 429);
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await hashCode(code, telefono);
    const expires_at = new Date(Date.now() + 10 * 60_000).toISOString();

    const { error: insErr } = await sb.from('otp_codigos').insert({ telefono, code_hash, expires_at });
    if (insErr) return json({ error: insErr.message }, 500);

    const sent = await sendWhatsAppCode(telefono, code);
    if (!sent.ok) return json({ error: sent.error || 'No se pudo enviar el código' }, 502);

    return json({ ok: true });
  }

  if (action === 'verificar-codigo') {
    if (!codigo) return json({ error: 'Falta el código' }, 400);

    const { data: otp } = await sb.from('otp_codigos')
      .select('id, code_hash, intentos, expires_at, used_at')
      .eq('telefono', telefono).is('used_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (!otp) return json({ ok: false, error: 'Pide un código nuevo.' }, 400);
    if (new Date(otp.expires_at) < new Date()) return json({ ok: false, error: 'El código expiró. Pide uno nuevo.' }, 400);
    if (otp.intentos >= 5) return json({ ok: false, error: 'Demasiados intentos. Pide un código nuevo.' }, 400);

    const hashed = await hashCode(codigo, telefono);
    if (hashed !== otp.code_hash) {
      await sb.from('otp_codigos').update({ intentos: otp.intentos + 1 }).eq('id', otp.id);
      return json({ ok: false, error: 'Código incorrecto.' }, 401);
    }

    await sb.from('otp_codigos').update({ used_at: new Date().toISOString() }).eq('id', otp.id);

    // Cliente existente o primera vez.
    let { data: cliente } = await sb.from('clientes').select('id, telefono, nombre').eq('telefono', telefono).maybeSingle();
    if (!cliente) {
      const { data: nuevo, error: insErr } = await sb.from('clientes')
        .insert({ telefono, nombre: nombre || null }).select('id, telefono, nombre').single();
      if (insErr) return json({ error: insErr.message }, 500);
      cliente = nuevo;
    } else if (nombre && !cliente.nombre) {
      await sb.from('clientes').update({ nombre }).eq('id', cliente.id);
      cliente = { ...cliente, nombre };
    }

    const token = await signClienteToken(cliente.id, telefono);
    return json({ ok: true, token, cliente });
  }

  return json({ error: 'Acción no válida' }, 400);
});
