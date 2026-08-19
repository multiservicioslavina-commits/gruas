import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") ?? "1162210376978137";
const WABA_ID = Deno.env.get("WHATSAPP_WABA_ID") ?? "1406061330395268";
const GRAPH = "https://graph.facebook.com/v21.0";
const BASE_SEG = "https://gruas.ridera.com.co/seguimiento";
const BASE_CAL = "https://gruas.ridera.com.co/califica";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function normalizePhone(raw: string): string {
  let d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  d = d.replace(/^0+/, "");
  if (d.startsWith("57") && d.length >= 12) return d;
  if (d.length === 10) return "57" + d;
  return d;
}
function fmtTel(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("57") && d.length === 12) { const r = d.slice(2); return `+57 ${r.slice(0,3)} ${r.slice(3,6)} ${r.slice(6)}`; }
  return d ? "+" + d : "-";
}

// Verifica si una plantilla está APPROVED y devuelve su language code, o null.
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

// lang viene de tplAprobada() para usar el código exacto con que Meta aprobó la plantilla.
async function enviarTpl(to: string, name: string, params: { parameter_name: string; text: string }[], lang = "es_CO") {
  try {
    const dest = normalizePhone(to);
    if (!dest || !TOKEN) return { ok: false, error: "sin destino/token" };
    const resp = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: dest, type: "template",
        template: { name, language: { code: lang }, components: [{ type: "body", parameters: params.map(p => ({ type: "text", ...p })) }] },
      }),
    });
    return await resp.json().catch(() => ({}));
  } catch (e) { return { ok: false, error: String(e) }; }
}

async function enviarTplConFallback(
  to: string, name: string,
  params: { parameter_name: string; text: string }[],
  extraIdx: number,
  lang = "es_CO"
) {
  const r = await enviarTpl(to, name, params, lang);
  if (r.error?.message?.includes("parameter") || r.error?.message?.includes("param") ||
      r.error_data?.details?.includes("parameter") || r.code === 132012 ||
      (Array.isArray(r.errors) && JSON.stringify(r.errors).includes("param"))
  ) {
    const reduced = params.filter((_,i) => i !== extraIdx);
    return await enviarTpl(to, name, reduced, lang);
  }
  return r;
}

async function notificarClienteAsignado(
  clienteTel: string,
  clienteNombre: string,
  grueroNombre: string,
  grueroTel: string,
  seguimientoUrl: string,
  ubicacion: string,
): Promise<{ aviso: any; tpl_usada: string }> {
  const lang1 = await tplAprobada("gruero_asignado_cliente");
  if (lang1) {
    const r = await enviarTplConFallback(clienteTel, "gruero_asignado_cliente", [
      { parameter_name: "cliente",     text: clienteNombre || "Cliente" },
      { parameter_name: "gruero",      text: grueroNombre || "Tu gruero" },
      { parameter_name: "telefono",    text: fmtTel(grueroTel) },
      { parameter_name: "seguimiento", text: seguimientoUrl },
    ], 3, lang1);
    return { aviso: r, tpl_usada: `gruero_asignado_cliente(${lang1})` };
  }

  const lang2 = await tplAprobada("confirmacion_cliente_ridera");
  if (lang2) {
    const r = await enviarTpl(clienteTel, "confirmacion_cliente_ridera", [
      { parameter_name: "cliente",     text: clienteNombre || "Cliente" },
      { parameter_name: "nombre",      text: clienteNombre || "Cliente" },
      { parameter_name: "direccion",   text: ubicacion || "" },
      { parameter_name: "telefono",    text: fmtTel(grueroTel) },
      { parameter_name: "whatsapp",    text: fmtTel(grueroTel) },
      { parameter_name: "seguimiento", text: seguimientoUrl },
      { parameter_name: "enlace",      text: seguimientoUrl },
      { parameter_name: "link",        text: seguimientoUrl },
    ], lang2);
    return { aviso: r, tpl_usada: `confirmacion_cliente_ridera(${lang2})` };
  }

  const lang3 = await tplAprobada("solicitud_grua_ridera");
  const r = await enviarTpl(clienteTel, "solicitud_grua_ridera", [
    { parameter_name: "cliente",   text: clienteNombre || "Cliente" },
    { parameter_name: "whatsapp",  text: fmtTel(grueroTel) },
    { parameter_name: "ubicacion", text: seguimientoUrl },
  ], lang3 || "es_CO");
  return { aviso: r, tpl_usada: `solicitud_grua_ridera_fallback(${lang3 || "es_CO"})` };
}

async function notificarClienteLlego(
  clienteTel: string,
  clienteNombre: string,
  grueroNombre: string,
): Promise<{ aviso: any; tpl_usada: string }> {
  const lang = await tplAprobada("servicio_llego");
  if (lang) {
    const r = await enviarTpl(clienteTel, "servicio_llego", [
      { parameter_name: "cliente", text: clienteNombre || "Cliente" },
      { parameter_name: "gruero",  text: grueroNombre || "Tu gruero" },
    ], lang);
    return { aviso: r, tpl_usada: `servicio_llego(${lang})` };
  }
  return { aviso: { ok: false, skipped: true, reason: "plantilla_no_aprobada" }, tpl_usada: "ninguna" };
}

async function notificarClienteFinalizado(
  clienteTel: string,
  clienteNombre: string,
  calUrl: string,
  seguimientoUrl: string,
  grueroTel: string,
): Promise<{ aviso: any; tpl_usada: string }> {
  const lang1 = await tplAprobada("servicio_finalizado_cliente");
  if (lang1) {
    const r = await enviarTpl(clienteTel, "servicio_finalizado_cliente", [
      { parameter_name: "cliente",           text: clienteNombre || "Cliente" },
      { parameter_name: "link_calificacion", text: calUrl },
    ], lang1);
    return { aviso: r, tpl_usada: `servicio_finalizado_cliente(${lang1})` };
  }

  const lang2 = await tplAprobada("solicitud_grua_ridera");
  const r = await enviarTpl(clienteTel, "solicitud_grua_ridera", [
    { parameter_name: "cliente",   text: clienteNombre || "Cliente" },
    { parameter_name: "whatsapp",  text: fmtTel(grueroTel) },
    { parameter_name: "ubicacion", text: calUrl },
  ], lang2 || "es_CO");
  return { aviso: r, tpl_usada: `solicitud_grua_ridera_finalizar_fallback(${lang2 || "es_CO"})` };
}

function pub(sol: any, g: string | null, grueroNombre: string | null, reveal: boolean) {
  if (!sol) return null;
  return {
    id: sol.id, estado: sol.estado, cliente_nombre: sol.cliente_nombre, ubicacion: sol.ubicacion,
    cliente_telefono: reveal ? sol.cliente_telefono : null,
    es_mio: g != null && sol.gruero_asignado === g, gruero_nombre: grueroNombre,
    asignada_at: sol.asignada_at, llego_at: sol.llego_at, finalizada_at: sol.finalizada_at,
    calificacion: sol.calificacion ?? null,
    gruero_lat: sol.gruero_lat ?? null, gruero_lng: sol.gruero_lng ?? null,
  };
}
function parseToken(body: any) {
  let s = body.s, g = body.g;
  if (body.t && typeof body.t === "string" && body.t.includes("~")) { const [a, b] = body.t.split("~"); s = s || a; g = g || b; }
  return { s, g };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const { s, g } = parseToken(body);
    const action = body.action || "info";
    if (!s) return json({ ok: false, error: "Falta solicitud" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let grueroNombre: string | null = null;
    let grueroTel = "";
    if (g) {
      const { data: gr } = await supabase.from("grueros").select("nombre, telefono").eq("id", g).single();
      grueroNombre = gr?.nombre ?? null; grueroTel = gr?.telefono ?? "";
    }
    const getSol = async () => {
      const { data } = await supabase.from("solicitudes")
        .select("id, cliente_nombre, cliente_telefono, ubicacion, estado, gruero_asignado, asignada_at, llego_at, finalizada_at, calificacion, created_at, gruero_lat, gruero_lng")
        .eq("id", s).single();
      return data;
    };
    const asignadoNombre = async (sol: any) => {
      if (!sol?.gruero_asignado) return null;
      const { data } = await supabase.from("grueros").select("nombre").eq("id", sol.gruero_asignado).single();
      return data?.nombre ?? null;
    };
    const esMiAsignacion = async () => { const sol = await getSol(); return { sol, mio: sol?.gruero_asignado === g }; };

    if (action === "ubicacion") {
      if (!g) return json({ ok: false, error: "Falta gruero" }, 400);
      const lat = body.lat, lng = body.lng;
      if (lat == null || lng == null) return json({ ok: false, error: "Falta lat/lng" }, 400);
      await supabase.from("solicitudes").update({ gruero_lat: lat, gruero_lng: lng }).eq("id", s);
      return json({ ok: true, resultado: "ubicacion_actualizada" });
    }

    if (action === "aceptar") {
      if (!g) return json({ ok: false, error: "Falta gruero" }, 400);

      const { data: activa } = await supabase.from("solicitudes")
        .select("id")
        .eq("gruero_asignado", g)
        .in("estado", ["asignada", "llego"])
        .maybeSingle();
      if (activa) return json({
        ok: false, resultado: "ya_ocupado",
        error: "Ya tienes una solicitud activa. Finaliza el servicio actual primero.",
        activa_id: activa.id,
      });

      const { data: upd } = await supabase.from("solicitudes")
        .update({ estado: "asignada", gruero_asignado: g, asignada_at: new Date().toISOString() })
        .eq("id", s).eq("estado", "pendiente").select("id").maybeSingle();
      const sol = await getSol();
      if (upd) {
        const seguimientoUrl = `${BASE_SEG}?s=${s}`;
        const { aviso, tpl_usada } = await notificarClienteAsignado(
          sol.cliente_telefono,
          sol.cliente_nombre,
          grueroNombre || "",
          grueroTel,
          seguimientoUrl,
          sol.ubicacion || "",
        );
        return json({ ok: true, resultado: "aceptaste", sol: pub(sol, g, grueroNombre, true), aviso, tpl_usada });
      }
      if (sol?.gruero_asignado === g) return json({ ok: true, resultado: "ya_eras_tu", sol: pub(sol, g, grueroNombre, true) });
      const otro = await asignadoNombre(sol);
      return json({ ok: true, resultado: "ya_tomado", asignado_nombre: otro, sol: pub(sol, g, grueroNombre, false) });
    }

    if (action === "llegue") {
      if (!g) return json({ ok: false, error: "Falta gruero" }, 400);
      const { sol, mio } = await esMiAsignacion();
      if (!mio) return json({ ok: false, error: "No eres el gruero asignado", sol: pub(sol, g, grueroNombre, false) });
      await supabase.from("solicitudes").update({ estado: "llego", llego_at: new Date().toISOString() }).eq("id", s);
      const sol2 = await getSol();
      const { aviso, tpl_usada } = await notificarClienteLlego(
        sol2.cliente_telefono,
        sol2.cliente_nombre,
        grueroNombre || "Tu gruero",
      );
      return json({ ok: true, resultado: "llego", sol: pub(sol2, g, grueroNombre, true), aviso, tpl_usada });
    }

    if (action === "finalizar") {
      if (!g) return json({ ok: false, error: "Falta gruero" }, 400);
      const { sol, mio } = await esMiAsignacion();
      if (!mio) return json({ ok: false, error: "No eres el gruero asignado", sol: pub(sol, g, grueroNombre, false) });
      await supabase.from("solicitudes").update({ estado: "finalizada", finalizada_at: new Date().toISOString() }).eq("id", s);
      const sol2 = await getSol();
      const calUrl = `${BASE_CAL}?s=${s}`;
      const seguimientoUrl = `${BASE_SEG}?s=${s}`;
      const { aviso, tpl_usada } = await notificarClienteFinalizado(
        sol2.cliente_telefono,
        sol2.cliente_nombre,
        calUrl,
        seguimientoUrl,
        grueroTel,
      );
      return json({ ok: true, resultado: "finalizada", sol: pub(sol2, g, grueroNombre, true), aviso, tpl_usada });
    }

    if (action === "calificar") {
      const solActual = await getSol();
      if (!solActual) return json({ ok: false, error: "Solicitud no encontrada" }, 404);
      if (solActual.calificacion) return json({ ok: true, resultado: "ya_calificado", calificacion: solActual.calificacion });
      const n = Math.max(1, Math.min(5, parseInt(String(body.calificacion ?? "0"), 10) || 0));
      if (!n) return json({ ok: false, error: "Calificación inválida" }, 400);
      await supabase.from("solicitudes").update({
        calificacion: n, calificacion_at: new Date().toISOString(),
        comentario_cliente: String(body.comentario ?? "").slice(0, 500) || null,
      }).eq("id", s);
      return json({ ok: true, resultado: "calificado", calificacion: n });
    }

    if (action === "cancelar") {
      if (!g) return json({ ok: false, error: "Falta gruero" }, 400);
      const { sol, mio } = await esMiAsignacion();
      if (!mio) return json({ ok: false, error: "No eres el gruero asignado", sol: pub(sol, g, grueroNombre, false) });
      await supabase.from("solicitudes").update({
        estado: "pendiente",
        gruero_asignado: null,
        asignada_at: null,
        llego_at: null,
        sin_aceptar_avisado_at: null,
        no_llego_avisado_at: null,
      }).eq("id", s);
      const sol2 = await getSol();
      return json({ ok: true, resultado: "cancelado", sol: pub(sol2, g, grueroNombre, false) });
    }

    if (action === "cancelar_cliente") {
      const sol = await getSol();
      if (!sol) return json({ ok: false, error: "Solicitud no encontrada" }, 404);
      if (sol.estado === "finalizada") return json({ ok: false, error: "El servicio ya fue completado" });
      if (sol.estado === "cancelada") return json({ ok: true, resultado: "ya_cancelada", sol: pub(sol, null, null, false) });
      const grueroAsignado = sol.gruero_asignado;
      await supabase.from("solicitudes").update({ estado: "cancelada" }).eq("id", s);
      const sol2 = await getSol();
      let avisoGruero = null;
      if (grueroAsignado) {
        const { data: gr } = await supabase.from("grueros").select("nombre, telefono").eq("id", grueroAsignado).single();
        if (gr?.telefono) {
          const langCan = await tplAprobada("cancelacion_cliente_gruero");
          if (langCan) {
            avisoGruero = await enviarTpl(gr.telefono, "cancelacion_cliente_gruero", [
              { parameter_name: "gruero",    text: String(gr.nombre || "Gruero") },
              { parameter_name: "cliente",   text: String(sol.cliente_nombre || "") },
              { parameter_name: "ubicacion", text: String(sol.ubicacion || "") },
            ], langCan);
          }
        }
      }
      return json({ ok: true, resultado: "cancelada", sol: pub(sol2, null, null, false), aviso_gruero: avisoGruero });
    }

    if (action === "rechazar") {
      const sol = await getSol();
      const asig = await asignadoNombre(sol);
      return json({ ok: true, resultado: "rechazado", asignado_nombre: asig, sol: pub(sol, g, grueroNombre, sol?.gruero_asignado === g) });
    }

    const sol = await getSol();
    if (!sol) return json({ ok: false, error: "Solicitud no encontrada" }, 404);
    const asig = await asignadoNombre(sol);
    return json({ ok: true, resultado: "info", asignado_nombre: asig, sol: pub(sol, g, grueroNombre, sol.gruero_asignado === g) });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
