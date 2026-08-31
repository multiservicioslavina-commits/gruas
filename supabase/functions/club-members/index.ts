import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jwtVerify, SignJWT } from 'https://esm.sh/jose@5';

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
    // La sesion de un miembro del chat se firma con esta misma clave y tambien
    // lleva club_id: sin descartarla aqui, cualquier miembro podria usar su
    // token para las acciones del dueño (borrar miembros, nombrar admins).
    if (payload.tipo === 'club-member') return null;
    return (payload.club_id as string) || null;
  } catch {
    return null;
  }
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function claveSesion(): Uint8Array | null {
  const secret = Deno.env.get('CLUB_JWT_SECRET');
  return secret ? new TextEncoder().encode(secret) : null;
}

// Sesion del miembro del chat. Antes bastaba con mandar un member_id, que es
// un dato que cualquiera podia leer de la tabla; ahora hay que traer un token
// firmado que solo se obtiene con un codigo enviado al WhatsApp del miembro.
async function firmarSesionMiembro(m: { id: string; club_id: string }): Promise<string> {
  const key = claveSesion();
  if (!key) throw new Error('CLUB_JWT_SECRET no configurado');
  return await new SignJWT({ tipo: 'club-member', member_id: m.id, club_id: m.club_id })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key);
}

// Devuelve el miembro de la sesion, releyendo su fila: el rol y el estado
// mandan como esten AHORA, no como estaban cuando se firmo el token. Asi,
// quitarle a alguien el rol de admin o sacarlo del club surte efecto de una.
async function miembroDeSesion(sb: Sb, req: Request): Promise<{ id: string; club_id: string; es_admin: boolean } | null> {
  const raw = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const key = claveSesion();
  if (!raw || !key) return null;
  try {
    const { payload } = await jwtVerify(raw, key);
    if (payload.tipo !== 'club-member' || !payload.member_id) return null;
    const { data } = await sb.from('connect_members')
      .select('id, club_id, es_admin, estado')
      .eq('id', payload.member_id as string).maybeSingle();
    if (!data || data.estado === 'solicitado') return null;
    return { id: data.id, club_id: data.club_id, es_admin: !!data.es_admin };
  } catch {
    return null;
  }
}

type Sb = ReturnType<typeof createClient>;

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
      club_id: club.id, nombre, telefono, estado: 'solicitado', agregado_por: 'link', es_admin: false,
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

  // ---------- Publico: entrar al chat con el telefono ----------
  // El control de quien entra es la aprobacion del lider, no un codigo: un
  // club es gente que se conoce, y pedir codigo cada vez espantaba a la
  // mayoria. Aun asi se entrega una sesion firmada, para que borrar mensajes,
  // moderar o gestionar miembros no dependa de un id que viaja en el cuerpo.
  //
  // El mecanismo de codigo sigue abajo ('sesion-codigo' y 'sesion-verificar')
  // por si el dia de manana se quiere exigir: es cambiar la pantalla, no esto.
  if (action === 'sesion-telefono') {
    const telefono = normalizePhone((body.telefono || '').toString());
    const clubId = (body.clubId || '').toString();
    if (!telefono || !clubId) return json({ error: 'Faltan datos' }, 400);

    const { data: m } = await sb.from('connect_members')
      .select('id, nombre, club_id, estado, es_admin')
      .eq('club_id', clubId).eq('telefono', telefono).maybeSingle();
    if (!m) return json({ error: 'Tu número no está registrado en este club. Pídele al líder que te agregue.' }, 404);
    if (m.estado === 'solicitado') {
      return json({ error: 'Tu solicitud todavía está esperando que el club la apruebe.' }, 403);
    }

    if (m.estado === 'pendiente') {
      await sb.from('connect_members')
        .update({ estado: 'vinculado', vinculado_at: new Date().toISOString() })
        .eq('id', m.id);
    }

    const token = await firmarSesionMiembro({ id: m.id, club_id: m.club_id });
    return json({ ok: true, token, miembro: { id: m.id, nombre: m.nombre, es_admin: !!m.es_admin } });
  }

  // ---------- Publico: pedir el codigo de entrada ----------
  // Rita tambien lo entrega cuando el miembro le escribe (rita-whatsapp), pero
  // se puede pedir desde aqui: el miembro abre la conversacion con ella desde
  // la app y entonces Meta permite el envio, que fuera de esa ventana de 24h
  // rechazaria.
  if (action === 'sesion-codigo') {
    const telefono = normalizePhone((body.telefono || '').toString());
    const clubId = (body.clubId || '').toString();
    if (!telefono || !clubId) return json({ error: 'Faltan datos' }, 400);

    const { data: m } = await sb.from('connect_members')
      .select('id, nombre, estado').eq('club_id', clubId).eq('telefono', telefono).maybeSingle();
    // Un numero que no esta no recibe pistas de si existe o no en otro club.
    if (!m) return json({ error: 'Ese número no está en este club.' }, 404);
    if (m.estado === 'solicitado') {
      return json({ error: 'Tu solicitud todavía está esperando aprobación del club.' }, 403);
    }

    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    await sb.from('connect_login_codes').delete().eq('member_id', m.id).is('usado_en', null);
    const { error } = await sb.from('connect_login_codes').insert({
      member_id: m.id,
      codigo_hash: await sha256Hex(codigo),
      expira_en: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (error) return json({ error: error.message }, 500);

    const enviado = await notificarLider(
      telefono,
      `Tu código para entrar al chat del club es:\n\n*${codigo}*\n\nVence en 10 minutos y solo sirve una vez.`,
    );
    // Si Meta lo rechaza (nadie escribio a Rita en 24h) hay que decirlo: si no,
    // el miembro se queda esperando un mensaje que nunca va a llegar.
    return json({ ok: true, enviado });
  }

  // ---------- Publico: canjear el codigo de WhatsApp por una sesion ----------
  if (action === 'sesion-verificar') {
    const telefono = normalizePhone((body.telefono || '').toString());
    const codigo = (body.codigo || '').toString().replace(/\D/g, '');
    const clubId = (body.clubId || '').toString();
    if (!telefono || !codigo || !clubId) return json({ error: 'Faltan datos' }, 400);

    const { data: m } = await sb.from('connect_members')
      .select('id, nombre, club_id, estado, es_admin')
      .eq('club_id', clubId).eq('telefono', telefono).maybeSingle();
    if (!m) return json({ error: 'Tu número no está en este club.' }, 404);
    if (m.estado === 'solicitado') {
      return json({ error: 'Tu solicitud todavía está esperando aprobación del club.' }, 403);
    }

    const { data: fila } = await sb.from('connect_login_codes')
      .select('id, codigo_hash, expira_en, intentos')
      .eq('member_id', m.id).is('usado_en', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!fila) return json({ error: 'Pide un código nuevo por WhatsApp.' }, 401);
    if (new Date(fila.expira_en) < new Date()) {
      return json({ error: 'Ese código venció. Pide uno nuevo por WhatsApp.' }, 401);
    }
    // Tope de intentos: seis digitos se adivinan a fuerza bruta si se deja
    // probar sin limite.
    if (fila.intentos >= 5) {
      return json({ error: 'Demasiados intentos. Pide un código nuevo por WhatsApp.' }, 429);
    }
    if (fila.codigo_hash !== await sha256Hex(codigo)) {
      await sb.from('connect_login_codes').update({ intentos: fila.intentos + 1 }).eq('id', fila.id);
      return json({ error: 'Código incorrecto.' }, 401);
    }

    await sb.from('connect_login_codes').update({ usado_en: new Date().toISOString() }).eq('id', fila.id);
    if (m.estado === 'pendiente') {
      await sb.from('connect_members')
        .update({ estado: 'vinculado', vinculado_at: new Date().toISOString() })
        .eq('id', m.id);
    }

    const token = await firmarSesionMiembro({ id: m.id, club_id: m.club_id });
    return json({ ok: true, token, miembro: { id: m.id, nombre: m.nombre, es_admin: !!m.es_admin } });
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

  // ---------- Publico: borrar o corregir un mensaje propio ----------
  // Va por aqui y no por PostgREST porque los miembros del chat no tienen
  // token propio: la comprobacion de que el mensaje es suyo tiene que
  // hacerse del lado del servidor.
  if (action === 'msg-borrar' || action === 'msg-editar') {
    const sesion = await miembroDeSesion(sb, req);
    if (!sesion) return json({ error: 'Vuelve a entrar al chat.' }, 401);
    const memberId = sesion.id;
    const mensajeId = (body.mensajeId || '').toString();
    if (!mensajeId) return json({ error: 'Faltan datos' }, 400);

    const { data: m } = await sb.from('connect_messages')
      .select('id, member_id, tipo, es_rita, contenido, room_id')
      .eq('id', mensajeId).maybeSingle();
    if (!m) return json({ error: 'Ese mensaje ya no existe' }, 404);

    const esPropio = !m.es_rita && m.member_id === memberId;

    // Un admin del chat puede borrar lo de cualquiera (moderar), pero editar
    // sigue siendo solo de uno: nadie debe poder cambiar lo que otro dijo.
    let puedeBorrar = esPropio;
    if (!esPropio && action === 'msg-borrar' && sesion.es_admin) {
      const { data: sala } = await sb.from('connect_rooms')
        .select('club_id').eq('id', m.room_id).maybeSingle();
      puedeBorrar = !!sala && sala.club_id === sesion.club_id;
    }

    if (action === 'msg-editar' && !esPropio) {
      return json({ error: 'Solo puedes editar tus propios mensajes' }, 403);
    }
    if (action === 'msg-borrar' && !puedeBorrar) {
      return json({ error: 'No tienes permiso para borrar ese mensaje' }, 403);
    }

    if (action === 'msg-borrar') {
      const { error } = await sb.from('connect_messages').delete().eq('id', mensajeId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // Editar solo aplica a texto: en una foto o un audio no hay nada que
    // reescribir, esos se borran y se vuelven a mandar.
    if (m.tipo !== 'text') return json({ error: 'Este tipo de mensaje no se puede editar, solo borrar' }, 400);
    const texto = (body.texto || '').toString().trim();
    if (!texto) return json({ error: 'El mensaje no puede quedar vacío' }, 400);
    if (texto === m.contenido) return json({ ok: true, sinCambios: true });

    const { error } = await sb.from('connect_messages')
      .update({ contenido: texto, editado_at: new Date().toISOString() })
      .eq('id', mensajeId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ---------- Administrador del chat: moderar miembros desde la app ----------
  // Mismas operaciones que el panel del club, pero para un miembro al que el
  // dueño le dio permiso. Siempre acotadas a SU club.
  if (action === 'chat-miembros' || action === 'chat-agregar' || action === 'chat-quitar' || action === 'chat-aprobar') {
    const sesion = await miembroDeSesion(sb, req);
    if (!sesion) return json({ error: 'Vuelve a entrar al chat.' }, 401);
    if (!sesion.es_admin) return json({ error: 'No eres administrador de este chat' }, 403);
    const admin = { id: sesion.id, club_id: sesion.club_id };

    if (action === 'chat-miembros') {
      const { data, error } = await sb.from('connect_members')
        .select('id, nombre, telefono, estado, es_admin, created_at')
        .eq('club_id', admin.club_id).order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, miembros: data || [] });
    }

    if (action === 'chat-agregar') {
      const nombre = (body.nombre || '').toString().trim();
      const telefono = normalizePhone((body.telefono || '').toString());
      if (nombre.length < 2) return json({ error: 'Escribe el nombre completo' }, 400);
      if (telefono.length < 10) return json({ error: 'El teléfono no es válido' }, 400);
      const { error } = await sb.from('connect_members').upsert({
        club_id: admin.club_id, nombre, telefono, estado: 'pendiente', agregado_por: 'admin-chat',
      }, { onConflict: 'club_id,telefono', ignoreDuplicates: true });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    const objetivoId = (body.objetivoId || '').toString();
    if (!objetivoId) return json({ error: 'Falta el miembro' }, 400);
    if (objetivoId === admin.id) return json({ error: 'No puedes quitarte a ti mismo' }, 400);

    // Un admin del chat no manda sobre otro admin: para eso esta el dueño del
    // club, que es quien los nombra.
    const { data: objetivo } = await sb.from('connect_members')
      .select('id, club_id, es_admin').eq('id', objetivoId).maybeSingle();
    if (!objetivo || objetivo.club_id !== admin.club_id) return json({ error: 'Ese miembro no es de tu club' }, 403);
    if (objetivo.es_admin) return json({ error: 'No puedes tocar a otro administrador. Pídeselo al dueño del club.' }, 403);

    if (action === 'chat-aprobar') {
      const { error } = await sb.from('connect_members')
        .update({ estado: 'pendiente' }).eq('id', objetivoId).eq('estado', 'solicitado');
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // Al quitar a alguien sus mensajes NO se van solos: la FK es ON DELETE
    // SET NULL, asi que quedarian en el chat firmados como "Anonimo". Para un
    // infiltrado eso es justo lo que no se quiere, por eso se puede pedir que
    // se borren tambien.
    if (body.borrarMensajes) {
      const { data: salas } = await sb.from('connect_rooms').select('id').eq('club_id', admin.club_id);
      const ids = (salas || []).map((r: { id: string }) => r.id);
      if (ids.length) {
        await sb.from('connect_messages').delete().eq('member_id', objetivoId).in('room_id', ids);
      }
    }

    const { error } = await sb.from('connect_members').delete().eq('id', objetivoId);
    if (error) return json({ error: error.message }, 500);
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

    // Igual que en el panel del chat: sin esto sus mensajes se quedan
    // firmados como "Anonimo" en vez de irse con el.
    if (body.borrarMensajes) {
      const { data: salas } = await sb.from('connect_rooms').select('id').eq('club_id', clubId);
      const ids = (salas || []).map((r: { id: string }) => r.id);
      if (ids.length) {
        await sb.from('connect_messages').delete().eq('member_id', memberId).in('room_id', ids);
      }
    }

    const { error } = await sb.from('connect_members')
      .delete().eq('id', memberId).eq('club_id', clubId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // Nombrar o quitar administradores del chat. Solo el dueño del club, que es
  // quien entra con la clave del panel: si un admin pudiera nombrar a otro,
  // bastaria con colarse una vez para no poder sacarlos nunca.
  if (action === 'hacer-admin') {
    const memberId = (body.memberId || '').toString();
    const esAdmin = body.esAdmin !== false;
    if (!memberId) return json({ error: 'Falta el miembro' }, 400);
    const { data, error } = await sb.from('connect_members')
      .update({ es_admin: esAdmin })
      .eq('id', memberId).eq('club_id', clubId)
      .select('id, nombre').maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: 'Ese miembro no es de tu club' }, 404);
    return json({ ok: true, nombre: data.nombre, esAdmin });
  }

  // La tabla clubs solo permite UPDATE a authenticated con auth.uid() =
  // lider_id, y los clubes no tienen lider_id (son cuentas de club, no de
  // usuario de Supabase Auth), asi que guardar el logo tiene que pasar por aqui.
  if (action === 'logo') {
    const logoUrl = (body.logoUrl || '').toString();
    if (!/^https:\/\/[\w.-]+\.supabase\.co\/storage\/v1\/object\/public\//.test(logoUrl)) {
      return json({ error: 'URL de logo no válida' }, 400);
    }
    const { error } = await sb.from('clubs').update({ logo_url: logoUrl }).eq('id', clubId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, logoUrl });
  }

  if (action === 'rita-preguntas') {
    const { data, error } = await sb.from('connect_rita_dms')
      .select('*, connect_members(nombre,telefono)')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, mensajes: data || [] });
  }

  if (action === 'rita-responder') {
    const memberId = (body.memberId || '').toString();
    const texto = (body.texto || '').toString().trim();
    if (!memberId || !texto) return json({ error: 'Falta el mensaje' }, 400);

    // El miembro tiene que ser de este club: si no, un club podria escribirle
    // a los miembros de otro pasando un member_id ajeno.
    const { data: m } = await sb.from('connect_members')
      .select('id').eq('id', memberId).eq('club_id', clubId).maybeSingle();
    if (!m) return json({ error: 'Ese miembro no es de tu club' }, 403);

    const { error } = await sb.from('connect_rita_dms').insert({
      member_id: memberId, club_id: clubId, sender: 'rita', content: texto,
    });
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
