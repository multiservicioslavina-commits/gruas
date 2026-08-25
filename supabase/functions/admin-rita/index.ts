import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const CATEGORIAS = ['noticias','rodadas','marketplace','eventos','mantenimiento','seguridad_vial','promociones','novedades'];
const DEBUG_TOOLS = new Set(['sintesis_debug','transcripcion_debug']);

const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN') || '';
const PHONE_ID = Deno.env.get('RITA_PHONE_ID') || Deno.env.get('WHATSAPP_PHONE_ID') || '1238785075974458';
const GRAPH = 'https://graph.facebook.com/v25.0';

type MediaType = 'image' | 'video';

async function sendWA(to: string, opts: { text?: string; mediaId?: string; mediaType?: MediaType; caption?: string }): Promise<{ ok: boolean; error?: string }> {
  if (!WA_TOKEN || !PHONE_ID) return { ok: false, error: 'WhatsApp no configurado' };
  let payload: Record<string, unknown>;
  if (opts.mediaId && opts.mediaType) {
    const media: Record<string, unknown> = { id: opts.mediaId };
    if (opts.caption) media.caption = opts.caption;
    payload = { messaging_product: 'whatsapp', to, type: opts.mediaType, [opts.mediaType]: media };
  } else {
    payload = { messaging_product: 'whatsapp', to, type: 'text', text: { body: opts.text || '' } };
  }
  try {
    const r = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(9000),
    });
    if (r.ok) return { ok: true };
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); msg = j?.error?.message || msg; } catch { /* ignore */ }
    return { ok: false, error: msg };
  } catch (e) { return { ok: false, error: String(e) }; }
}

async function sendTemplate(to: string, name: string, language: string, components: unknown[]): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template: { name, language: { code: language }, ...(components.length ? { components } : {}) } }),
      signal: AbortSignal.timeout(9000),
    });
    if (r.ok) return { ok: true };
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); msg = j?.error?.message || msg; } catch { /* ignore */ }
    return { ok: false, error: msg };
  } catch (e) { return { ok: false, error: String(e) }; }
}

let cachedWaba = '';
async function getWaba(): Promise<string> {
  if (cachedWaba) return cachedWaba;
  const envW = (Deno.env.get('WHATSAPP_WABA_ID') || '').trim();
  if (envW) { cachedWaba = envW; return cachedWaba; }
  try {
    const r = await fetch(`${GRAPH}/debug_token?input_token=${WA_TOKEN}&access_token=${WA_TOKEN}`, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    const scopes = d?.data?.granular_scopes || [];
    for (const s of scopes) {
      if ((s.scope === 'whatsapp_business_management' || s.scope === 'whatsapp_business_messaging') && Array.isArray(s.target_ids) && s.target_ids.length) {
        cachedWaba = s.target_ids[0]; return cachedWaba;
      }
    }
  } catch { /* ignore */ }
  return '';
}

function last10(t: string): string { return (t || '').replace(/\D/g, '').slice(-10); }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const SB_URL = Deno.env.get('SUPABASE_URL')!;
  const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(SB_URL, SB_KEY);

  const { data: cfg } = await sb.from('admin_config').select('password').eq('id', 1).single();
  const adminKey = cfg?.password ?? 'ridera-admin-2026';

  const url = new URL(req.url);
  const key = url.searchParams.get('key') || '';
  if (key !== adminKey) return json({ error: 'No autorizado' }, 401);

  const action = url.searchParams.get('action') || 'resumen';

  async function getOptIn(): Promise<Array<{ telefono: string; categorias: string[]; canal: string | null; fecha: string | null }>> {
    const { data } = await sb.from('rita_consentimiento')
      .select('telefono, categorias, canal, fecha_consentimiento, acepta, fecha_revocacion')
      .eq('acepta', true).is('fecha_revocacion', null);
    const seen = new Set<string>();
    const out: Array<{ telefono: string; categorias: string[]; canal: string | null; fecha: string | null }> = [];
    for (const r of (data || [])) {
      if (!r.telefono || seen.has(r.telefono)) continue;
      seen.add(r.telefono);
      out.push({ telefono: r.telefono, categorias: r.categorias || [], canal: r.canal, fecha: r.fecha_consentimiento });
    }
    return out;
  }
  function filtrar(optin: Array<{ telefono: string; categorias: string[] }>, categoria: string) {
    return categoria === 'todos' ? optin : optin.filter(o => (o.categorias || []).includes(categoria));
  }
  async function getNameMap(): Promise<Map<string, string>> {
    const { data: riders } = await sb.from('riders').select('telefono, nombre');
    const m = new Map<string, string>();
    for (const r of (riders || [])) {
      const k = last10(r.telefono || ''); if (!k) continue;
      const first = (r.nombre || '').trim().split(/\s+/)[0] || '';
      if (first) m.set(k, first.charAt(0).toUpperCase() + first.slice(1));
    }
    return m;
  }

  try {
    if (req.method === 'GET' && action === 'resumen') {
      const optin = await getOptIn();
      const [msgAll, msgUser, acc, conv, notif] = await Promise.all([
        sb.from('rita_messages').select('*', { count: 'exact', head: true }),
        sb.from('rita_messages').select('*', { count: 'exact', head: true }).eq('role', 'user'),
        sb.from('rita_acciones_log').select('*', { count: 'exact', head: true }),
        sb.from('rita_conversations').select('*', { count: 'exact', head: true }),
        sb.from('rita_notif_log').select('*', { count: 'exact', head: true }),
      ]);
      const porCategoria: Record<string, number> = {};
      for (const c of CATEGORIAS) porCategoria[c] = 0;
      for (const o of optin) for (const c of (o.categorias || [])) if (c in porCategoria) porCategoria[c]++;
      return json({ contactos_optin: optin.length, mensajes_total: msgAll.count || 0, mensajes_user: msgUser.count || 0, acciones_total: acc.count || 0, conversaciones: conv.count || 0, notif_total: notif.count || 0, por_categoria: porCategoria });
    }

    if (req.method === 'GET' && action === 'contactos') {
      const optin = await getOptIn();
      const { data: riders } = await sb.from('riders').select('telefono, nombre, ciudad, moto_marca, moto_modelo');
      const byPhone = new Map<string, { nombre: string | null; ciudad: string | null; moto: string | null }>();
      for (const r of (riders || [])) {
        const k = last10(r.telefono || ''); if (!k) continue;
        byPhone.set(k, { nombre: r.nombre || null, ciudad: r.ciudad || null, moto: [r.moto_marca, r.moto_modelo].filter(Boolean).join(' ') || null });
      }
      const out = optin.map(o => { const info = byPhone.get(last10(o.telefono)); return { ...o, nombre: info?.nombre || null, ciudad: info?.ciudad || null, moto: info?.moto || null }; });
      return json(out);
    }

    if (req.method === 'GET' && action === 'preguntas') {
      const { data } = await sb.from('rita_acciones_log').select('herramienta');
      const counts: Record<string, number> = {};
      for (const r of (data || [])) { const h = r.herramienta; if (!h || DEBUG_TOOLS.has(h)) continue; counts[h] = (counts[h] || 0) + 1; }
      return json(Object.entries(counts).map(([herramienta, n]) => ({ herramienta, n })).sort((a, b) => b.n - a.n));
    }

    if (req.method === 'GET' && action === 'historial') {
      const { data } = await sb.from('rita_notif_log').select('telefono, tipo, mensaje, enviado_at').order('enviado_at', { ascending: false }).limit(100);
      return json(data || []);
    }

    if (req.method === 'GET' && action === 'contar') {
      const categoria = url.searchParams.get('categoria') || 'todos';
      const optin = await getOptIn();
      return json({ total: filtrar(optin, categoria).length });
    }

    if (req.method === 'GET' && action === 'plantillas') {
      const waba = await getWaba();
      if (!waba) return json({ error: 'No se pudo detectar el WABA ID. Configura WHATSAPP_WABA_ID en Supabase.', templates: [] });
      const r = await fetch(`${GRAPH}/${waba}/message_templates?fields=name,status,category,language,components&limit=200`, { headers: { Authorization: `Bearer ${WA_TOKEN}` }, signal: AbortSignal.timeout(9000) });
      const d = await r.json();
      if (!r.ok) return json({ error: d?.error?.message || 'Error al listar plantillas', templates: [] });
      const templates = (d.data || []).map((t: any) => {
        let headerMedia: string | null = null; let bodyText = ''; let bodyVars = 0;
        for (const c of (t.components || [])) {
          if (c.type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format)) headerMedia = c.format;
          if (c.type === 'BODY') { bodyText = c.text || ''; bodyVars = (bodyText.match(/\{\{\d+\}\}/g) || []).length; }
        }
        return { name: t.name, status: t.status, category: t.category, language: t.language, headerMedia, bodyText, bodyVars };
      });
      return json({ templates });
    }

    if (req.method === 'POST' && action === 'upload') {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return json({ error: 'No se recibió archivo' }, 400);
      const mime = file.type || '';
      const mediaType: MediaType | null = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : null;
      if (!mediaType) return json({ error: 'Solo se permiten imágenes o videos' }, 400);
      const up = new FormData();
      up.append('messaging_product', 'whatsapp');
      up.append('type', mime);
      up.append('file', file, file.name || (mediaType === 'image' ? 'imagen' : 'video'));
      const r = await fetch(`${GRAPH}/${PHONE_ID}/media`, { method: 'POST', headers: { Authorization: `Bearer ${WA_TOKEN}` }, body: up, signal: AbortSignal.timeout(30000) });
      const d = await r.json();
      if (!r.ok || !d.id) return json({ error: d?.error?.message || 'Error al subir el archivo a WhatsApp' }, 500);
      return json({ media_id: d.id, media_type: mediaType });
    }

    if (req.method === 'POST' && action === 'broadcast') {
      const body = await req.json().catch(() => ({}));
      const mensaje = (body.mensaje || '').toString().trim();
      const categoria = (body.categoria || 'todos').toString();
      const mediaId = body.media_id ? String(body.media_id) : '';
      const mediaType = (body.media_type === 'image' || body.media_type === 'video') ? body.media_type as MediaType : undefined;
      if (!mensaje && !mediaId) return json({ error: 'Escribe un mensaje o adjunta un archivo' }, 400);
      if (categoria !== 'todos' && !CATEGORIAS.includes(categoria)) return json({ error: 'Categoría no válida' }, 400);

      const optin = await getOptIn();
      const destinatarios = filtrar(optin, categoria);
      if (!destinatarios.length) return json({ total: 0, enviados: 0, fallidos: 0, errores: [] });

      const personalizar = /\{nombre\}/i.test(mensaje);
      const nameMap = personalizar ? await getNameMap() : null;
      const tipo = mediaId ? `broadcast_media_${categoria}` : `broadcast_${categoria}`;
      let enviados = 0, fallidos = 0;
      const errores: Array<{ telefono: string; error: string }> = [];
      for (const d of destinatarios) {
        const nombre = nameMap ? (nameMap.get(last10(d.telefono)) || 'parcero') : '';
        const msgFinal = personalizar ? mensaje.replace(/\{nombre\}/gi, nombre) : mensaje;
        const logMsg = mediaId ? `[${mediaType}] ${msgFinal}`.trim() : msgFinal;
        const res = mediaId ? await sendWA(d.telefono, { mediaId, mediaType, caption: msgFinal }) : await sendWA(d.telefono, { text: msgFinal });
        if (res.ok) { enviados++; await sb.from('rita_notif_log').insert({ telefono: d.telefono, tipo, mensaje: logMsg }); }
        else { fallidos++; if (errores.length < 10) errores.push({ telefono: d.telefono, error: res.error || 'error' }); }
      }
      return json({ total: destinatarios.length, enviados, fallidos, errores });
    }

    if (req.method === 'POST' && action === 'enviar_plantilla') {
      const body = await req.json().catch(() => ({}));
      const plantilla = (body.plantilla || '').toString();
      const language = (body.language || 'es').toString();
      const categoria = (body.categoria || 'todos').toString();
      const variables: string[] = Array.isArray(body.variables) ? body.variables.map((v: unknown) => String(v)) : [];
      const headerMediaId = body.header_media_id ? String(body.header_media_id) : '';
      const headerMediaType = body.header_media_type ? String(body.header_media_type).toLowerCase() : '';
      const personalizar = body.personalizar_nombre === true;
      if (!plantilla) return json({ error: 'Falta la plantilla' }, 400);

      const optin = await getOptIn();
      const destinatarios = filtrar(optin, categoria);
      if (!destinatarios.length) return json({ total: 0, enviados: 0, fallidos: 0, errores: [] });

      const nameMap = personalizar ? await getNameMap() : null;
      let enviados = 0, fallidos = 0;
      const errores: Array<{ telefono: string; error: string }> = [];
      for (const d of destinatarios) {
        const bodyParams = personalizar ? [ (nameMap!.get(last10(d.telefono)) || 'parcero'), ...variables ] : variables;
        const components: unknown[] = [];
        if (headerMediaId && (headerMediaType === 'image' || headerMediaType === 'video' || headerMediaType === 'document')) {
          components.push({ type: 'header', parameters: [{ type: headerMediaType, [headerMediaType]: { id: headerMediaId } }] });
        }
        if (bodyParams.length) components.push({ type: 'body', parameters: bodyParams.map(v => ({ type: 'text', text: v })) });
        const res = await sendTemplate(d.telefono, plantilla, language, components);
        if (res.ok) { enviados++; await sb.from('rita_notif_log').insert({ telefono: d.telefono, tipo: `plantilla_${plantilla}`, mensaje: bodyParams.join(' | ') || plantilla }); }
        else { fallidos++; if (errores.length < 10) errores.push({ telefono: d.telefono, error: res.error || 'error' }); }
      }
      return json({ total: destinatarios.length, enviados, fallidos, errores });
    }

    return json({ error: 'Acción no válida' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
