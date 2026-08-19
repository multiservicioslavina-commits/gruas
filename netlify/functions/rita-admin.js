// netlify/functions/rita-admin.js
//
// Backend admin para Rita: analíticas, gestión de contactos y broadcasts.
// Reutiliza la autenticación del Edge Function admin-grueros existente.

const SB_URL = process.env.SUPABASE_URL || 'https://vzzxsdtsaahhzyctvmhx.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const FN_ADMIN = `${SB_URL}/functions/v1/admin-grueros`;
const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GRAPH_VERSION = 'v19.0';

const sbHeaders = {
  'Content-Type': 'application/json',
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(data) {
  return {
    statusCode: 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

async function validateKey(key) {
  try {
    const res = await fetch(FN_ADMIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, action: 'list' }),
    });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

async function sbCount(filter) {
  const res = await fetch(`${SB_URL}/rest/v1/${filter}`, {
    headers: { ...sbHeaders, Prefer: 'count=exact', Range: '0-0' },
  });
  if (!res.ok) return 0;
  const range = res.headers.get('content-range') || '';
  const n = parseInt(range.split('/')[1] || '0', 10);
  return Number.isNaN(n) ? 0 : n;
}

async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!res.ok) return [];
  return res.json();
}

// ── Analytics ──────────────────────────────────────────────────────────

async function getAnalytics() {
  const now = new Date();

  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const startOfWeek = new Date(now);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  startOfWeek.setUTCHours(0, 0, 0, 0);

  const startOfMonth = new Date(now);
  startOfMonth.setDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

  const [totalContacts, optedIn, msgsToday, msgsWeek, msgsMonth] = await Promise.all([
    sbCount('rita_contacts?select=phone_number'),
    sbCount('rita_contacts?opted_in=eq.true&select=phone_number'),
    sbCount(`rita_messages?created_at=gte.${startOfDay.toISOString()}&select=id`),
    sbCount(`rita_messages?created_at=gte.${startOfWeek.toISOString()}&select=id`),
    sbCount(`rita_messages?created_at=gte.${startOfMonth.toISOString()}&select=id`),
  ]);

  const [intentRows, dailyRows, activeTodayRows, recentContacts] = await Promise.all([
    sbGet(`rita_messages?role=eq.user&created_at=gte.${thirtyDaysAgo}&select=content&limit=2000`),
    sbGet(`rita_messages?role=eq.user&created_at=gte.${sevenDaysAgo}&select=created_at&order=created_at.asc&limit=3000`),
    sbGet(`rita_messages?role=eq.user&created_at=gte.${startOfDay.toISOString()}&select=phone&limit=1000`),
    sbGet('rita_contacts?select=phone_number,preferred_name,last_seen_at,opted_in&order=last_seen_at.desc&limit=25'),
  ]);

  const intentCounts = {};
  for (const r of intentRows) {
    intentCounts['general'] = (intentCounts['general'] || 0) + 1;
  }

  const perDay = {};
  for (const r of dailyRows) {
    const day = r.created_at.slice(0, 10);
    perDay[day] = (perDay[day] || 0) + 1;
  }

  const activeToday = new Set(activeTodayRows.map(r => r.phone)).size;

  return {
    ok: true,
    totalContacts,
    optedIn,
    msgsToday,
    msgsWeek,
    msgsMonth,
    activeToday,
    intentCounts,
    perDay,
    recentContacts,
  };
}

// ── Contacts ───────────────────────────────────────────────────────────

async function getContacts(limit = 50, offset = 0, search = '') {
  let filter = `rita_contacts?select=phone_number,preferred_name,last_seen_at,opted_in&order=last_seen_at.desc&limit=${limit}&offset=${offset}`;
  if (search) {
    filter += `&or=(preferred_name.ilike.*${encodeURIComponent(search)}*,phone_number.ilike.*${encodeURIComponent(search)}*)`;
  }
  const res = await fetch(`${SB_URL}/rest/v1/${filter}`, {
    headers: { ...sbHeaders, Prefer: 'count=exact' },
  });
  if (!res.ok) return { ok: false, error: 'Error al consultar contactos' };
  const contacts = await res.json();
  const range = res.headers.get('content-range') || '';
  const total = parseInt(range.split('/')[1] || '0', 10);
  return { ok: true, contacts, total };
}

// ── Conversation ───────────────────────────────────────────────────────

async function getConversation(phoneNumber) {
  const msgs = await sbGet(
    `rita_messages?phone=eq.${encodeURIComponent(phoneNumber)}&select=role,content,created_at&order=created_at.desc&limit=50`
  );
  return { ok: true, messages: msgs.reverse() };
}

// ── Error reports ──────────────────────────────────────────────────────

async function getErrorReports(limit = 30, estado = '') {
  let filter = `rita_errores_reportados?select=id,whatsapp_number,descripcion,estado,prioridad,contexto,created_at&order=created_at.desc&limit=${limit}`;
  if (estado) filter += `&estado=eq.${encodeURIComponent(estado)}`;
  const reports = await sbGet(filter);
  return { ok: true, reports };
}

async function updateErrorReport(id, estado) {
  const res = await fetch(
    `${SB_URL}/rest/v1/rita_errores_reportados?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ estado, updated_at: new Date().toISOString() }),
    }
  );
  return { ok: res.ok };
}

// ── Export contacts ────────────────────────────────────────────────────

async function exportContacts() {
  const contacts = await sbGet(
    'rita_contacts?select=phone_number,preferred_name,last_seen_at,opted_in,created_at&order=last_seen_at.desc&limit=5000'
  );
  return { ok: true, contacts };
}

// ── Broadcast ──────────────────────────────────────────────────────────

async function sendBroadcast(templateName, languageCode, bodyParams) {
  if (!WA_TOKEN || !WA_PHONE_ID) {
    return { ok: false, error: 'Faltan credenciales de WhatsApp (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID)' };
  }
  if (!templateName) {
    return { ok: false, error: 'Falta el nombre del template' };
  }

  const contacts = await sbGet('rita_contacts?opted_in=eq.true&select=phone_number,preferred_name');
  if (!contacts.length) {
    return { ok: true, sent: 0, errors: 0, total: 0, message: 'No hay contactos suscritos' };
  }

  let sent = 0;
  let errors = 0;
  const errorDetails = [];

  for (const contact of contacts) {
    try {
      const resolvedParams = bodyParams.map(p =>
        p === '{{nombre}}' ? (contact.preferred_name || 'amigo') : p
      );

      const components = resolvedParams.length
        ? [{ type: 'body', parameters: resolvedParams.map(text => ({ type: 'text', text })) }]
        : [];

      const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${WA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${WA_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: contact.phone_number,
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode },
            components,
          },
        }),
      });

      if (res.ok) {
        sent++;
      } else {
        errors++;
        const errText = await res.text().catch(() => 'unknown');
        if (errorDetails.length < 5) {
          errorDetails.push({ phone: contact.phone_number.slice(-4), error: errText });
        }
      }
    } catch (e) {
      errors++;
      if (errorDetails.length < 5) {
        errorDetails.push({ phone: contact.phone_number.slice(-4), error: e.message });
      }
    }
  }

  return { ok: true, sent, errors, total: contacts.length, errorDetails };
}

// ── Directory sections ─────────────────────────────────────────────────

async function listSellos() {
  const rows = await sbGet(
    'sellos?select=id,rider_id,municipio_id,foto_url,fecha,estado,en_manada,created_at,riders(nombre)&order=created_at.desc&limit=200'
  );
  return { ok: true, sellos: rows };
}

async function listRiders() {
  const rows = await sbGet(
    'riders?select=id,nombre,apellido,ciudad,moto_marca,moto_modelo,moto_cc,telefono,correo,slug,created_at,placa,soat_vence,tecno_vence,notif_activa&order=created_at.desc&limit=200'
  );
  return { ok: true, riders: rows };
}

async function listClubs() {
  const rows = await sbGet(
    'clubs?select=id,nombre,codigo,logo_url,ciudad,aprobado,created_at,datos&order=created_at.desc&limit=100'
  );
  return { ok: true, clubs: rows };
}

async function listMotos() {
  const rows = await sbGet(
    'motos_venta?select=id,titulo,precio,ciudad,marca,modelo,anio,kilometraje,cilindraje,telefono,aprobado,destacado,vendido,foto1_url,created_at&order=created_at.desc&limit=200'
  );
  return { ok: true, motos: rows };
}

async function listTalleres() {
  const rows = await sbGet(
    'talleres?select=id,nombre,ciudad,telefono,email,instagram,direccion,barrio,aprobado,logo_url,created_at&order=created_at.desc&limit=200'
  );
  return { ok: true, talleres: rows };
}

async function listAlmacenes() {
  const rows = await sbGet(
    'almacenes?select=id,nombre,ciudad,telefono,email,direccion,barrio,aprobado,logo_url,slug,status,created_at&order=created_at.desc&limit=200'
  );
  return { ok: true, almacenes: rows };
}

async function listHoteles() {
  const rows = await sbGet(
    'hoteles?select=id,nombre,municipio,subregion,telefono,email,whatsapp,contacto_nombre,tipo_alojamiento,parqueadero_motos,aprobado,created_at&order=created_at.desc&limit=200'
  );
  return { ok: true, hoteles: rows };
}

async function listRestaurantes() {
  const rows = await sbGet(
    'restaurantes?select=id,nombre,municipio,subregion,telefono,email,whatsapp,contacto_nombre,tipo_cocina,parqueadero_motos,aprobado,created_at&order=created_at.desc&limit=200'
  );
  return { ok: true, restaurantes: rows };
}

async function toggleApproval(table, id, aprobado) {
  const allowed = ['talleres', 'almacenes', 'clubs', 'motos_venta', 'hoteles', 'restaurantes'];
  if (!allowed.includes(table)) return { ok: false, error: 'Tabla no válida' };
  const res = await fetch(
    `${SB_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    { method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify({ aprobado }) }
  );
  return { ok: res.ok };
}

async function updateSelloEstado(id, estado) {
  const res = await fetch(
    `${SB_URL}/rest/v1/sellos?id=eq.${encodeURIComponent(id)}`,
    { method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify({ estado }) }
  );
  return { ok: res.ok };
}

// ── Handler ────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return json({ ok: false, error: 'JSON inválido' });
  }

  const { key, action } = body;
  if (!key) return json({ ok: false, error: 'Falta clave de admin' });

  const valid = await validateKey(key);
  if (!valid) return json({ ok: false, error: 'Clave inválida' });

  switch (action) {
    case 'analytics':
      return json(await getAnalytics());

    case 'contacts':
      return json(await getContacts(body.limit, body.offset, body.search));

    case 'conversation':
      if (!body.phone) return json({ ok: false, error: 'Falta número de teléfono' });
      return json(await getConversation(body.phone));

    case 'broadcast':
      return json(await sendBroadcast(body.template, body.language || 'es_CO', body.params || []));

    case 'error_reports':
      return json(await getErrorReports(body.limit, body.estado));

    case 'update_error':
      if (!body.id || !body.estado) return json({ ok: false, error: 'Faltan id y estado' });
      return json(await updateErrorReport(body.id, body.estado));

    case 'export_contacts':
      return json(await exportContacts());

    case 'list_sellos':
      return json(await listSellos());

    case 'list_riders':
      return json(await listRiders());

    case 'list_clubs':
      return json(await listClubs());

    case 'list_motos':
      return json(await listMotos());

    case 'list_talleres':
      return json(await listTalleres());

    case 'list_almacenes':
      return json(await listAlmacenes());

    case 'list_hoteles':
      return json(await listHoteles());

    case 'list_restaurantes':
      return json(await listRestaurantes());

    case 'toggle_approval':
      if (!body.table || !body.id) return json({ ok: false, error: 'Faltan table e id' });
      return json(await toggleApproval(body.table, body.id, body.aprobado ?? true));

    case 'update_sello':
      if (!body.id || !body.estado) return json({ ok: false, error: 'Faltan id y estado' });
      return json(await updateSelloEstado(body.id, body.estado));

    default:
      return json({ ok: false, error: `Acción "${action}" no válida` });
  }
};
