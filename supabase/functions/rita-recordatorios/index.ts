// ─────────────────────────────────────────────────────────────────
// Rita — Envio de los recordatorios que ella misma prometio
//
// Rita crea recordatorios con la herramienta crear_recordatorio, que
// escribe en rita_seguimiento. Sin esta funcion esa promesa no se
// cumple: la tabla se llena y nadie la lee.
//
// Corre a diario por pg_cron. Busca lo vencido, lo envia y lo marca.
//
// Sobre el consentimiento: un recordatorio que el rider pidio
// explicitamente es transaccional, no publicidad, asi que se envia
// aunque haya rechazado las comunicaciones de marketing. Lo que si se
// respeta es una revocacion total.
// ─────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const WA_TOKEN    = Deno.env.get("WHATSAPP_TOKEN") ?? Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
const RITA_PHONE  = Deno.env.get("RITA_PHONE_ID") ?? "1238785075974458";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "rid3ra_cron_2026";
const SB_URL      = Deno.env.get("SUPABASE_URL")!;
const SB_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH       = "https://graph.facebook.com/v25.0";

const supabase = createClient(SB_URL, SB_KEY);

// Meta rechaza el texto libre pasadas 24 horas del ultimo mensaje del
// usuario. Cuando eso ocurre hay que usar una plantilla aprobada.
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
  return `Ey parce, ${titulo.toLowerCase()} 🏍️\n\n${nota}\n\nMe lo pediste tu. Si ya lo hiciste, ignoralo tranquilo.`;
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

Deno.serve(async (req: Request) => {
  const secreto = req.headers.get("x-ridera-cron")
    ?? new URL(req.url).searchParams.get("secret")
    ?? "";
  if (secreto !== CRON_SECRET) {
    return new Response("no autorizado", { status: 401 });
  }

  const soloPrueba = new URL(req.url).searchParams.get("dry") === "1";

  try {
    const ahora = new Date().toISOString();
    const { data: pendientes, error } = await supabase
      .from("rita_seguimiento")
      .select("id, telefono, tipo, nota, fecha_followup")
      .eq("completado", false)
      .lte("fecha_followup", ahora)
      .order("fecha_followup", { ascending: true })
      .limit(100);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    if (!pendientes?.length) {
      return new Response(JSON.stringify({ ok: true, pendientes: 0, enviados: 0 }, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (soloPrueba) {
      return new Response(JSON.stringify({
        ok: true,
        modo: "prueba, no se envio nada",
        pendientes: pendientes.length,
        detalle: pendientes.map(p => ({ tipo: p.tipo, nota: p.nota, fecha: p.fecha_followup })),
      }, null, 2), { headers: { "Content-Type": "application/json" } });
    }

    const resultados: Record<string, unknown>[] = [];

    for (const r of pendientes) {
      // Quien revoco por completo no recibe nada, ni siquiera lo que pidio.
      const { data: consentimiento } = await supabase
        .from("rita_consentimiento")
        .select("acepta, fecha_revocacion")
        .eq("telefono", r.telefono)
        .maybeSingle();

      if (consentimiento && !consentimiento.acepta && consentimiento.fecha_revocacion) {
        await supabase.from("rita_seguimiento").update({ completado: true }).eq("id", r.id);
        resultados.push({ id: r.id, estado: "omitido", motivo: "el rider revoco las comunicaciones" });
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
        // El recordatorio queda en el historial para que Rita tenga contexto
        // si el rider responde.
        await supabase.from("rita_messages").insert({
          phone: r.telefono, role: "assistant", content: texto,
        });
        resultados.push({ id: r.id, estado: "enviado", tipo: r.tipo });
      } else if (envio.codigo === FUERA_DE_VENTANA) {
        // No se reintenta: sin plantilla aprobada volveria a fallar igual.
        await supabase.from("rita_seguimiento").update({ completado: true }).eq("id", r.id);
        resultados.push({
          id: r.id,
          estado: "no entregado",
          motivo: "fuera de la ventana de 24h de WhatsApp; hace falta una plantilla aprobada por Meta",
        });
      } else {
        // Fallo transitorio: se deja pendiente para el siguiente ciclo.
        resultados.push({ id: r.id, estado: "reintentara", codigo: envio.codigo, detalle: envio.detalle });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      pendientes: pendientes.length,
      enviados: resultados.filter(r => r.estado === "enviado").length,
      detalle: resultados,
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
