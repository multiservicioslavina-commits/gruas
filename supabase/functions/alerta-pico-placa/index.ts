// Alerta matutina de Pico y Placa para motos — Valle de Aburrá.
//
// La dispara pg_cron todos los días hábiles a las 6:15 a.m. hora Colombia
// (ver migración 20260909_alerta_pico_placa.sql). Sigue el mismo patrón que
// rita-recordatorios: protegida por CRON_SECRET, ?dry=1 para probar sin
// enviar nada, y WhatsApp via el mismo número/token de Rita.
//
// Fuente de los riders: rider_motorcycles (esta_activa=true, sin
// fecha_fin_propiedad, con placa) es la única tabla donde TODOS los caminos
// de registro (Rita/WhatsApp vía profile.ts, y la Hoja de Vida vía
// hoja-vida/index.ts) terminan guardando la moto activa de un rider. No se
// necesitó ninguna columna nueva para la placa ni para "el dígito": el
// dígito se extrae aquí mismo con una regex sobre el texto ya guardado.
//
// IMPORTANTE — plantilla de WhatsApp: a las 6:15 a.m. casi ningún rider le
// habrá escrito a Rita en las últimas 24h, así que un mensaje de texto
// libre (fuera de esa ventana) lo rechaza Meta con el código 131047. Para
// que esta alerta llegue de verdad hace falta una PLANTILLA aprobada por
// Meta (igual que "recordatorio_soat_v2", que ya usa rita-recordatorios).
// Sin esa plantilla creada y aprobada, esta función queda funcionando pero
// la mayoría de los envíos van a quedar registrados como "no entregado".
const PLANTILLA_PICO_PLACA = "pico_placa_am"; // crear y aprobar en Meta Business Manager

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const WA_TOKEN    = Deno.env.get("WHATSAPP_TOKEN") ?? Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
const RITA_PHONE  = Deno.env.get("RITA_PHONE_ID") ?? "1260857797114684";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "rid3ra_cron_2026";
const SB_URL      = Deno.env.get("SUPABASE_URL")!;
const SB_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH       = "https://graph.facebook.com/v25.0";

const supabase = createClient(SB_URL, SB_KEY);

const FUERA_DE_VENTANA = 131047;

// Primer dígito de la placa restringido por día, Valle de Aburrá (motos).
// getDay(): 0=domingo ... 6=sábado. Sábado/domingo no tienen entrada -> no aplica.
const DIGITOS_POR_DIA: Record<number, number[]> = {
  1: [5, 8], // lunes
  2: [1, 4], // martes
  3: [0, 2], // miércoles
  4: [3, 6], // jueves
  5: [7, 9], // viernes
};

// ─── Fecha y día de la semana en hora Colombia (sin depender de la TZ del runtime) ───
function hoyEnBogota(): { fecha: string; weekday: number } {
  const ahora = new Date();
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(ahora);

  const get = (tipo: string) => partes.find(p => p.type === tipo)?.value ?? "";
  const fecha = `${get("year")}-${get("month")}-${get("day")}`; // YYYY-MM-DD
  const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = DIAS[get("weekday")] ?? new Date(fecha).getDay();
  return { fecha, weekday };
}

// Primer carácter numérico de la placa, escaneando de izquierda a derecha
// (ej. "ABC12D" -> 1). Placas sin ningún dígito (raro, pero posible en
// datos sucios) simplemente no matchean ningún día.
function primerDigito(placa: string | null): number | null {
  if (!placa) return null;
  const m = placa.match(/\d/);
  return m ? Number(m[0]) : null;
}

// Normaliza a "57XXXXXXXXXX": riders.telefono se guarda sin el 57 (ver
// rita-v2/index.ts:194), pero rita_consentimiento y la API de WhatsApp
// necesitan el número completo con indicativo.
function normalizarTelefono(raw: string): string {
  const digitos = (raw || "").replace(/\D/g, "");
  const local = digitos.replace(/^57/, "");
  return "57" + local;
}

async function esFestivo(fecha: string): Promise<boolean> {
  const { data } = await supabase.from("festivos_colombia").select("fecha").eq("fecha", fecha).maybeSingle();
  return !!data;
}

async function revocoComunicaciones(telefono: string): Promise<boolean> {
  const { data } = await supabase
    .from("rita_consentimiento")
    .select("acepta, fecha_revocacion")
    .eq("telefono", telefono)
    .maybeSingle();
  return !!(data && !data.acepta && data.fecha_revocacion);
}

async function yaProcesadoHoy(fecha: string, telefono: string): Promise<boolean> {
  const { data } = await supabase
    .from("pico_placa_notif_log")
    .select("telefono")
    .eq("fecha", fecha)
    .eq("telefono", telefono)
    .maybeSingle();
  return !!data;
}

async function registrarLog(fecha: string, telefono: string, digito: number, enviado: boolean, detalle: string) {
  await supabase.from("pico_placa_notif_log").upsert(
    { fecha, telefono, digito, enviado, detalle },
    { onConflict: "fecha,telefono" },
  );
}

type Candidato = { riderId: string; nombre: string; telefono: string; placa: string; digito: number };

async function obtenerCandidatos(digitosHoy: number[]): Promise<Candidato[]> {
  const { data: motos, error } = await supabase
    .from("rider_motorcycles")
    .select("rider_id, placa")
    .eq("esta_activa", true)
    .is("fecha_fin_propiedad", null)
    .not("placa", "is", null);
  if (error) throw new Error(`rider_motorcycles: ${error.message}`);
  if (!motos?.length) return [];

  // rider_id -> {placa, digito} (si un rider tiene varias motos restringidas
  // hoy, solo se le manda una alerta, con la primera que coincida)
  const porRider = new Map<string, { placa: string; digito: number }>();
  for (const m of motos) {
    const digito = primerDigito(m.placa);
    if (digito === null || !digitosHoy.includes(digito)) continue;
    if (!porRider.has(m.rider_id)) porRider.set(m.rider_id, { placa: m.placa, digito });
  }
  if (!porRider.size) return [];

  const riderIds = [...porRider.keys()];
  const { data: riders, error: errRiders } = await supabase
    .from("riders")
    .select("id, nombre, telefono")
    .in("id", riderIds)
    .not("telefono", "is", null);
  if (errRiders) throw new Error(`riders: ${errRiders.message}`);

  type RiderRow = { id: string; nombre: string | null; telefono: string | null };
  type RiderConTelefono = RiderRow & { telefono: string };

  return ((riders ?? []) as RiderRow[])
    .filter((r: RiderRow): r is RiderConTelefono => !!r.telefono)
    .map((r: RiderConTelefono) => {
      const info = porRider.get(r.id)!;
      return {
        riderId: r.id,
        nombre: (r.nombre || "").split(" ")[0] || "parcero",
        telefono: normalizarTelefono(r.telefono),
        placa: info.placa,
        digito: info.digito,
      };
    });
}

function mensaje(nombre: string, digito: number): string {
  return `¡Buenos días, ${nombre}! 🛵 Ojo que hoy tu nave tiene Pico y Placa (dígito ${digito}) en todo el Valle de Aburrá de 5:00 a. m. a 8:00 p. m. Evita fotomultas y rueda con cuidado. 🏍️💨`;
}

async function enviar(to: string, texto: string): Promise<{ ok: boolean; codigo: number | null; detalle: string }> {
  const res = await fetch(`${GRAPH}/${RITA_PHONE}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: texto } }),
  });
  const cuerpo = await res.json().catch(() => ({}));
  if (res.ok && !cuerpo?.error) return { ok: true, codigo: null, detalle: "enviado" };
  return { ok: false, codigo: cuerpo?.error?.code ?? null, detalle: cuerpo?.error?.message ?? `HTTP ${res.status}` };
}

async function enviarPlantilla(to: string, nombre: string, digito: string): Promise<boolean> {
  try {
    const r = await fetch(`${GRAPH}/${RITA_PHONE}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: PLANTILLA_PICO_PLACA,
          language: { code: "es_CO" },
          components: [{ type: "body", parameters: [{ type: "text", text: nombre }, { type: "text", text: digito }] }],
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  } catch { return false; }
}

Deno.serve(async (req: Request) => {
  const secreto = req.headers.get("x-ridera-cron") ?? new URL(req.url).searchParams.get("secret") ?? "";
  if (secreto !== CRON_SECRET) {
    return new Response("no autorizado", { status: 401 });
  }

  const soloPrueba = new URL(req.url).searchParams.get("dry") === "1";

  try {
    const { fecha, weekday } = hoyEnBogota();
    const digitosHoy = DIGITOS_POR_DIA[weekday];

    if (!digitosHoy) {
      return new Response(JSON.stringify({ ok: true, fecha, motivo: "fin de semana, no aplica pico y placa" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (await esFestivo(fecha)) {
      return new Response(JSON.stringify({ ok: true, fecha, motivo: "festivo, no aplica pico y placa" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const candidatos = await obtenerCandidatos(digitosHoy);

    if (soloPrueba) {
      return new Response(JSON.stringify({
        ok: true, modo: "prueba, no se envio nada", fecha, digitosHoy,
        candidatos: candidatos.length, detalle: candidatos,
      }, null, 2), { headers: { "Content-Type": "application/json" } });
    }

    const detalle: Record<string, unknown>[] = [];
    let enviados = 0;

    for (const c of candidatos) {
      if (await yaProcesadoHoy(fecha, c.telefono)) {
        detalle.push({ telefono: c.telefono, estado: "omitido", motivo: "ya se le envió hoy" });
        continue;
      }
      if (await revocoComunicaciones(c.telefono)) {
        await registrarLog(fecha, c.telefono, c.digito, false, "el rider revocó las comunicaciones");
        detalle.push({ telefono: c.telefono, estado: "omitido", motivo: "el rider revocó las comunicaciones" });
        continue;
      }

      const texto = mensaje(c.nombre, c.digito);
      const envio = await enviar(c.telefono, texto);

      await supabase.from("rita_notif_log").insert({
        telefono: c.telefono,
        tipo: "pico_y_placa",
        mensaje: envio.ok ? texto : `FALLO (${envio.codigo}): ${envio.detalle}`,
      });

      if (envio.ok) {
        await registrarLog(fecha, c.telefono, c.digito, true, "enviado");
        await supabase.from("rita_messages").insert({ phone: c.telefono, role: "assistant", content: texto });
        enviados++;
        detalle.push({ telefono: c.telefono, estado: "enviado", digito: c.digito });
      } else if (envio.codigo === FUERA_DE_VENTANA) {
        const plantillaOk = await enviarPlantilla(c.telefono, c.nombre, String(c.digito));
        await registrarLog(fecha, c.telefono, c.digito, plantillaOk, plantillaOk ? "enviado via plantilla" : "fuera de ventana 24h y sin plantilla aprobada");
        if (plantillaOk) {
          enviados++;
          detalle.push({ telefono: c.telefono, estado: "enviado via plantilla", digito: c.digito });
        } else {
          detalle.push({
            telefono: c.telefono, estado: "no entregado",
            motivo: `fuera de ventana 24h; crea y aprueba la plantilla "${PLANTILLA_PICO_PLACA}" en Meta Business Manager`,
          });
        }
      } else {
        // Falla transitoria: no se marca como procesado, para poder reintentar hoy.
        detalle.push({ telefono: c.telefono, estado: "reintentara", codigo: envio.codigo, detalle: envio.detalle });
      }
    }

    return new Response(JSON.stringify({
      ok: true, fecha, digitosHoy, candidatos: candidatos.length, enviados, detalle,
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
