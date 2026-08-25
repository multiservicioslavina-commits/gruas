// ─────────────────────────────────────────────────────────────────
// rita-push — Scheduler de recordatorios y notificaciones proactivas
//
// Esta funcion se ejecuta periodicamente (cron o trigger externo).
// 1. Lee rita_seguimiento donde fecha_followup <= ahora y completado = false
// 2. Envia un WhatsApp al rider con el recordatorio
// 3. Marca el registro como completado
// 4. Registra en rita_notif_log
// ─────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL  = Deno.env.get("SUPABASE_URL")!;
const SB_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WA_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const RITA_PHONE = Deno.env.get("RITA_PHONE_ID") ?? "1238785075974458";
const GRAPH = "https://graph.facebook.com/v25.0";

const supabase = createClient(SB_URL, SB_KEY);

// Mensajes segun tipo de recordatorio
function mensajeRecordatorio(tipo: string, nota: string): string {
  const emojis: Record<string, string> = {
    aceite: "\u{1F6E2}️",
    soat: "\u{1F4C4}",
    tecnomecanica: "\u{1F527}",
    revision: "\u{1F50D}",
    rodada: "\u{1F3CD}️",
    otro: "\u{1F4C5}",
  };

  const emoji = emojis[tipo] ?? "\u{1F4C5}";
  const tipoBonito: Record<string, string> = {
    aceite: "cambio de aceite",
    soat: "vencimiento de SOAT",
    tecnomecanica: "tecnomecanica",
    revision: "revision mecanica",
    rodada: "rodada",
    otro: "recordatorio",
  };

  const label = tipoBonito[tipo] ?? tipo;
  return `${emoji} Ey parce! Te tengo un recordatorio:\n\n*${label.charAt(0).toUpperCase() + label.slice(1)}*\n${nota}\n\nSi ya lo atendiste, responde "listo" y lo marco. Si quieres reprogramarlo, dime cuando.`;
}

async function enviarWhatsApp(to: string, texto: string): Promise<boolean> {
  try {
    const res = await fetch(`${GRAPH}/${RITA_PHONE}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WA_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: texto },
      }),
    });
    const data = await res.json();
    return res.ok && !data.error;
  } catch (e) {
    console.error(`Error enviando WA a ${to}:`, e);
    return false;
  }
}

async function registrarLog(
  telefono: string,
  tipo: string,
  mensaje: string,
  enviado: boolean,
): Promise<void> {
  try {
    await supabase.from("rita_notif_log").insert({
      telefono,
      tipo,
      mensaje,
      enviado_at: enviado ? new Date().toISOString() : null,
    });
  } catch (e) {
    console.error("Error registrando log:", e);
  }
}

Deno.serve(async (req: Request) => {
  // Verificacion simple de seguridad por header
  const authHeader = req.headers.get("Authorization");
  const expectedToken = Deno.env.get("RITA_CRON_TOKEN") ?? "";
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const ahora = new Date().toISOString();

    // Busca recordatorios pendientes cuya fecha ya llego
    const { data: pendientes, error } = await supabase
      .from("rita_seguimiento")
      .select("id, telefono, tipo, nota, fecha_followup")
      .lte("fecha_followup", ahora)
      .eq("completado", false)
      .limit(50);

    if (error) {
      console.error("Error leyendo rita_seguimiento:", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
    }

    if (!pendientes || pendientes.length === 0) {
      return new Response(JSON.stringify({ ok: true, enviados: 0, mensaje: "Sin recordatorios pendientes" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`Procesando ${pendientes.length} recordatorios pendientes`);

    let enviados = 0;
    let fallidos = 0;

    for (const rec of pendientes) {
      const telefono = String(rec.telefono ?? "");
      const tipo = String(rec.tipo ?? "otro");
      const nota = String(rec.nota ?? "");

      if (!telefono) continue;

      const mensaje = mensajeRecordatorio(tipo, nota);
      const ok = await enviarWhatsApp(telefono, mensaje);

      // Marca como completado sin importar si el envio fallo
      // (para no reintentar indefinidamente con numeros incorrectos)
      await supabase.from("rita_seguimiento")
        .update({ completado: true })
        .eq("id", rec.id);

      await registrarLog(telefono, tipo, mensaje, ok);

      if (ok) enviados++;
      else fallidos++;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total: pendientes.length,
        enviados,
        fallidos,
        timestamp: ahora,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("rita-push error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});