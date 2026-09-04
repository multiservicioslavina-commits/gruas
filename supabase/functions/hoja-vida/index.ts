import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jwtVerify, SignJWT } from 'https://esm.sh/jose@5';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

type Sb = SupabaseClient;

// riders.telefono no está normalizado de forma consistente (a diferencia de
// connect_members): la mayoría son 10 dígitos locales, algunos llevan +57.
// En vez de adivinar un único formato, se prueban todas las variantes.
function candidatosTelefono(raw: string): string[] {
  const digits = (raw || '').replace(/\D/g, '');
  const set = new Set<string>([digits]);
  if (digits.startsWith('57') && digits.length === 12) {
    set.add(digits.slice(2));
    set.add('+' + digits);
  } else if (digits.length === 10 && digits.startsWith('3')) {
    set.add('57' + digits);
    set.add('+57' + digits);
  }
  return [...set];
}

// Para guardar un teléfono nuevo: normaliza al formato de 10 dígitos locales,
// que es el que ya usa la mayoría de riders existentes.
function telefonoCanonico(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('57') && digits.length === 12) return digits.slice(2);
  return digits;
}

// Misma clave que club-auth/club-members: la sesión se verifica aquí, nunca
// delegada a RLS/PostgREST (el proyecto migró a llaves asimétricas y ya no
// conviene depender de que acepten un token firmado con el secreto legado).
function claveSesion(): Uint8Array | null {
  const secret = Deno.env.get('CLUB_JWT_SECRET');
  return secret ? new TextEncoder().encode(secret) : null;
}

async function firmarSesionRider(riderId: string): Promise<string> {
  const key = claveSesion();
  if (!key) throw new Error('CLUB_JWT_SECRET no configurado');
  return await new SignJWT({ tipo: 'hoja-vida', rider_id: riderId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key);
}

async function riderIdDeSesion(req: Request): Promise<string | null> {
  const raw = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const key = claveSesion();
  if (!raw || !key) return null;
  try {
    const { payload } = await jwtVerify(raw, key);
    if (payload.tipo !== 'hoja-vida' || !payload.rider_id) return null;
    return payload.rider_id as string;
  } catch {
    return null;
  }
}

// Alerta simple de vencimiento: rojo si ya venció, amarillo si vence en
// menos de 30 días, sin alerta si no.
function estadoVencimiento(fecha: string | null): 'vencido' | 'proximo' | 'vigente' | null {
  if (!fecha) return null;
  const dias = (new Date(fecha).getTime() - Date.now()) / 86400000;
  if (dias < 0) return 'vencido';
  if (dias <= 30) return 'proximo';
  return 'vigente';
}

async function obtenerHojaDeVida(sb: Sb, riderId: string) {
  const { data: ownerships } = await sb.from('rider_motorcycles')
    .select('id, motorcycle_id, motorcycle_identity(id, rdr_id, placa, marca, modelo, cc, anio, color, estado)')
    .eq('rider_id', riderId)
    .is('fecha_fin_propiedad', null)
    .not('motorcycle_id', 'is', null);

  const motos = [];
  for (const own of ownerships ?? []) {
    const identity: any = (own as any).motorcycle_identity;
    if (!identity) continue;
    const motorcycleId = identity.id;

    const [{ data: mantenimiento }, { data: reparaciones }, { data: llantas }, { data: bateria }, { data: documentos }] = await Promise.all([
      sb.from('motorcycle_maintenance_log').select('*').eq('motorcycle_id', motorcycleId).order('fecha_servicio', { ascending: false }).limit(10),
      sb.from('motorcycle_repairs').select('*').eq('motorcycle_id', motorcycleId).order('fecha_inicio', { ascending: false }).limit(10),
      sb.from('motorcycle_tires').select('*').eq('motorcycle_id', motorcycleId),
      sb.from('motorcycle_battery').select('*').eq('motorcycle_id', motorcycleId).order('fecha_instalacion', { ascending: false }).limit(1),
      sb.from('rider_documents').select('*').eq('motorcycle_id', motorcycleId).order('fecha_vencimiento', { ascending: true }),
    ]);

    const documentosConAlerta = (documentos ?? []).map((d: any) => ({ ...d, alerta: estadoVencimiento(d.fecha_vencimiento) }));

    motos.push({
      ownership_id: own.id,
      identity,
      mantenimiento: mantenimiento ?? [],
      reparaciones: reparaciones ?? [],
      llantas: llantas ?? [],
      bateria: (bateria ?? [])[0] ?? null,
      documentos: documentosConAlerta,
      alertas: documentosConAlerta.filter((d: any) => d.alerta === 'vencido' || d.alerta === 'proximo').length,
    });
  }

  return motos;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  // ---------- Público: registrar un rider nuevo con su primera moto ----------
  // Punto de entrada que hoy no existe en ningún otro lado del sitio: el
  // login de arriba asume que el rider ya está en la base. Esta acción crea
  // el rider (si el teléfono no existe) y su motorcycle_identity, y lo deja
  // ya logueado en su Hoja de Vida.
  if (action === 'registrar') {
    const nombre = (body.nombre || '').toString().trim();
    const candidatos = candidatosTelefono((body.telefono || '').toString());
    const telefono = telefonoCanonico((body.telefono || '').toString());
    const marca = (body.marca || '').toString().trim();
    const modelo = (body.modelo || '').toString().trim();

    if (!nombre) return json({ ok: false, error: 'Escribe tu nombre' }, 400);
    if (!candidatos[0] || candidatos[0].length < 7) return json({ ok: false, error: 'Teléfono inválido' }, 400);
    if (!marca || !modelo) return json({ ok: false, error: 'Escribe marca y modelo de tu moto' }, 400);

    const { data: existentes } = await sb.from('riders').select('id').in('telefono', candidatos).limit(1);
    let riderId = existentes?.[0]?.id;

    if (!riderId) {
      // riders.id no tiene default: hay que generarlo aquí, igual que lo
      // hace rita-whatsapp/rita-v2 al registrar riders nuevos.
      riderId = crypto.randomUUID();
      const { error: riderError } = await sb.from('riders')
        .insert({ id: riderId, nombre, apellido: (body.apellido || '').toString().trim() || null, telefono, created_at: new Date().toISOString() });
      if (riderError) return json({ ok: false, error: riderError.message }, 500);
    }

    const placa = (body.placa || '').toString().trim().toUpperCase() || null;

    // Si la placa ya existe, esa moto ya tiene una identidad (y probablemente
    // un dueño). No se reasigna aquí en silencio — eso saltaría por completo
    // la validación del traspaso. El camino correcto es que el dueño actual
    // transfiera la moto desde su propia Hoja de Vida.
    if (placa) {
      const { data: existenteMoto } = await sb.from('motorcycle_identity').select('id').eq('placa', placa).maybeSingle();
      if (existenteMoto) {
        return json({ ok: false, error: 'Esa placa ya está registrada en Ridera. Si es tuya, pídele al dueño actual que la transfiera desde su Hoja de Vida.' }, 409);
      }
    }

    const { data: nuevaMoto, error: motoError } = await sb.from('motorcycle_identity')
      .insert({ marca, modelo, cc: body.cc ? Number(body.cc) : null, placa })
      .select('id').single();
    if (motoError) return json({ ok: false, error: motoError.message }, 500);

    const { error: ownError } = await sb.from('rider_motorcycles').insert({
      rider_id: riderId, motorcycle_id: nuevaMoto.id, marca, modelo,
      cc: body.cc ? Number(body.cc) : null, placa, esta_activa: true,
    });
    if (ownError) return json({ ok: false, error: ownError.message }, 500);

    const token = await firmarSesionRider(riderId);
    return json({ ok: true, token, rider: { nombre, apellido: body.apellido || null } });
  }

  // ---------- Público: entrar con el teléfono ----------
  // Mismo criterio que el chat del club (PR #61): pedir un código cada vez
  // es fricción para lo que protege — ver tu propio historial de moto. Si
  // esto se abre a un flujo con más en juego (ej. traspasos), conviene el
  // código por WhatsApp que ya existe en club-members.
  if (action === 'login') {
    const candidatos = candidatosTelefono((body.telefono || '').toString());
    if (!candidatos[0] || candidatos[0].length < 7) return json({ ok: false, error: 'Teléfono inválido' }, 400);

    const { data: riders } = await sb.from('riders')
      .select('id, nombre, apellido, telefono')
      .in('telefono', candidatos)
      .limit(1);
    const rider = riders?.[0];

    if (!rider) return json({ ok: false, error: 'No encontramos ese número registrado en Ridera.' }, 404);

    const token = await firmarSesionRider(rider.id);
    return json({ ok: true, token, rider: { nombre: rider.nombre, apellido: rider.apellido } });
  }

  // ---------- Autenticado: ver la hoja de vida ----------
  if (action === 'hoja') {
    const riderId = await riderIdDeSesion(req);
    if (!riderId) return json({ ok: false, error: 'Sesión inválida o vencida' }, 401);
    const motos = await obtenerHojaDeVida(sb, riderId);
    return json({ ok: true, motos });
  }

  // ---------- Autenticado: registrar un mantenimiento ----------
  if (action === 'registrar_mantenimiento') {
    const riderId = await riderIdDeSesion(req);
    if (!riderId) return json({ ok: false, error: 'Sesión inválida o vencida' }, 401);

    const motorcycleId = (body.motorcycle_id || '').toString();
    const tipo = (body.tipo_mantenimiento || '').toString();
    const tiposValidos = ['cambio_aceite', 'cambio_filtros', 'revision_frenos', 'limpieza_cadena', 'revision_neumaticos', 'inspeccion_general', 'otro'];
    if (!motorcycleId || !tiposValidos.includes(tipo)) return json({ ok: false, error: 'Datos inválidos' }, 400);

    // Confirma que la moto es del rider de la sesión (dueño actual), para
    // que nadie pueda escribir historial en una moto que no le pertenece.
    const { data: own } = await sb.from('rider_motorcycles')
      .select('id')
      .eq('rider_id', riderId).eq('motorcycle_id', motorcycleId).is('fecha_fin_propiedad', null)
      .maybeSingle();
    if (!own) return json({ ok: false, error: 'Esa moto no está a tu nombre' }, 403);

    const { error } = await sb.from('motorcycle_maintenance_log').insert({
      motorcycle_id: motorcycleId,
      rider_id: riderId,
      tipo_mantenimiento: tipo,
      km_actual: body.km_actual ? Number(body.km_actual) : null,
      fecha_servicio: body.fecha_servicio || new Date().toISOString().slice(0, 10),
      proveedor: body.proveedor || null,
      costo: body.costo ? Number(body.costo) : null,
      resultado: body.resultado || null,
    });
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true });
  }

  // ---------- Autenticado: transferir la moto a otro rider ----------
  if (action === 'iniciar_traspaso') {
    const riderId = await riderIdDeSesion(req);
    if (!riderId) return json({ ok: false, error: 'Sesión inválida o vencida' }, 401);

    const motorcycleId = (body.motorcycle_id || '').toString();
    if (!motorcycleId) return json({ ok: false, error: 'Falta la moto a transferir' }, 400);

    // Solo el dueño actual puede iniciar el traspaso.
    const { data: own } = await sb.from('rider_motorcycles')
      .select('id')
      .eq('rider_id', riderId).eq('motorcycle_id', motorcycleId).is('fecha_fin_propiedad', null)
      .maybeSingle();
    if (!own) return json({ ok: false, error: 'Esa moto no está a tu nombre' }, 403);

    const candidatos = candidatosTelefono((body.telefono_nuevo_dueno || '').toString());
    if (!candidatos[0] || candidatos[0].length < 7) return json({ ok: false, error: 'Teléfono inválido' }, 400);

    const { data: nuevoRiders } = await sb.from('riders').select('id, nombre').in('telefono', candidatos).limit(1);
    const nuevoRider = nuevoRiders?.[0];
    if (!nuevoRider) return json({ ok: false, error: 'No encontramos ese número en Ridera. La otra persona debe registrarse primero.' }, 404);
    if (nuevoRider.id === riderId) return json({ ok: false, error: 'Ese número ya es el tuyo' }, 400);

    const { error } = await sb.rpc('transfer_motorcycle_ownership', {
      p_motorcycle_id: motorcycleId,
      p_new_rider_id: nuevoRider.id,
      p_documento_transferencia: body.documento_transferencia || null,
    });
    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true, nuevo_dueno: nuevoRider.nombre });
  }

  return json({ ok: false, error: 'Acción no reconocida' }, 400);
});
