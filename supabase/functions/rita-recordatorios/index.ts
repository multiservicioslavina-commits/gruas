// Rita - Envio de los recordatorios que ella misma prometio
//
// Corre cada pocos minutos por pg_cron. Procesa DOS fuentes:
//
//   1. rita_seguimiento         -> recordatorios "simples" (crear_recordatorio):
//      cambio de aceite, SOAT, revision. Campo de control: completado.
//
//   2. recordatorios_programados -> recordatorios con FECHA Y HORA exacta
//      (programar_recordatorio_avanzado: "recordame a las 2"). Campo de
//      control: enviado. Antes esta tabla no tenia quien la leyera y los
//      recordatorios quedaban guardados pero nunca se enviaban.
//
// Ventana de 24h de WhatsApp: el texto libre solo se entrega si el rider
// escribio en las ultimas 24h. Fuera de esa ventana, para SOAT usamos la
// plantilla aprobada recordatorio_soat_v2; para el resto (texto libre) no
// hay plantilla generica, asi que se marca como procesado y se registra
// que no se pudo entregar, para no reintentar en un bucle infinito.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const WA_TOKEN    = Deno.env.get("WHATSAPP_TOKEN") ?? Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
const RITA_PHONE  = Deno.env.get("RITA_PHONE_ID") ?? "1238785075974458";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "rid3ra_cron_2026";
const SB_URL      = Deno.env.get("SUPABASE_URL")!;
const SB_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH       = "https://graph.facebook.com/v25.0";

const supabase = createClient(SB_URL, SB_KEY);

const FUERA_DE_VENTANA = 131047;

const ENCABEZADO: Record<string, string> = {
  aceite:        "Recordatorio de cambio de aceite",
  soat:          "Recordatorio de SOAT",
  tecnomecanica: "Recordatorio de tecnomecanica",
  revision:      "Recordatorio de revision",
  rodada:        "Recordatorio de rodada",
  otro:          "Recordatorio",
};

function redactar(tipo: string, nota: string): string {
  const titulo = ENCABEZADO[tipo] ?? ENCABEZADO.otro;
  return `Ey parce, ${titulo.toLowerCase()} \u{1F3CD}️\n\n${nota}\n\nMe lo pediste tú. Si ya lo hiciste, ignoralo tranquilo.`;
}

// Texto para los recordatorios con hora exacta (recordatorios_programados).
function redactarProgramado(asunto: string, descripcion: string): string {
  const cuerpo = descripcion && descripcion.trim() ? `${asunto}\n${descripcion.trim()}` : asunto;
  return `Ey parce, te recuerdo esto \u{1F3CD}️\n\n${cuerpo}\n\nMe lo pediste tú. Si ya lo hiciste, ignoralo tranquilo.`;
}

async function enviar(to: string, texto: string): Promise<{ ok: boolean; codigo: number | null; detalle: string }> {
  const res = await fetch(`${GRAPH}/${RITA_PHONE}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: texto } }),
  });
  const cuerpo = await res.json().catch(() => ({}));
  if (res.ok && !cuerpo?.error) return { ok: true, codigo: null, detalle: "enviado" };
  return {
    ok: false,
    codigo: cuerpo?.error?.code ?? null,
    detalle: cuerpo?.error?.message ?? `HTTP ${res.status}`,
  };
}

async function enviarPlantilla(to: string, name: string, bodyParams: string[]): Promise<boolean> {
  try {
    const components = bodyParams.length
      ? [{ type: "body", parameters: bodyParams.map(t => ({ type: "text", text: t })) }]
      : [];
    const r = await fetch(`${GRAPH}/${RITA_PHONE}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name,
          language: { code: "es_CO" },
          ...(components.length ? { components } : {}),
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  } catch { return false; }
}

async function getNombre(telefono: string): Promise<string> {
  const tel = telefono.replace(/^57/, "");
  const { data } = await supabase
    .from("riders")
    .select("nombre")
    .or(`telefono.eq.${tel},telefono.eq.57${tel}`)
    .maybeSingle();
  return (data?.nombre ?? "").split(" ")[0] || "parcero";
}

// Verifica si el rider revoco por completo las comunicaciones de Rita.
async function revocoComunicaciones(telefono: string): Promise<boolean> {
  const { data } = await supabase
    .from("rita_consentimiento")
    .select("acepta, fecha_revocacion")
    .eq("telefono", telefono)
    .maybeSingle();
  return !!(data && !data.acepta && data.fecha_revocacion);
}

// ─── Fuente 1: rita_seguimiento (recordatorios simples) ──────────────
async function procesarSeguimiento(soloPrueba: boolean): Promise<Record<string, unknown>[]> {
  const ahora = new Date().toISOString();
  const { data: pendientes, error } = await supabase
    .from("rita_seguimiento")
    .select("id, telefono, tipo, nota, fecha_followup")
    .eq("completado", false)
    .lte("fecha_followup", ahora)
    .order("fecha_followup", { ascending: true })
    .limit(100);

  if (error) throw new Error(`rita_seguimiento: ${error.message}`);
  if (!pendientes?.length) return [];

  if (soloPrueba) {
    return pendientes.map(p => ({ fuente: "seguimiento", id: p.id, tipo: p.tipo, nota: p.nota, fecha: p.fecha_followup, estado: "prueba" }));
  }

  const resultados: Record<string, unknown>[] = [];

  for (const r of pendientes) {
    if (await revocoComunicaciones(r.telefono)) {
      await supabase.from("rita_seguimiento").update({ completado: true }).eq("id", r.id);
      resultados.push({ fuente: "seguimiento", id: r.id, estado: "omitido", motivo: "el rider revoco las comunicaciones" });
      continue;
    }

    const texto = redactar(r.tipo, r.nota);
    const envio = await enviar(r.telefono, texto);

    await supabase.from("rita_notif_log").insert({
      telefono: r.telefono,
      tipo: `recordatorio_${r.tipo}`,
      mensaje: envio.ok ? texto : `FALLO (${envio.codigo}): ${envio.detalle}`,
    });

    if (envio.ok) {
      await supabase.from("rita_seguimiento").update({ completado: true }).eq("id", r.id);
      await supabase.from("rita_messages").insert({ phone: r.telefono, role: "assistant", content: texto });
      resultados.push({ fuente: "seguimiento", id: r.id, estado: "enviado", tipo: r.tipo });

    } else if (envio.codigo === FUERA_DE_VENTANA) {
      let plantillaOk = false;
      const nombre = await getNombre(r.telefono);
      if (r.tipo === "soat") {
        plantillaOk = await enviarPlantilla(r.telefono, "recordatorio_soat_v2", [nombre, r.nota]);
      }
      await supabase.from("rita_seguimiento").update({ completado: true }).eq("id", r.id);
      if (plantillaOk) {
        await supabase.from("rita_messages").insert({ phone: r.telefono, role: "assistant", content: `[plantilla] ${r.nota}` });
        resultados.push({ fuente: "seguimiento", id: r.id, estado: "enviado via plantilla", tipo: r.tipo });
      } else {
        resultados.push({
          fuente: "seguimiento", id: r.id, estado: "no entregado",
          motivo: r.tipo === "soat" ? "fuera de ventana 24h y la plantilla fallo" : `fuera de ventana 24h; sin plantilla aprobada para tipo "${r.tipo}"`,
        });
      }

    } else {
      resultados.push({ fuente: "seguimiento", id: r.id, estado: "reintentara", codigo: envio.codigo, detalle: envio.detalle });
    }
  }

  return resultados;
}

// ─── Fuente 2: recordatorios_programados (con fecha y hora exacta) ────
async function procesarProgramados(soloPrueba: boolean): Promise<Record<string, unknown>[]> {
  const ahora = new Date().toISOString();
  const { data: pendientes, error } = await supabase
    .from("recordatorios_programados")
    .select("id, telefono, asunto, descripcion, fecha_hora")
    .eq("enviado", false)
    .eq("cancelado", false)
    .lte("fecha_hora", ahora)
    .order("fecha_hora", { ascending: true })
    .limit(100);

  if (error) throw new Error(`recordatorios_programados: ${error.message}`);
  if (!pendientes?.length) return [];

  if (soloPrueba) {
    return pendientes.map(p => ({ fuente: "programado", id: p.id, asunto: p.asunto, fecha: p.fecha_hora, estado: "prueba" }));
  }

  const resultados: Record<string, unknown>[] = [];

  for (const r of pendientes) {
    if (await revocoComunicaciones(r.telefono)) {
      await supabase.from("recordatorios_programados")
        .update({ enviado: true, enviado_at: new Date().toISOString() }).eq("id", r.id);
      resultados.push({ fuente: "programado", id: r.id, estado: "omitido", motivo: "el rider revoco las comunicaciones" });
      continue;
    }

    const texto = redactarProgramado(String(r.asunto ?? ""), String(r.descripcion ?? ""));
    const envio = await enviar(r.telefono, texto);

    await supabase.from("rita_notif_log").insert({
      telefono: r.telefono,
      tipo: "recordatorio_programado",
      mensaje: envio.ok ? texto : `FALLO (${envio.codigo}): ${envio.detalle}`,
    });

    if (envio.ok) {
      await supabase.from("recordatorios_programados")
        .update({ enviado: true, enviado_at: new Date().toISOString() }).eq("id", r.id);
      await supabase.from("rita_messages").insert({ phone: r.telefono, role: "assistant", content: texto });
      resultados.push({ fuente: "programado", id: r.id, estado: "enviado" });

    } else if (envio.codigo === FUERA_DE_VENTANA) {
      // Texto libre fuera de la ventana de 24h: no hay plantilla generica
      // aprobada por Meta para este contenido. Se marca como procesado para
      // no reintentar sin fin y se deja registro de que no se entrego.
      await supabase.from("recordatorios_programados")
        .update({ enviado: true, enviado_at: new Date().toISOString() }).eq("id", r.id);
      resultados.push({ fuente: "programado", id: r.id, estado: "no entregado", motivo: "fuera de ventana 24h; sin plantilla aprobada para texto libre" });

    } else {
      // Fallo transitorio: se deja pendiente para el siguiente ciclo.
      resultados.push({ fuente: "programado", id: r.id, estado: "reintentara", codigo: envio.codigo, detalle: envio.detalle });
    }
  }

  return resultados;
}

Deno.serve(async (req: Request) => {
  const secreto = req.headers.get("x-ridera-cron")
    ?? new URL(req.url).searchParams.get("secret")
    ?? "";
  if (secreto !== CRON_SECRET) {
    return new Response("no autorizado", { status: 401 });
  }

  const soloPrueba = new URL(req.url).searchParams.get("dry") === "1";

  try {
    const [resSeguimiento, resProgramados] = await Promise.all([
      procesarSeguimiento(soloPrueba),
      procesarProgramados(soloPrueba),
    ]);
    const detalle = [...resSeguimiento, ...resProgramados];
    const enviados = detalle.filter(r => r.estado === "enviado" || r.estado === "enviado via plantilla").length;

    return new Response(JSON.stringify({
      ok: true,
      modo: soloPrueba ? "prueba, no se envio nada" : "normal",
      pendientes: detalle.length,
      enviados,
      detalle,
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
