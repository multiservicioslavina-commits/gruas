import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") ?? "1162210376978137";
const WABA_ID = Deno.env.get("WHATSAPP_WABA_ID") ?? "1406061330395268";
const GRAPH = "https://graph.facebook.com/v21.0";
const TPL_NUEVO = "nueva_solicitud_aceptar";
const TPL_VIEJO = "solicitud_grua_ridera";
const BASE_ACEPTAR = "https://gruas.ridera.com.co/aceptar?s=";

function normalizePhone(raw: string): string {
  let d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  d = d.replace(/^0+/, "");
  if (d.startsWith("57") && d.length >= 12) return d;
  if (d.length === 10) return "57" + d;
  return d;
}

function normMuni(s: string): string {
  return (s || "").trim().toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_");
}

async function aprobada(name: string): Promise<string | null> {
  try {
    const url = `${GRAPH}/${WABA_ID}/message_templates?name=${name}&limit=50`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
    const data = await res.json();
    if (!res.ok || !Array.isArray(data?.data)) return null;
    const tpl = data.data.find((t: any) => t.name === name && t.status === "APPROVED");
    return tpl ? (tpl.language || "es_CO") : null;
  } catch (_) { return null; }
}

Deno.serve(async (req: Request) => {
  try {
    if (!WHATSAPP_TOKEN) return new Response(JSON.stringify({ ok: false, error: "Falta token" }), { status: 500, headers: { "Content-Type": "application/json" } });
    const payload = await req.json().catch(() => ({}));
    const solicitud = payload.record ?? payload;
    if (!solicitud || !solicitud.id) {
      return new Response(JSON.stringify({ ok: false, error: "Sin solicitud/id", payload_keys: Object.keys(payload) }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: todos, error } = await supabase.from("grueros")
      .select("id, nombre, telefono, zona, municipios")
      .eq("disponible", true)
      .eq("aprobado", "SI");
    if (error) return new Response(JSON.stringify({ ok: false, error: "Error consultando grueros" }), { status: 500, headers: { "Content-Type": "application/json" } });
    if (!todos || todos.length === 0) return new Response(JSON.stringify({ ok: true, msg: "Sin grueros disponibles" }), { status: 200, headers: { "Content-Type": "application/json" } });

    const municipio = (solicitud.municipio ?? "").toString().trim();
    let grueros = todos;
    let modo = "todos";
    if (municipio) {
      const muniNorm = normMuni(municipio);
      const enZona = todos.filter((g: any) =>
        Array.isArray(g.municipios) &&
        g.municipios.some((x: string) => normMuni(x) === muniNorm)
      );
      if (enZona.length > 0) { grueros = enZona; modo = `zona:${municipio}`; }
      else { modo = `zona:${municipio} (sin cobertura -> todos)`; }
    }

    const cliente = solicitud.cliente_nombre ?? "Un motero";
    const ubicacion = solicitud.ubicacion ?? "Ubicacion no indicada";
    const telefono = solicitud.cliente_telefono ?? "-";

    const langNuevo = await aprobada(TPL_NUEVO);
    const usarNuevo = !!langNuevo;
    const langViejo = usarNuevo ? null : await aprobada(TPL_VIEJO);

    const resultados = [];
    for (const g of grueros) {
      const to = normalizePhone(g.telefono);
      if (!to) {
        await supabase.from("cartero_logs").insert({ solicitud_id: solicitud.id, gruero_nombre: g.nombre, telefono_destino: "INVALIDO", plantilla: "-", wa_status: 0, wa_response: {error: "telefono invalido"}, modo });
        resultados.push({ gruero: g.nombre, ok: false, error: "telefono invalido" });
        continue;
      }

      let template: any;
      const plantillaNombre = usarNuevo ? TPL_NUEVO : TPL_VIEJO;
      if (usarNuevo) {
        const enlace = `${BASE_ACEPTAR}${solicitud.id}&g=${g.id}`;
        template = { name: TPL_NUEVO, language: { code: langNuevo }, components: [{ type: "body", parameters: [
          { type: "text", parameter_name: "cliente", text: String(cliente) },
          { type: "text", parameter_name: "ubicacion", text: String(ubicacion) },
          { type: "text", parameter_name: "enlace", text: enlace },
        ] }] };
      } else {
        template = { name: TPL_VIEJO, language: { code: langViejo || "es_CO" }, components: [{ type: "body", parameters: [
          { type: "text", parameter_name: "cliente", text: String(cliente) },
          { type: "text", parameter_name: "whatsapp", text: String(telefono) },
          { type: "text", parameter_name: "ubicacion", text: String(ubicacion) },
        ] }] };
      }

      const resp = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template }),
      });
      const j = await resp.json().catch(() => ({}));
      
      await supabase.from("cartero_logs").insert({ solicitud_id: solicitud.id, gruero_nombre: g.nombre, telefono_destino: to, plantilla: plantillaNombre, wa_status: resp.status, wa_response: j, modo });
      
      resultados.push({ gruero: g.nombre, to, ok: resp.ok, status: resp.status, wa_response: j, plantilla: plantillaNombre });
    }

    // Fire push notifications — best-effort, don't block WhatsApp response
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
      body: JSON.stringify({ sol_id: solicitud.id, municipio: solicitud.municipio }),
    }).catch(() => {});

    return new Response(JSON.stringify({ ok: true, modo, plantilla_usada: usarNuevo ? TPL_NUEVO : TPL_VIEJO, template_aprobado: usarNuevo ? langNuevo : langViejo, avisados: resultados.length, enviados: resultados }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
