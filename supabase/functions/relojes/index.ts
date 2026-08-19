import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// RIDERA — Relojes del despacho. Corre cada minuto (pg_cron).
// Reloj 1: nadie acepta en N min → alerta admin + re-notifica grueros + avisa cliente.
// Reloj 2: aceptó pero no marca "llegué" en M min → alerta admin + recordatorio al gruero.
// Reloj 3: pendiente ya avisada y sigue sin gruero → cancelar automáticamente + avisa cliente.

const TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") ?? "1162210376978137";
const WABA_ID = Deno.env.get("WHATSAPP_WABA_ID") ?? "1406061330395268";
const GRAPH = "https://graph.facebook.com/v21.0";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "rid3ra_cron_2026";
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;

function normalizePhone(raw: string): string {
  let d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  d = d.replace(/^0+/, "");
  if (d.startsWith("57") && d.length >= 12) return d;
  if (d.length === 10) return "57" + d;
  return d;
}

// Verifica en Meta si una plantilla está APPROVED y devuelve su language code, o null.
async function tplAprobada(name: string): Promise<string | null> {
  if (!TOKEN) return null;
  try {
    const res = await fetch(`${GRAPH}/${WABA_ID}/message_templates?name=${encodeURIComponent(name)}&limit=10`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data?.data)) return null;
    const tpl = data.data.find((t: any) => t.name === name && t.status === "APPROVED");
    return tpl?.language ?? null;
  } catch (_) { return null; }
}

async function enviarTpl(to: string, name: string, params: { name: string; text: string }[], lang = "es_CO") {
  if (!to || !TOKEN) return { ok: false };
  const resp = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to, type: "template",
      template: {
        name, language: { code: lang },
        components: [{ type: "body", parameters: params.map(p => ({ type: "text", parameter_name: p.name, text: p.text })) }],
      },
    }),
  });
  const json = await resp.json().catch(() => ({}));
  return { ok: resp.ok, ...json };
}

async function alertaAdmin(adminTel: string, motivo: string, cliente: string, ubicacion: string) {
  try {
    const to = normalizePhone(adminTel);
    if (!to || !TOKEN) return { ok: false, reason: "no_phone" };
    const lang = await tplAprobada("alerta_admin_ridera");
    if (!lang) return { ok: false, reason: "tpl_pending" };
    return await enviarTpl(to, "alerta_admin_ridera", [
      { name: "motivo", text: motivo },
      { name: "cliente", text: cliente || "-" },
      { name: "ubicacion", text: ubicacion || "-" },
    ], lang);
  } catch (_) { return false; }
}

// Avisa al cliente cuando aún no hay gruero disponible.
async function avisoClienteSinGruero(clienteTel: string, clienteNombre: string, minutos: number) {
  try {
    const to = normalizePhone(clienteTel);
    if (!to || !TOKEN) return { ok: false, reason: "no_phone" };
    const lang = await tplAprobada("buscando_gruero_ridera");
    if (!lang) return { ok: false, reason: "tpl_pending", tpl: "buscando_gruero_ridera" };
    return await enviarTpl(to, "buscando_gruero_ridera", [
      { name: "nombre", text: clienteNombre || "Cliente" },
      { name: "minutos", text: String(minutos) },
    ], lang);
  } catch (e) { return { ok: false, error: String(e) }; }
}

// Avisa al cliente que su solicitud fue cancelada por falta de grueros.
// Intenta solicitud_cancelada_cliente; si está pendiente cae a solicitud_grua_ridera.
async function avisoClienteCancelada(clienteTel: string, clienteNombre: string) {
  try {
    const to = normalizePhone(clienteTel);
    if (!to || !TOKEN) return { ok: false, reason: "no_phone" };

    const lang1 = await tplAprobada("solicitud_cancelada_cliente");
    if (lang1) {
      return {
        ...(await enviarTpl(to, "solicitud_cancelada_cliente", [
          { name: "nombre", text: clienteNombre || "Cliente" },
        ], lang1)),
        tpl_usada: "solicitud_cancelada_cliente",
      };
    }

    // Fallback: plantilla genérica siempre aprobada
    const lang2 = await tplAprobada("solicitud_grua_ridera");
    if (lang2) {
      const msg = `Lo sentimos, no encontramos un gruero disponible. Tu solicitud fue cancelada. Puedes volver a solicitar en gruas.ridera.com.co`;
      return {
        ...(await enviarTpl(to, "solicitud_grua_ridera", [
          { name: "nombre", text: clienteNombre || "Cliente" },
          { name: "mensaje", text: msg },
        ], lang2)),
        tpl_usada: "solicitud_grua_ridera",
      };
    }

    return { ok: false, reason: "all_tpl_pending" };
  } catch (e) { return { ok: false, error: String(e) }; }
}

// Recuerda al gruero que marque llegada.
async function avisoGruero(grueroTel: string, grueroNombre: string, solId: string, grueroId: string) {
  try {
    const to = normalizePhone(grueroTel);
    if (!to || !TOKEN) return { ok: false, reason: "no_phone" };
    const lang = await tplAprobada("recordatorio_gruero_ridera");
    if (!lang) return { ok: false, reason: "tpl_pending", tpl: "recordatorio_gruero_ridera" };
    const link = `https://gruas.ridera.com.co/aceptar?s=${solId}&g=${grueroId}`;
    return await enviarTpl(to, "recordatorio_gruero_ridera", [
      { name: "nombre", text: grueroNombre || "Gruero" },
      { name: "link", text: link },
    ], lang);
  } catch (e) { return { ok: false, error: String(e) }; }
}

async function reNotificarGrueros(solicitud: any) {
  try {
    await fetch(`${SUPA_URL}/functions/v1/cartero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record: solicitud }),
    });
  } catch (_) { /* mejor esfuerzo */ }
}

Deno.serve(async (req: Request) => {
  try {
    const secret = req.headers.get("x-ridera-cron") ?? new URL(req.url).searchParams.get("secret") ?? "";
    if (secret !== CRON_SECRET) return new Response("no autorizado", { status: 401 });

    const url = new URL(req.url);
    const minAceptar  = parseInt(url.searchParams.get("min_aceptar")  ?? "4",  10);
    const minLlegar   = parseInt(url.searchParams.get("min_llegar")   ?? "15", 10);
    const minExpirar  = parseInt(url.searchParams.get("min_expirar")  ?? "45", 10);

    const supabase = createClient(SUPA_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: cfg } = await supabase.from("admin_config").select("admin_whatsapp").eq("id", 1).single();
    const adminTel = cfg?.admin_whatsapp ?? "";

    const ahora = Date.now();
    const limAceptar  = new Date(ahora - minAceptar  * 60000).toISOString();
    const limLlegar   = new Date(ahora - minLlegar   * 60000).toISOString();
    const limExpirar  = new Date(ahora - minExpirar  * 60000).toISOString();
    const alertas: any[] = [];

    // RELOJ 1: pendientes sin aceptar hace > minAceptar
    const { data: sinAceptar } = await supabase.from("solicitudes")
      .select("*").eq("estado", "pendiente").lt("created_at", limAceptar).is("sin_aceptar_avisado_at", null);
    for (const s of (sinAceptar ?? [])) {
      const [adminOk, clienteRes] = await Promise.all([
        alertaAdmin(adminTel, `Nadie ha aceptado la solicitud en ${minAceptar} minutos`, s.cliente_nombre, s.ubicacion),
        avisoClienteSinGruero(s.cliente_telefono, s.cliente_nombre, minAceptar),
      ]);
      await reNotificarGrueros(s);
      await supabase.from("solicitudes").update({ sin_aceptar_avisado_at: new Date().toISOString() }).eq("id", s.id);
      alertas.push({ tipo: "sin_aceptar", cliente: s.cliente_nombre, alerta_admin: adminOk, aviso_cliente: clienteRes });
    }

    // RELOJ 2: asignadas hace > minLlegar que no marcaron "llegó"
    const { data: noLlego } = await supabase.from("solicitudes")
      .select("*").eq("estado", "asignada").lt("asignada_at", limLlegar).is("no_llego_avisado_at", null);
    for (const s of (noLlego ?? [])) {
      let grueroTel = "";
      let grueroNombreRes = "";
      if (s.gruero_asignado) {
        const { data: gr } = await supabase.from("grueros").select("nombre, telefono").eq("id", s.gruero_asignado).single();
        grueroTel = gr?.telefono ?? "";
        grueroNombreRes = gr?.nombre ?? "";
      }
      const [adminOk, grueroRes] = await Promise.all([
        alertaAdmin(adminTel, `Un gruero aceptó pero no ha marcado que llegó (${minLlegar} min)`, s.cliente_nombre, s.ubicacion),
        avisoGruero(grueroTel, grueroNombreRes, s.id, s.gruero_asignado || ""),
      ]);
      await supabase.from("solicitudes").update({ no_llego_avisado_at: new Date().toISOString() }).eq("id", s.id);
      alertas.push({ tipo: "no_llego", cliente: s.cliente_nombre, alerta_admin: adminOk, aviso_gruero: grueroRes });
    }

    // RELOJ 3: pendientes ya avisadas (sin_aceptar_avisado_at set) hace > minExpirar → cancelar y avisar cliente
    const { data: expiradas } = await supabase.from("solicitudes")
      .select("id, cliente_nombre, cliente_telefono")
      .eq("estado", "pendiente")
      .not("sin_aceptar_avisado_at", "is", null)
      .lt("sin_aceptar_avisado_at", limExpirar);
    for (const s of (expiradas ?? [])) {
      await supabase.from("solicitudes").update({ estado: "cancelada" }).eq("id", s.id);
      const avisoRes = await avisoClienteCancelada(s.cliente_telefono, s.cliente_nombre);
      alertas.push({ tipo: "expirada", cliente: s.cliente_nombre, aviso_cliente: avisoRes });
    }

    return new Response(JSON.stringify({ ok: true, alertas: alertas.length, detalle: alertas }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
