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
    // PostgREST reserves , . : ( ) inside filter values (used by the or=(...) syntax);
    // backslash-escape them so user input can't inject extra filter clauses.
    const safeSearch = search.replace(/[\\,.:()]/g, c => `\\${c}`);
    filter += `&or=(preferred_name.ilike.*${encodeURIComponent(safeSearch)}*,phone_number.ilike.*${encodeURIComponent(safeSearch)}*)`;
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
    'talleres?select=id,nombre,ciudad,telefono,email,instagram,direccion,barrio,aprobado,logo_url,estado,created_at&order=created_at.desc&limit=200'
  );
  return { ok: true, talleres: rows };
}

async function listAlmacenes() {
  const rows = await sbGet(
    'almacenes?select=id,nombre,ciudad,telefono,email,direccion,barrio,aprobado,logo_url,slug,status,estado,created_at&order=created_at.desc&limit=200'
  );
  return { ok: true, almacenes: rows };
}

async function listHoteles() {
  const rows = await sbGet(
    'hoteles?select=id,nombre,municipio,subregion,telefono,email,whatsapp,contacto_nombre,tipo_alojamiento,parqueadero_motos,aprobado,estado,created_at&order=created_at.desc&limit=200'
  );
  return { ok: true, hoteles: rows };
}

async function listRestaurantes() {
  const rows = await sbGet(
    'restaurantes?select=id,nombre,municipio,subregion,telefono,email,whatsapp,contacto_nombre,tipo_cocina,parqueadero_motos,aprobado,estado,created_at&order=created_at.desc&limit=200'
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

async function getCrmMetrics() {
  try {
    const [riders, sellos, gruas, rita, talleres, almacenes, hoteles, restaurantes] = await Promise.all([
      sbCount('riders'),
      sbCount('sellos'),
      sbCount('solicitudes'),
      sbCount('rita_ai_logs'),
      sbCount('talleres'),
      sbCount('almacenes'),
      sbCount('hoteles'),
      sbCount('restaurantes'),
    ]);

    const res1 = await fetch(`${SB_URL}/rest/v1/riders?created_at=gte.${new Date(Date.now() - 30*24*60*60*1000).toISOString()}&select=id`, {
      headers: sbHeaders,
    });
    const ridersNuevos = await res1.json();

    const res2 = await fetch(`${SB_URL}/rest/v1/sellos?select=municipio_id`, { headers: sbHeaders });
    const sellosRows = await res2.json();
    const sellosDistinct = [...new Set((Array.isArray(sellosRows) ? sellosRows : []).map(r => r.municipio_id))];

    const res3 = await fetch(`${SB_URL}/rest/v1/solicitudes?estado=eq.pendiente&select=id`, { headers: sbHeaders });
    const gruasPendientes = await res3.json();

    const res4 = await fetch(`${SB_URL}/rest/v1/talleres?aprobado=eq.true&select=id`, { headers: sbHeaders });
    const talleresAprobados = await res4.json();

    const res5 = await fetch(`${SB_URL}/rest/v1/almacenes?aprobado=eq.true&select=id`, { headers: sbHeaders });
    const almacenesAprobados = await res5.json();

    const res6 = await fetch(`${SB_URL}/rest/v1/hoteles?aprobado=eq.true&select=id`, { headers: sbHeaders });
    const hotelesAprobados = await res6.json();

    const res7 = await fetch(`${SB_URL}/rest/v1/restaurantes?aprobado=eq.true&select=id`, { headers: sbHeaders });
    const restaurantesAprobados = await res7.json();

    // rita_conversations is effectively unused; count distinct phones in rita_messages instead.
    const res8 = await fetch(`${SB_URL}/rest/v1/rita_messages?select=phone&limit=5000`, { headers: sbHeaders });
    const ritaMsgRows = await res8.json();
    const ritaConvs = [...new Set((Array.isArray(ritaMsgRows) ? ritaMsgRows : []).map(r => r.phone).filter(Boolean))];

    const alerts = [];
    if (gruasPendientes.length > 5) alerts.push({ tipo: 'Grúas', mensaje: `${gruasPendientes.length} solicitudes pendientes` });
    if (talleresAprobados.length < talleres) alerts.push({ tipo: 'Talleres', mensaje: `${talleres - talleresAprobados.length} pendientes de aprobación` });
    if (almacenesAprobados.length < almacenes) alerts.push({ tipo: 'Almacenes', mensaje: `${almacenes - almacenesAprobados.length} pendientes de aprobación` });
    if (hotelesAprobados.length < hoteles) alerts.push({ tipo: 'Hoteles', mensaje: `${hoteles - hotelesAprobados.length} pendientes de aprobación` });
    if (restaurantesAprobados.length < restaurantes) alerts.push({ tipo: 'Restaurantes', mensaje: `${restaurantes - restaurantesAprobados.length} pendientes de aprobación` });

    // Leads estancados (interesado/documentos > 7 días sin avanzar)
    const staleThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const staleTables = ['talleres', 'almacenes', 'hoteles', 'restaurantes'];
    const staleResults = await Promise.all(staleTables.map(t =>
      fetch(`${SB_URL}/rest/v1/${t}?estado=in.(interesado,documentos)&created_at=lt.${staleThreshold}&select=id`, { headers: sbHeaders })
        .then(r => r.json())
        .catch(() => [])
    ));
    staleResults.forEach((rows, i) => {
      if (Array.isArray(rows) && rows.length > 0) {
        const label = { talleres: 'Talleres', almacenes: 'Almacenes', hoteles: 'Hoteles', restaurantes: 'Restaurantes' }[staleTables[i]];
        alerts.push({ tipo: `${label} estancados`, mensaje: `${rows.length} leads sin avanzar hace más de 7 días` });
      }
    });

    return {
      ok: true,
      riders_total: riders,
      riders_nuevos: ridersNuevos.length,
      sellos_total: sellos,
      municipios_cubiertos: sellosDistinct.length,
      gruas_total: gruas,
      gruas_pendientes: gruasPendientes.length,
      rita_logs_total: rita,
      rita_chats: ritaConvs.length,
      talleres_total: talleres,
      talleres_aprobados: talleresAprobados.length,
      almacenes_total: almacenes,
      almacenes_aprobados: almacenesAprobados.length,
      hoteles_total: hoteles,
      hoteles_aprobados: hotelesAprobados.length,
      restaurantes_total: restaurantes,
      restaurantes_aprobados: restaurantesAprobados.length,
      alerts,
    };
  } catch (err) {
    console.error('getCrmMetrics error:', err);
    return { ok: false, error: err.message };
  }
}

function last10Digits(phone) {
  return (phone || '').replace(/\D/g, '').slice(-10);
}

async function listConversaciones() {
  try {
    // rita_conversations is effectively unused (single legacy row); the real
    // conversation log lives in rita_messages, grouped here by phone.
    const msgs = await sbGet('rita_messages?select=phone,role,created_at&order=created_at.desc&limit=2000');
    const [errores, solicitudes] = await Promise.all([
      sbGet('rita_errores_reportados?select=whatsapp_number'),
      sbGet('solicitudes?select=cliente_telefono&order=created_at.desc&limit=1000'),
    ]);

    const errorSuffixes = new Set(errores.map(e => last10Digits(e.whatsapp_number)).filter(Boolean));
    const gruaSuffixes = new Set(solicitudes.map(s => last10Digits(s.cliente_telefono)).filter(Boolean));

    const byPhone = {};
    msgs.forEach(m => {
      if (!m.phone) return;
      if (!byPhone[m.phone]) {
        byPhone[m.phone] = { telefono: m.phone, mensaje_count: 0, lastRole: m.role, updated_at: m.created_at };
      }
      byPhone[m.phone].mensaje_count += 1;
    });

    const resultado = Object.values(byPhone).map(c => {
      const suffix = last10Digits(c.telefono);
      return {
        telefono: c.telefono,
        mensaje_count: c.mensaje_count,
        sin_respuesta: c.lastRole === 'user',
        con_error: errorSuffixes.has(suffix),
        pidio_grua: gruaSuffixes.has(suffix),
        updated_at: c.updated_at,
      };
    }).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    return { ok: true, conversaciones: resultado };
  } catch (err) {
    console.error('listConversaciones error:', err);
    return { ok: false, error: err.message };
  }
}

async function getRiderProfile(riderId) {
  try {
    const riders = await sbGet(`riders?id=eq.${encodeURIComponent(riderId)}&select=*&limit=1`);
    if (!riders.length) return { ok: false, error: 'Rider no encontrado' };
    const rider = riders[0];

    // Phone numbers are stored inconsistently across tables (local "3001234567" vs
    // international "573001234567" / "+573001234567"), so match on the last 10 digits.
    const phoneSuffix = (rider.telefono || '').replace(/\D/g, '').slice(-10);
    const phoneFilter = phoneSuffix ? `*${encodeURIComponent(phoneSuffix)}` : '';

    const sellos = await sbGet(`sellos?rider_id=eq.${encodeURIComponent(riderId)}&select=id,municipio_id,fecha,estado&order=fecha.desc`);
    const gruas = phoneSuffix
      ? await sbGet(`solicitudes?cliente_telefono=like.${phoneFilter}&select=id,municipio,estado,created_at&order=created_at.desc&limit=20`)
      : [];
    const conversaciones = phoneSuffix
      ? await sbGet(`rita_messages?phone=like.${phoneFilter}&select=phone,content,created_at&order=created_at.desc&limit=20`)
      : [];

    const muniMap = {};
    const municipios = await sbGet('municipios?select=id,nombre');
    municipios.forEach(m => muniMap[m.id] = m.nombre);

    const sellosConNombre = sellos.map(s => ({
      ...s,
      municipio_nombre: muniMap[s.municipio_id] || '—',
    }));

    return {
      ok: true,
      rider,
      sellos: sellosConNombre,
      gruas,
      conversaciones,
    };
  } catch (err) {
    console.error('getRiderProfile error:', err);
    return { ok: false, error: err.message };
  }
}

async function changeNegocioEstado(table, id, estado) {
  const allowed = ['talleres', 'almacenes', 'hoteles', 'restaurantes'];
  const validEstados = ['interesado', 'documentos', 'aprobado', 'activo', 'inactivo'];
  if (!allowed.includes(table)) return { ok: false, error: 'Tabla no válida' };
  if (!validEstados.includes(estado)) return { ok: false, error: 'Estado no válido' };

  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
      { method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify({ estado }) }
    );
    return { ok: res.ok };
  } catch (err) {
    console.error('changeNegocioEstado error:', err);
    return { ok: false, error: err.message };
  }
}

async function getReportes() {
  try {
    const riders = await sbGet('riders?select=created_at&order=created_at.asc&limit=1000');
    const gruas = await sbGet('solicitudes?select=municipio&limit=1000');
    const [negTalleres, negAlmacenes, negHoteles, negRestaurantes] = await Promise.all([
      sbGet('talleres?select=estado&limit=1000'),
      sbGet('almacenes?select=estado&limit=1000'),
      sbGet('hoteles?select=estado&limit=1000'),
      sbGet('restaurantes?select=estado&limit=1000'),
    ]);
    const negocios = [...negTalleres, ...negAlmacenes, ...negHoteles, ...negRestaurantes];

    // Riders por mes
    const monthMap = {};
    riders.forEach(r => {
      if (r.created_at) {
        const month = r.created_at.substring(0, 7);
        monthMap[month] = (monthMap[month] || 0) + 1;
      }
    });
    const ridersPerMonth = {
      labels: Object.keys(monthMap).sort(),
      values: Object.keys(monthMap).sort().map(m => monthMap[m]),
    };

    // Grúas por municipio (top 10)
    const muniMap = {};
    gruas.forEach(g => {
      if (g.municipio) {
        muniMap[g.municipio] = (muniMap[g.municipio] || 0) + 1;
      }
    });
    const sorted = Object.entries(muniMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const gruasByMunicipio = {
      labels: sorted.map(s => s[0]),
      values: sorted.map(s => s[1]),
    };

    // Estados de negocios
    const estadoMap = { interesado: 0, documentos: 0, aprobado: 0, activo: 0, inactivo: 0 };
    negocios.forEach(n => {
      const estado = n.estado || 'interesado';
      estadoMap[estado] = (estadoMap[estado] || 0) + 1;
    });
    const negociosEstado = {
      labels: Object.keys(estadoMap),
      values: Object.values(estadoMap),
    };

    // Tasa de conversión
    const interesados = negocios.filter(n => (n.estado || 'interesado') === 'interesado').length;
    const activos = negocios.filter(n => n.estado === 'activo').length;
    const conversionRate = interesados > 0 ? activos / interesados : 0;

    return {
      ok: true,
      ridersPerMonth,
      gruasByMunicipio,
      negociosEstado,
      conversionRate,
      negociosInteresados: interesados,
      negociosActivos: activos,
    };
  } catch (err) {
    console.error('getReportes error:', err);
    return { ok: false, error: err.message };
  }
}

async function exportReport(type) {
  try {
    let data, filename, headers;

    if (type === 'riders') {
      data = await sbGet('riders?select=id,nombre,apellido,telefono,ciudad,moto_marca,moto_modelo,created_at&order=created_at.desc&limit=1000');
      headers = ['ID', 'Nombre', 'Apellido', 'Teléfono', 'Ciudad', 'Moto Marca', 'Moto Modelo', 'Fecha Registro'];
      filename = 'riders';
    } else if (type === 'gruas') {
      data = await sbGet('solicitudes?select=id,cliente_nombre,cliente_telefono,municipio,estado,created_at&order=created_at.desc&limit=1000');
      headers = ['ID', 'Cliente', 'Teléfono', 'Municipio', 'Estado', 'Fecha'];
      filename = 'gruas';
    } else if (type === 'negocios') {
      const talleres = await sbGet('talleres?select=id,nombre,ciudad,telefono,estado,created_at&order=created_at.desc&limit=500');
      const almacenes = await sbGet('almacenes?select=id,nombre,ciudad,telefono,estado,created_at&order=created_at.desc&limit=500');
      const hoteles = (await sbGet('hoteles?select=id,nombre,municipio,telefono,estado,created_at&order=created_at.desc&limit=500'))
        .map(h => ({ ...h, ciudad: h.municipio }));
      const restaurantes = (await sbGet('restaurantes?select=id,nombre,municipio,telefono,estado,created_at&order=created_at.desc&limit=500'))
        .map(r => ({ ...r, ciudad: r.municipio }));
      data = [...talleres, ...almacenes, ...hoteles, ...restaurantes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      headers = ['ID', 'Nombre', 'Ciudad', 'Teléfono', 'Estado', 'Fecha'];
      filename = 'negocios';
    } else if (type === 'sellos') {
      data = await sbGet('sellos?select=id,rider_id,municipio_id,fecha,estado&order=fecha.desc&limit=1000');
      headers = ['ID', 'Rider ID', 'Municipio ID', 'Fecha', 'Estado'];
      filename = 'sellos';
    } else {
      return { ok: false, error: 'Tipo desconocido' };
    }

    const csv = [headers.join(','), ...data.map(row => headers.map(h => {
      const key = h.toLowerCase().replace(/\s+/g, '_');
      let val = row[key] || '';
      if (typeof val === 'string' && val.includes(',')) val = `"${val}"`;
      return val;
    }).join(','))].join('\n');

    return { ok: true, csv };
  } catch (err) {
    console.error('exportReport error:', err);
    return { ok: false, error: err.message };
  }
}

async function listNotes(entityType, entityId) {
  try {
    if (!entityType || !entityId) return { ok: false, error: 'Faltan entity_type y entity_id' };
    const notes = await sbGet(`crm_notes?entity_type=eq.${encodeURIComponent(entityType)}&entity_id=eq.${encodeURIComponent(entityId)}&select=id,note,created_at&order=created_at.desc`);
    return { ok: true, notes };
  } catch (err) {
    console.error('listNotes error:', err);
    return { ok: false, error: err.message };
  }
}

async function addNote(entityType, entityId, note) {
  try {
    if (!entityType || !entityId || !note) return { ok: false, error: 'Faltan entity_type, entity_id o note' };
    const res = await fetch(`${SB_URL}/rest/v1/crm_notes`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, note }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.message || 'Error al guardar nota' };
    return { ok: true, note: data[0] };
  } catch (err) {
    console.error('addNote error:', err);
    return { ok: false, error: err.message };
  }
}

async function deleteNote(id) {
  try {
    if (!id) return { ok: false, error: 'Falta id' };
    const res = await fetch(`${SB_URL}/rest/v1/crm_notes?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: sbHeaders });
    if (!res.ok) return { ok: false, error: 'Error al borrar nota' };
    return { ok: true };
  } catch (err) {
    console.error('deleteNote error:', err);
    return { ok: false, error: err.message };
  }
}

async function globalSearch(query) {
  try {
    const q = (query || '').trim();
    if (!q || q.length < 2) return { ok: true, results: [] };
    // PostgREST reserves , . : ( ) inside filter values (used by the or=(...) syntax);
    // backslash-escape them so user input can't inject extra filter clauses.
    const safe = q.replace(/[\\,.:()]/g, c => `\\${c}`);
    const esc = encodeURIComponent(`*${safe}*`);
    const results = [];

    const riders = await sbGet(`riders?or=(nombre.ilike.${esc},apellido.ilike.${esc},telefono.ilike.${esc})&select=id,nombre,apellido,telefono,ciudad&limit=10`);
    riders.forEach(r => results.push({ type: 'rider', id: r.id, title: `${r.nombre || ''} ${r.apellido || ''}`.trim(), subtitle: `${r.telefono || ''} · ${r.ciudad || ''}` }));

    const talleres = await sbGet(`talleres?or=(nombre.ilike.${esc},telefono.ilike.${esc})&select=id,nombre,telefono,ciudad&limit=10`);
    talleres.forEach(t => results.push({ type: 'negocio_taller', id: t.id, title: t.nombre, subtitle: `Taller · ${t.telefono || ''} · ${t.ciudad || ''}` }));

    const almacenes = await sbGet(`almacenes?or=(nombre.ilike.${esc},telefono.ilike.${esc})&select=id,nombre,telefono,ciudad&limit=10`);
    almacenes.forEach(a => results.push({ type: 'negocio_almacen', id: a.id, title: a.nombre, subtitle: `Almacén · ${a.telefono || ''} · ${a.ciudad || ''}` }));

    const hoteles = await sbGet(`hoteles?or=(nombre.ilike.${esc},telefono.ilike.${esc})&select=id,nombre,telefono,municipio&limit=10`);
    hoteles.forEach(h => results.push({ type: 'negocio_hotel', id: h.id, title: h.nombre, subtitle: `Hotel · ${h.telefono || ''} · ${h.municipio || ''}` }));

    const restaurantes = await sbGet(`restaurantes?or=(nombre.ilike.${esc},telefono.ilike.${esc})&select=id,nombre,telefono,municipio&limit=10`);
    restaurantes.forEach(r => results.push({ type: 'negocio_restaurante', id: r.id, title: r.nombre, subtitle: `Restaurante · ${r.telefono || ''} · ${r.municipio || ''}` }));

    return { ok: true, results: results.slice(0, 30) };
  } catch (err) {
    console.error('globalSearch error:', err);
    return { ok: false, error: err.message };
  }
}

async function getTimeline() {
  try {
    const events = [];

    // Riders
    const riders = await sbGet('riders?select=id,nombre,apellido,ciudad,created_at&order=created_at.desc&limit=300');
    riders.forEach(r => events.push({
      timestamp: r.created_at,
      type: 'rider',
      title: `Nuevo rider: ${r.nombre} ${r.apellido}`,
      location: r.ciudad,
      id: r.id,
    }));

    // Solicitudes (grúas)
    const solicitudes = await sbGet('solicitudes?select=id,cliente_nombre,municipio,created_at&order=created_at.desc&limit=300');
    solicitudes.forEach(s => events.push({
      timestamp: s.created_at,
      type: 'grua',
      title: `Solicitud grúa: ${s.cliente_nombre}`,
      location: s.municipio,
      id: s.id,
    }));

    // Talleres
    const talleres = await sbGet('talleres?select=id,nombre,ciudad,estado,created_at&order=created_at.desc&limit=200');
    talleres.forEach(t => events.push({
      timestamp: t.created_at,
      type: 'negocio_taller',
      title: `Nuevo taller: ${t.nombre} (${t.estado})`,
      location: t.ciudad,
      id: t.id,
    }));

    // Almacenes
    const almacenes = await sbGet('almacenes?select=id,nombre,ciudad,estado,created_at&order=created_at.desc&limit=200');
    almacenes.forEach(a => events.push({
      timestamp: a.created_at,
      type: 'negocio_almacen',
      title: `Nuevo almacén: ${a.nombre} (${a.estado})`,
      location: a.ciudad,
      id: a.id,
    }));

    // Hoteles
    const hoteles = await sbGet('hoteles?select=id,nombre,municipio,estado,created_at&order=created_at.desc&limit=200');
    hoteles.forEach(h => events.push({
      timestamp: h.created_at,
      type: 'negocio_hotel',
      title: `Nuevo hotel: ${h.nombre} (${h.estado})`,
      location: h.municipio,
      id: h.id,
    }));

    // Restaurantes
    const restaurantes = await sbGet('restaurantes?select=id,nombre,municipio,estado,created_at&order=created_at.desc&limit=200');
    restaurantes.forEach(r => events.push({
      timestamp: r.created_at,
      type: 'negocio_restaurante',
      title: `Nuevo restaurante: ${r.nombre} (${r.estado})`,
      location: r.municipio,
      id: r.id,
    }));

    // Sellos
    const sellos = await sbGet('sellos?select=id,rider_id,municipio_id,fecha&order=fecha.desc&limit=300');
    sellos.forEach(s => events.push({
      timestamp: s.fecha,
      type: 'sello',
      title: `Sello registrado (Rider: ${s.rider_id})`,
      municipio_id: s.municipio_id,
      id: s.id,
    }));

    // Rita conversations — rita_conversations is effectively unused (single legacy
    // row); the real conversation log lives in rita_messages, one event per phone.
    const ritaMsgs = await sbGet('rita_messages?select=phone,role,created_at&order=created_at.desc&limit=2000');
    const ritaByPhone = {};
    ritaMsgs.forEach(m => {
      if (!m.phone || ritaByPhone[m.phone]) return;
      ritaByPhone[m.phone] = m;
    });
    Object.values(ritaByPhone).forEach(m => events.push({
      timestamp: m.created_at,
      type: 'rita',
      title: `Conversación Rita: ${m.phone}`,
      estado: m.role === 'user' ? 'sin_respuesta' : 'respondido',
      id: m.phone,
    }));

    // Sort by timestamp descending
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return { ok: true, events: events.slice(0, 200) };
  } catch (err) {
    console.error('getTimeline error:', err);
    return { ok: false, error: err.message };
  }
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

    case 'crm_metrics':
      return json(await getCrmMetrics());

    case 'list_conversaciones':
      return json(await listConversaciones());

    case 'get_rider_profile':
      if (!body.rider_id) return json({ ok: false, error: 'Falta rider_id' });
      return json(await getRiderProfile(body.rider_id));

    case 'change_negocio_estado':
      if (!body.table || !body.id || !body.estado) return json({ ok: false, error: 'Faltan table, id o estado' });
      return json(await changeNegocioEstado(body.table, body.id, body.estado));

    case 'get_reportes':
      return json(await getReportes());

    case 'export_report':
      if (!body.type) return json({ ok: false, error: 'Falta type' });
      return json(await exportReport(body.type));

    case 'get_timeline':
      return json(await getTimeline());

    case 'global_search':
      return json(await globalSearch(body.query));

    case 'list_notes':
      return json(await listNotes(body.entity_type, body.entity_id));

    case 'add_note':
      return json(await addNote(body.entity_type, body.entity_id, body.note));

    case 'delete_note':
      if (!body.id) return json({ ok: false, error: 'Falta id' });
      return json(await deleteNote(body.id));

    default:
      return json({ ok: false, error: `Acción "${action}" no válida` });
  }
};
