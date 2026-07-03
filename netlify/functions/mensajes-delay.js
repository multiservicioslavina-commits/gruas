const GRAPH = 'https://graph.facebook.com/v21.0';
const PHONE_ID = process.env.WHATSAPP_PHONE_ID || '1162210376978137';
const TOKEN = process.env.WHATSAPP_TOKEN;
const SB_URL = process.env.SUPABASE_URL || 'https://vzzxsdtsaahhzyctvmhx.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const BASE_CALIFICA = 'https://gruas.ridera.com.co/califica.html?t=';
const BASE_MIMOTO = 'https://gruas.ridera.com.co/mimoto.html?c=';

function normalizePhone(raw) {
  let d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  d = d.replace(/^0+/, '');
  if (d.startsWith('57') && d.length >= 12) return d;
  if (d.length === 10) return '57' + d;
  return d;
}

async function sbSelect(params) {
  const res = await fetch(`${SB_URL}/rest/v1/solicitudes?${params}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) { console.error('sbSelect', res.status, await res.text().catch(() => '')); return []; }
  return res.json();
}

async function sbPatch(id, data) {
  const res = await fetch(`${SB_URL}/rest/v1/solicitudes?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) console.error('sbPatch', res.status, await res.text().catch(() => ''));
}

async function enviarTpl(to, name, params) {
  const dest = normalizePhone(to);
  if (!dest || !TOKEN) { console.log('skip tpl: sin destino/token', { dest, hasToken: !!TOKEN }); return; }
  try {
    const resp = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: dest, type: 'template',
        template: {
          name, language: { code: 'es_CO' },
          components: [{ type: 'body', parameters: params.map(p => ({ type: 'text', ...p })) }],
        },
      }),
    });
    const r = await resp.json().catch(() => ({}));
    console.log('tpl', name, dest, r?.messages?.[0]?.id || r?.error?.message || 'ok');
  } catch (e) { console.error('enviarTpl', e); }
}

exports.handler = async function() {
  if (!SB_KEY) { console.log('Sin SUPABASE_SERVICE_KEY'); return { statusCode: 200 }; }

  const now = new Date();
  const minsAgo = (n) => new Date(now.getTime() - n * 60000).toISOString();

  // Window +15 min: finalizada entre 14 y 20 min atrás → calificar_servicio
  const calPending = await sbSelect(
    'select=id,cliente_nombre,cliente_telefono' +
    '&estado=eq.finalizada&msg_cal_sent=eq.false' +
    `&finalizada_at=gte.${minsAgo(20)}&finalizada_at=lte.${minsAgo(14)}`
  );
  for (const sol of calPending) {
    await enviarTpl(sol.cliente_telefono, 'calificar_servicio', [
      { parameter_name: 'cliente', text: String(sol.cliente_nombre || '') },
      { parameter_name: 'enlace', text: `${BASE_CALIFICA}${sol.id}` },
    ]);
    await sbPatch(sol.id, { msg_cal_sent: true });
    console.log('calificar_servicio sent', sol.id);
  }

  // Window +30 min: finalizada entre 28 y 35 min atrás → invitar_registro_moto
  const followPending = await sbSelect(
    'select=id,cliente_nombre,cliente_telefono' +
    '&estado=eq.finalizada&msg_followup_sent=eq.false' +
    `&finalizada_at=gte.${minsAgo(35)}&finalizada_at=lte.${minsAgo(28)}`
  );
  for (const sol of followPending) {
    await enviarTpl(sol.cliente_telefono, 'invitar_registro_moto', [
      { parameter_name: 'cliente', text: String(sol.cliente_nombre || '') },
      { parameter_name: 'enlace', text: `${BASE_MIMOTO}${sol.id}` },
    ]);
    await sbPatch(sol.id, { msg_followup_sent: true });
    console.log('invitar_registro_moto sent', sol.id);
  }

  return { statusCode: 200 };
};
