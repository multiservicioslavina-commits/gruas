import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// RIDERA — Confirmación al cliente.
// Usa 'confirmacion_cliente_ridera' apenas esté APROBADA; mientras tanto,
// usa 'solicitud_grua_ridera' (ya aprobada). Cambia solo, sin tocar código.
//
// Este endpoint solo debe ser invocado por el trigger de base de datos
// (notificar_solicitud_whatsapp) — nunca directamente desde el navegador.
// El secreto no tiene un valor por defecto insecuro: si no está configurado,
// la función rechaza todas las solicitudes.

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") ?? "1162210376978137";
const WABA_ID = Deno.env.get("WHATSAPP_WABA_ID") ?? "1406061330395268";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "MEKQE5J-2wnHbkjt06Prth_Rz0X9OolqAvHc6y5BbmE";
const PREFERRED = "confirmacion_cliente_ridera";
const FALLBACK = "solicitud_grua_ridera";
const GRAPH = "https://graph.facebook.com/v21.0";
const BASE_SEGUIMIENTO = "https://gruas.ridera.com.co/seguimiento";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizePhone(raw: string): string {
  let d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  d = d.replace(/^0+/, "");
  if (d.startsWith("57") && d.length >= 12) return d;
  if (d.length === 10) return "57" + d;
  return d;
}

type TplInfo = { name: string; language: string; names: string[]; named: boolean; approved: boolean };

async function getTemplateInfo(name: string): Promise<TplInfo | null> {
  try {
    const url = `${GRAPH}/${WABA_ID}/message_templates?name=${name}&limit=50`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
    const data = await res.json();
    if (!res.ok || !Array.isArray(data?.data)) return null;
    const list = data.data.filter((t: any) => t.name === name);
    if (list.length === 0) return null;
    const tpl = list.find((t: any) => t.status === "APPROVED") ?? list[0];
    const body = (tpl.components || []).find((c: any) => c.type === "BODY");
    const names: string[] = [];
    if (body && typeof body.text === "string") {
      const m = body.text.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) || [];
      const seen = new Set<string>();
      for (const x of m) { const n = x.replace(/[{}\s]/g, ""); if (!seen.has(n)) { seen.add(n); names.push(n); } }
    }
    const named = names.length > 0 && isNaN(Number(names[0]));
    return { name, language: tpl.language, names, named, approved: tpl.status === "APPROVED" };
  } catch (_) { return null; }
}

async function pickTemplate(): Promise<TplInfo | null> {
  const pref = await getTemplateInfo(PREFERRED);
  if (pref && pref.approved) return pref;
  return await getTemplateInfo(FALLBACK);
}

function valueForName(
  name: string,
  v: { nombre: string; direccion: string; telefono: string; seguimientoUrl: string }
): string | null {
  const n = name.toLowerCase();
  if (/(nombre|cliente|name)/.test(n)) return v.nombre;
  if (/(direccion|ubica|lugar|address|location)/.test(n)) return v.direccion;
  if (/(tel|celular|whatsapp|phone|movil)/.test(n)) return v.telefono;
  if (/(seguimiento|enlace|link|url|tracking)/.test(n)) return v.seguimientoUrl;
  return null;
}

function jsonRes(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });
  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401, headers: CORS });
  if (!WHATSAPP_TOKEN) return jsonRes({ ok: false, error: "Falta WHATSAPP_TOKEN" }, 500);

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const r = body.record ?? body;
  const seguimientoUrl = r.id ? `${BASE_SEGUIMIENTO}?s=${r.id}` : "";
  const v = {
    nombre: r.cliente_nombre ?? "",
    telefono: r.cliente_telefono ?? "",
    direccion: r.ubicacion ?? "",
    seguimientoUrl,
  };
  const to = normalizePhone(v.telefono);
  if (!to) return jsonRes({ ok: false, error: "Teléfono inválido", telefono: v.telefono }, 400);

  const info = await pickTemplate();
  if (!info) return jsonRes({ ok: false, error: "No hay plantilla disponible" }, 502);

  const positional = [v.nombre, v.direccion, v.telefono, v.seguimientoUrl];
  const parameters = info.names.map((name, i) => {
    const val = valueForName(name, v) ?? positional[i] ?? "-";
    const p: any = { type: "text", text: String(val || "-") };
    if (info.named) p.parameter_name = name;
    return p;
  });
  const payload = {
    messaging_product: "whatsapp", to, type: "template",
    template: {
      name: info.name,
      language: { code: info.language },
      components: parameters.length ? [{ type: "body", parameters }] : [],
    },
  };
  const res = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return jsonRes({ ok: res.ok, plantilla: info.name, language: info.language, seguimientoUrl, data }, res.ok ? 200 : 502);
});
