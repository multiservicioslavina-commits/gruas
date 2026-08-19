const SB_URL = process.env.SUPABASE_URL || 'https://vzzxsdtsaahhzyctvmhx.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GRAPH = 'https://graph.facebook.com/v19.0';
const FN_ADMIN = `${SB_URL}/functions/v1/admin-grueros`;

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
  return { statusCode: 200, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
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
  } catch { return false; }
}

async function sendWA(to, text) {
  const res = await fetch(`${GRAPH}/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
}

const MSG_RECORDATORIO = `¡Hola! 🏍️ Soy *Rita*, la asistente de *Ridera*.

Te recuerdo que puedo ayudarte con:
🔧 Buscar talleres y almacenes de motos
📍 Planear rutas y aventuras
🏆 Info sobre el Pasaporte Ridera 125
🆘 Emergencias en carretera
🏪 Encontrar repuestos y accesorios

Escríbeme cuando necesites algo, estoy aquí para ayudarte.

Y cuéntame: *¿cómo te gustaría que te llame?* 😊`;

const MSG_CONSENTIMIENTO = `Para poder enviarte info útil sobre rutas, eventos, promos y novedades del mundo motero, necesito tu autorización.

¿Aceptas recibir mensajes de Ridera? Responde *SÍ* o *NO*.

(Puedes darte de baja en cualquier momento escribiendo BAJA)`;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return json({ ok: false, error: 'POST only' });

  let body;
  try { body = JSON.parse(event.body); } catch { return json({ ok: false, error: 'JSON inválido' }); }

  const { key, action } = body;
  if (!key) return json({ ok: false, error: 'Falta clave admin' });
  if (!(await validateKey(key))) return json({ ok: false, error: 'Clave inválida' });

  if (!WA_TOKEN || !WA_PHONE_ID) return json({ ok: false, error: 'Faltan credenciales WhatsApp' });

  if (action === 'preview') {
    const res = await fetch(`${SB_URL}/rest/v1/rita_contacts?select=phone_number,preferred_name,opted_in,last_seen_at&order=last_seen_at.desc`, { headers: sbHeaders });
    const contacts = await res.json();
    const sinNombre = contacts.filter(c => !c.preferred_name);
    const sinConsentimiento = contacts.filter(c => c.opted_in === null || c.opted_in === undefined);
    return json({
      ok: true,
      total: contacts.length,
      sinNombre: sinNombre.length,
      sinConsentimiento: sinConsentimiento.length,
      contacts: contacts.map(c => ({
        phone: c.phone_number,
        nombre: c.preferred_name || null,
        opted_in: c.opted_in,
        last_seen: c.last_seen_at,
      })),
    });
  }

  if (action === 'enviar_recordatorio') {
    const res = await fetch(
      `${SB_URL}/rest/v1/rita_contacts?select=phone_number,preferred_name&order=last_seen_at.desc`,
      { headers: sbHeaders },
    );
    const contacts = await res.json();
    const targets = contacts.filter(c => !c.preferred_name);

    let sent = 0, errors = 0;
    const errorDetails = [];

    for (const c of targets) {
      const result = await sendWA(c.phone_number, MSG_RECORDATORIO);
      if (result.ok) {
        sent++;
      } else {
        errors++;
        if (errorDetails.length < 10) {
          errorDetails.push({
            phone: '...' + (c.phone_number || '').slice(-4),
            status: result.status,
            error: result.body?.error?.message || 'unknown',
          });
        }
      }
      // Pausa para no saturar la API
      await new Promise(r => setTimeout(r, 200));
    }

    return json({ ok: true, sent, errors, total: targets.length, errorDetails });
  }

  if (action === 'enviar_consentimiento') {
    const res = await fetch(
      `${SB_URL}/rest/v1/rita_contacts?opted_in=is.null&select=phone_number`,
      { headers: sbHeaders },
    );
    const contacts = await res.json();

    let sent = 0, errors = 0;
    for (const c of contacts) {
      const result = await sendWA(c.phone_number, MSG_CONSENTIMIENTO);
      if (result.ok) sent++;
      else errors++;
      await new Promise(r => setTimeout(r, 200));
    }

    return json({ ok: true, sent, errors, total: contacts.length });
  }

  return json({ ok: false, error: `Acción "${action}" no válida` });
};
