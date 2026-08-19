import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// RIDERA — Recordatorios de vencimientos (SOAT, tecnomecánica, mantenimiento).
// Corre cada día (pg_cron). Manda WhatsApp (y correo si hay RESEND_API_KEY).
// Marca lo avisado para no repetir.

const TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") ?? "1162210376978137";
const GRAPH = "https://graph.facebook.com/v21.0";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "rid3ra_cron_2026";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Ridera <onboarding@resend.dev>";
const DIAS_AVISO = 15;          // avisar cuando falten 15 días o menos
const MANT_DIAS = 90;           // sugerir mantenimiento a los ~3 meses

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
function fechaLarga(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
function normalizePhone(raw: string): string {
  let d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  d = d.replace(/^0+/, "");
  if (d.startsWith("57") && d.length >= 12) return d;
  if (d.length === 10) return "57" + d;
  return d;
}
function isoDays(offset: number): string {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function enviarWhatsApp(to: string, cliente: string, placa: string, tipo: string, fecha: string) {
  try {
    const dest = normalizePhone(to);
    if (!dest || !TOKEN) return false;
    const resp = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: dest, type: "template",
        template: { name: "recordatorio_vencimiento", language: { code: "es_CO" }, components: [{ type: "body", parameters: [
          { type: "text", parameter_name: "cliente", text: cliente || "" },
          { type: "text", parameter_name: "placa", text: placa || "tu moto" },
          { type: "text", parameter_name: "tipo", text: tipo },
          { type: "text", parameter_name: "fecha", text: fecha },
        ] }] },
      }),
    });
    return resp.ok;
  } catch (_) { return false; }
}

async function enviarEmail(to: string, cliente: string, placa: string, tipo: string, fecha: string) {
  if (!RESEND_API_KEY || !to) return false;
  try {
    const html = `<div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#E85D20">⏰ Recordatorio Ridera</h2>
      <p>Hola ${cliente || ""},</p>
      <p>Tu <b>${tipo}</b> de la moto <b>${placa || ""}</b> vence el <b>${fecha}</b>.</p>
      <p>¿Necesitas ayuda para renovarlo? Responde este correo o escríbenos por WhatsApp.</p>
      <p style="color:#888;font-size:13px">— Ridera</p></div>`;
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RESEND_FROM, to: [to], subject: `Recordatorio: tu ${tipo} vence pronto`, html }),
    });
    return resp.ok;
  } catch (_) { return false; }
}

Deno.serve(async (req: Request) => {
  try {
    const secret = req.headers.get("x-ridera-cron") ?? new URL(req.url).searchParams.get("secret") ?? "";
    if (secret !== CRON_SECRET) return new Response("no autorizado", { status: 401 });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const hoy = isoDays(0);
    const limite = isoDays(DIAS_AVISO);
    const cooldown = new Date(); cooldown.setUTCDate(cooldown.getUTCDate() - 60);
    const cooldownIso = cooldown.toISOString();
    const resultados: any[] = [];

    async function procesar(tipo: string, campoFecha: string, campoAviso: string, fechaTexto: (m: any) => string, filtro: (q: any) => any) {
      let q = supabase.from("motos").select("*").eq("acepta_comunicaciones", true);
      q = filtro(q);
      q = q.or(`${campoAviso}.is.null,${campoAviso}.lt.${cooldownIso}`);
      const { data, error } = await q;
      if (error || !data) return;
      for (const m of data) {
        const fecha = fechaTexto(m);
        const wa = await enviarWhatsApp(m.contacto_whatsapp, m.contacto_nombre, m.placa, tipo, fecha);
        const em = await enviarEmail(m.contacto_email, m.contacto_nombre, m.placa, tipo, fecha);
        await supabase.from("motos").update({ [campoAviso]: new Date().toISOString() }).eq("id", m.id);
        resultados.push({ moto: m.placa || m.contacto_nombre, tipo, whatsapp: wa, email: em });
      }
    }

    // SOAT: vence dentro de los próximos 15 días
    await procesar("SOAT", "soat_vence", "soat_avisado_at",
      (m) => fechaLarga(m.soat_vence),
      (q) => q.not("soat_vence", "is", null).gte("soat_vence", hoy).lte("soat_vence", limite));

    // Tecnomecánica: vence dentro de los próximos 15 días
    await procesar("tecnomecánica", "tecno_vence", "tecno_avisado_at",
      (m) => fechaLarga(m.tecno_vence),
      (q) => q.not("tecno_vence", "is", null).gte("tecno_vence", hoy).lte("tecno_vence", limite));

    // Mantenimiento: último cambio hace 90+ días
    const hace90 = isoDays(-MANT_DIAS);
    await procesar("mantenimiento", "ultimo_mantenimiento", "mantenimiento_avisado_at",
      (m) => "pronto (ya pasó el tiempo recomendado)",
      (q) => q.not("ultimo_mantenimiento", "is", null).lte("ultimo_mantenimiento", hace90));

    return new Response(JSON.stringify({ ok: true, enviados: resultados.length, detalle: resultados }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
