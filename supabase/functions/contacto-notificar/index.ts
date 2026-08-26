import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// RIDERA — Notificación de mensajes del formulario de contacto.
//
// Hace dos cosas con cada mensaje que llega desde ridera.com.co/contacto/:
//   A) Avisa por WhatsApp al número administrativo de Ridera.
//   B) Envía dos correos vía EmailJS (server-side, sin CORS):
//        - notificación interna al equipo
//        - respuesta automática de agradecimiento al visitante
//
// Ambos envíos son best-effort e independientes: si uno falla, el otro sigue.
// La respuesta siempre detalla qué funcionó y qué no, para poder diagnosticar.

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") ?? "1162210376978137";
const ADMIN_PHONE = Deno.env.get("CONTACTO_ADMIN_PHONE") ?? "573117896717";
const GRAPH = "https://graph.facebook.com/v21.0";

const EMAILJS_SERVICE_ID = Deno.env.get("EMAILJS_SERVICE_ID") ?? "ridera-contacto";
const EMAILJS_PUBLIC_KEY = Deno.env.get("EMAILJS_PUBLIC_KEY") ?? "SkP6UWJZThu9tdQCc";
const EMAILJS_PRIVATE_KEY = Deno.env.get("EMAILJS_PRIVATE_KEY") ?? "";
const TPL_INTERNO = Deno.env.get("EMAILJS_TEMPLATE_INTERNO") ?? "7qkjo5c";
const TPL_REPLY = Deno.env.get("EMAILJS_TEMPLATE_REPLY") ?? "8w8ecf8";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ASUNTOS: Record<string, string> = {
  gruas: "Servicio de grúas",
  almacenes: "Almacenes de repuestos",
  clubes: "Clubes de motos",
  garaje: "Garaje / talleres",
  alianzas: "Alianzas y negocios",
  prensa: "Prensa y medios",
  otro: "Otro",
};

function normalizePhone(raw: string): string {
  let d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  d = d.replace(/^0+/, "");
  if (d.startsWith("57") && d.length >= 12) return d;
  if (d.length === 10) return "57" + d;
  return d;
}

// EmailJS acepta llamadas fuera del navegador solo con la private key
// (accessToken). Sin ella devuelve 403, así que ni lo intentamos.
async function enviarCorreo(templateId: string, params: Record<string, string>) {
  if (!EMAILJS_PRIVATE_KEY) return { ok: false, error: "Falta EMAILJS_PRIVATE_KEY" };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: templateId,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PRIVATE_KEY,
      template_params: params,
    }),
  });
  const texto = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, respuesta: texto.slice(0, 300) };
}

async function avisarWhatsApp(texto: string) {
  if (!WHATSAPP_TOKEN) return { ok: false, error: "Falta WHATSAPP_TOKEN" };
  const to = normalizePhone(ADMIN_PHONE);
  if (!to) return { ok: false, error: "CONTACTO_ADMIN_PHONE inválido" };
  const res = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: texto },
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, to, data };
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

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  // Acepta tanto invocación directa desde el formulario como payload de webhook.
  const r = body.record ?? body;

  const nombre = (r.nombre ?? "").toString().trim();
  const email = (r.email ?? "").toString().trim();
  const telefono = (r.telefono ?? "").toString().trim();
  const asuntoRaw = (r.asunto ?? "").toString().trim();
  const mensaje = (r.mensaje ?? "").toString().trim();

  if (!nombre || !email || !mensaje) {
    return jsonRes({ ok: false, error: "Faltan campos: nombre, email o mensaje" }, 400);
  }

  const asunto = ASUNTOS[asuntoRaw] ?? asuntoRaw ?? "Sin asunto";
  const fecha = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });

  const textoWA =
    `📬 *Nuevo mensaje de contacto — ridera.com.co*\n\n` +
    `*Nombre:* ${nombre}\n` +
    `*Correo:* ${email}\n` +
    `*Teléfono:* ${telefono || "No indicó"}\n` +
    `*Asunto:* ${asunto}\n\n` +
    `*Mensaje:*\n${mensaje}\n\n` +
    `_${fecha}_`;

  const [whatsapp, correoInterno, correoReply] = await Promise.all([
    avisarWhatsApp(textoWA).catch((e) => ({ ok: false, error: String(e) })),
    enviarCorreo(TPL_INTERNO, {
      from_name: nombre,
      from_email: email,
      telefono: telefono || "No indicó",
      asunto,
      mensaje,
      fecha,
    }).catch((e) => ({ ok: false, error: String(e) })),
    enviarCorreo(TPL_REPLY, {
      to_name: nombre,
      to_email: email,
      asunto,
      mensaje,
      fecha,
    }).catch((e) => ({ ok: false, error: String(e) })),
  ]);

  return jsonRes({ ok: true, whatsapp, correo_interno: correoInterno, correo_reply: correoReply });
});
