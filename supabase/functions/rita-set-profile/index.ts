import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PHONE_NUMBER_ID = Deno.env.get("RITA_PHONE_ID") || "3234846550";
const TOKEN = Deno.env.get("WHATSAPP_TOKEN") || "";
const BASE = "https://graph.facebook.com/v25.0";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const body = await req.json().catch(() => ({}));
  const action = body.action || "status";

  if (action === "set_profile") {
    const logob64 = body.logo_b64 as string;
    const mimeType = body.mime_type as string || "image/jpeg";
    const fileName = mimeType === "image/jpeg" ? "rita-logo.jpg" : "rita-logo.png";
    if (!logob64) return new Response(JSON.stringify({ error: "logo_b64 required" }), { status: 400 });
    const bin = atob(logob64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fileLength = bytes.length;
    const appR = await fetch(`${BASE}/app?access_token=${TOKEN}`);
    const appD = await appR.json();
    if (!appR.ok) return new Response(JSON.stringify({ error: "app_id_fail", detail: appD }), { status: 400 });
    const appId = appD.id;
    const sessR = await fetch(
      `${BASE}/${appId}/uploads?file_name=${fileName}&file_length=${fileLength}&file_type=${mimeType}&access_token=${TOKEN}`,
      { method: "POST" }
    );
    const sessD = await sessR.json();
    if (!sessR.ok) return new Response(JSON.stringify({ error: "upload_session_fail", detail: sessD }), { status: 400 });
    const uploadSessionId = sessD.id;
    const upR = await fetch(`${BASE}/${uploadSessionId}`, {
      method: "POST",
      headers: { "Authorization": `OAuth ${TOKEN}`, "file_offset": "0", "Content-Type": mimeType },
      body: bytes,
    });
    const upD = await upR.json();
    if (!upR.ok) return new Response(JSON.stringify({ error: "upload_fail", detail: upD }), { status: 400 });
    const handle = upD.h;
    const profR = await fetch(`${BASE}/${PHONE_NUMBER_ID}/whatsapp_business_profile`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        profile_picture_handle: handle,
        about: "Asistente virtual de Ridera. Rutas, clima y municipios de Antioquia.",
        description: "Rita es la asistente inteligente de Ridera, la app para motociclistas. Consulta rutas, clima en tiempo real y los 125 municipios de Antioquia.",
        websites: ["https://ridera.app"],
      }),
    });
    const profD = await profR.json();
    return new Response(JSON.stringify({ ok: profR.ok, app_id: appId, handle, profile: profD }), { headers: { "Content-Type": "application/json" } });
  }

  if (action === "status") {
    const phoneR = await fetch(`${BASE}/${PHONE_NUMBER_ID}?fields=id,display_phone_number,verified_name&access_token=${TOKEN}`);
    const phoneD = await phoneR.json();
    return new Response(JSON.stringify({ phone: phoneD }), { headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ error: "unknown action" }), { status: 400 });
});
