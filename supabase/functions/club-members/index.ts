import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jwtVerify } from 'https://esm.sh/jose@5';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const RITA_PHONE = Deno.env.get('RITA_PHONE_ID') ?? '1238785075974458';
const GRAPH = 'https://graph.facebook.com/v25.0';

function normalizePhone(raw: string): string {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('57') && digits.length === 12) return digits;
  if (digits.length === 10 && digits.startsWith('3')) return '57' + digits;
  return digits;
}

// Devuelve el club_id del token firmado por club-auth, o null si no es valido.
// La verificacion se hace aqui con el mismo secreto en vez de delegarla a las
// politicas RLS, para que las escrituras no dependan de que PostgREST acepte
// este token (el proyecto ya migro a llaves asimetricas).
async function clubIdFromToken(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') || '';
  const raw = auth.replace(/^Bearer\s+/i, '').trim();
  if (!raw) return null;
  const secret = Deno.env.get('CLUB_JWT_SECRET');
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(raw, new TextEncoder().encode(secret));
    return (payload.club_id as string) || null;
  } catch {
    return null;
  }
}

// La API de WhatsApp solo permite texto libre dentro de las 24h siguientes al
// ultimo mensaje del lider a Rita. Fuera de esa ventana Meta rechaza el envio,
// por eso la notificacion es "mejor esfuerzo": el panel siempre muestra las
// solicitudes aunque el WhatsApp no llegue.
async function notificarLider(telefono: string, texto: string): Promise<boolean> {
  if (!WA_TOKEN || !telefono) return false;
  try {
    const res = await fetch(`${GRAPH}/${RITA_PHONE}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: telefono, type: 'text', text: { body: texto } }),
    });
    const out = await res.json();
    return !!out?.messages?.length;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  const action = (body.action || '').toString();

  // ---------- Publico: alguien pide entrar por el link de invitacion ----------
  if (action === 'solicitar') {
    const codigo = (body.codigo || '').toString().toLowerCase();
    const nombre = (body.nombre || '').toString().trim();
    const telefono = normalizePhone((body.telefono || '').toString());

    if (!codigo) return json({ error: 'Falta el club' }, 400);
    if (nombre.length < 2) return json({ error: 'Escribe tu nombre completo' }, 400);
    if (telefono.length < 10) return json({ error: 'El teléfono no es válido' }, 400);

    const { data: club } = await sb.from('clubs').select('id,nombre,codigo,datos').eq('codigo', codigo).maybeSingle();
    if (!club) return json({ error: 'Club no encontrado' }, 404);

    const { data: yaEsta } = await sb.from('connect_members')
      .select('id,estado').eq('club_id', club.id).eq('telefono', telefono).maybeSingle();
    if (yaEsta) {
      if (yaEsta.estado === 'solicitado') return json({ ok: true, estado: 'solicitado', repetido: true });
      return json({ ok: true, estado: yaEsta.estado, repetido: true });
    }

    const { error } = await sb.from('connect_members').insert({
      club_id: club.id, nombre, telefono, estado: 'solicitado', agregado_por: 'link',
    });
    if (error) return json({ error: error.message }, 500);

    const datos = club.datos || {};
    const lider = normalizePhone(datos.whatsapp || datos.lider_tel || '');
    const avisado = await notificarLider(
      lider,
      `🏍️ Nueva solicitud para ${club.nombre}\n\n${nombre}\n${telefono}\n\nApruébala en tu panel:\nhttps://club.ridera.com.co/admin`,
    );

    return json({ ok: true, estado: 'solicitado', avisado });
  }

  // ---------- Publico: marcar que el miembro ya entro al chat ----------
  if (action === 'ingreso') {
    const clubId = (body.clubId || '').toString();
    const telefono = normalizePhone((body.telefono || '').toString());
    if (!clubId || !telefono) return json({ error: 'Faltan datos' }, 400);

    const { data: m } = await sb.from('connect_members')
      .select('id,estado').eq('club_id', clubId).eq('telefono', telefono).maybeSingle();
    if (!m) return json({ ok: false, error: 'No estás en este club' }, 404);
    if (m.estado === 'solicitado') return json({ ok: false, error: 'Tu solicitud todavía no ha sido aprobada por el club.' }, 403);
    if (m.estado === 'pendiente') {
      await sb.from('connect_members')
        .update({ estado: 'vinculado', vinculado_at: new Date().toISOString() })
        .eq('id', m.id);
    }
    return json({ ok: true });
  }

  // ---------- De aqui en adelante hay que ser el admin del club ----------
  const clubId = await clubIdFromToken(req);
  if (!clubId) return json({ error: 'Sesión no válida. Vuelve a entrar al panel.' }, 401);

  if (action === 'listar') {
    const { data, error } = await sb.from('connect_members')
      .select('*').eq('club_id', clubId).order('created_at', { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, miembros: data || [] });
  }

  if (action === 'aprobar') {
    const memberId = (body.memberId || '').toString();
    if (!memberId) return json({ error: 'Falta el miembro' }, 400);
    const { data, error } = await sb.from('connect_members')
      .update({ estado: 'pendiente' })
      .eq('id', memberId).eq('club_id', clubId).eq('estado', 'solicitado')
      .select('id,nombre,telefono').maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: 'Esa solicitud ya no existe' }, 404);

    const { data: club } = await sb.from('clubs').select('nombre,codigo').eq('id', clubId).maybeSingle();
    await notificarLider(
      data.telefono,
      `✅ ¡Tu solicitud para entrar a ${club?.nombre || 'el club'} fue aprobada!\n\nEntra al chat aquí:\nhttps://club.ridera.com.co/${club?.codigo || ''}`,
    );
    return json({ ok: true });
  }

  if (action === 'eliminar') {
    const memberId = (body.memberId || '').toString();
    if (!memberId) return json({ error: 'Falta el miembro' }, 400);
    const { error } = await sb.from('connect_members')
      .delete().eq('id', memberId).eq('club_id', clubId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === 'agregar') {
    const miembros = Array.isArray(body.miembros) ? body.miembros : [];
    const filas = miembros
      .map((m: Record<string, unknown>) => ({
        club_id: clubId,
        nombre: (m.nombre || '').toString().trim(),
        telefono: normalizePhone((m.telefono || '').toString()),
        estado: 'pendiente',
        agregado_por: 'admin',
      }))
      .filter((m) => m.nombre.length >= 2 && m.telefono.length >= 10);
    if (!filas.length) return json({ error: 'No hay miembros válidos' }, 400);

    const { error } = await sb.from('connect_members')
      .upsert(filas, { onConflict: 'club_id,telefono', ignoreDuplicates: true });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, agregados: filas.length });
  }

  return json({ error: 'Acción no válida' }, 400);
});
