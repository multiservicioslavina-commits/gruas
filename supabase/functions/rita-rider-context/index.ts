import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Pico y placa Medellín y Área Metropolitana
// Carros: último número de la placa
// Motos 2T y 4T: primer número de la placa
// Horario: 5:00 a.m. a 8:00 p.m.

// 1er Semestre 2026 (2 feb - 31 jul 2026)
const PP_S1_CARROS: Record<number, number[]> = {
  1: [1, 7], // lunes
  2: [0, 3], // martes
  3: [4, 6], // miércoles
  4: [5, 9], // jueves
  5: [2, 8], // viernes
};
const PP_S1_MOTOS: Record<number, number[]> = {
  1: [1, 7],
  2: [0, 3],
  3: [4, 6],
  4: [5, 9],
  5: [2, 8],
};

// 2do Semestre 2026 (3 ago 2026 en adelante)
const PP_S2_CARROS: Record<number, number[]> = {
  1: [5, 8], // lunes
  2: [1, 4], // martes
  3: [0, 2], // miércoles
  4: [3, 6], // jueves
  5: [7, 9], // viernes
};
const PP_S2_MOTOS: Record<number, number[]> = {
  1: [5, 8],
  2: [1, 4],
  3: [0, 2],
  4: [3, 6],
  5: [7, 9],
};

const FECHA_INICIO_S2 = new Date("2026-08-03T00:00:00-05:00");

// El runtime de las edge functions corre en UTC, así que new Date().getDay()
// devuelve el día del servidor, no el de Colombia. A partir de las 7 p.m.
// colombianas ya es el día siguiente en UTC, y sin esta corrección el pico y
// placa se calculaba contra la tabla del día equivocado durante las últimas
// cinco horas de cada día. Colombia es UTC-5 fijo, sin horario de verano.
const OFFSET_COLOMBIA_MS = 5 * 60 * 60 * 1000;

function ahoraEnColombia(): Date {
  return new Date(Date.now() - OFFSET_COLOMBIA_MS);
}

function diaEnColombia(): number {
  return ahoraEnColombia().getUTCDay();
}

function getRotacionActual(): { carros: Record<number, number[]>; motos: Record<number, number[]>; semestre: string } {
  const ahora = new Date();
  if (ahora >= FECHA_INICIO_S2) {
    return { carros: PP_S2_CARROS, motos: PP_S2_MOTOS, semestre: "2do sem 2026" };
  }
  return { carros: PP_S1_CARROS, motos: PP_S1_MOTOS, semestre: "1er sem 2026" };
}

function checkPicoPlaca(placa: string | null, tipoVehiculo: string = "moto"): { tiene: boolean; mensaje: string } {
  if (!placa) return { tiene: false, mensaje: "No has registrado tu placa en el perfil." };

  const dia = diaEnColombia();
  if (dia === 0 || dia === 6) return { tiene: false, mensaje: `Hoy es fin de semana, no hay pico y placa. Tu placa ${placa} puede circular.` };

  const { carros, motos, semestre } = getRotacionActual();
  const esMoto = tipoVehiculo.toLowerCase().includes("moto") || tipoVehiculo.toLowerCase().includes("bike");
  const tabla = esMoto ? motos : carros;

  // En ambos casos se trabaja solo con los dígitos: las placas colombianas
  // mezclan letras y números, y tomar el último carácter sin filtrar se rompe
  // con formatos como TQK12F.
  const digitos = placa.replace(/\D/g, "");
  if (!digitos) return { tiene: false, mensaje: "Placa no válida." };
  const digito = parseInt(esMoto ? digitos.charAt(0) : digitos.charAt(digitos.length - 1));
  const criterio = esMoto ? "primer" : "último";

  if (isNaN(digito)) return { tiene: false, mensaje: "Placa no válida." };

  const restringidos = tabla[dia] || [];
  if (restringidos.includes(digito)) {
    return { tiene: true, mensaje: `⚠️ HOY tienes pico y placa (${semestre}). Tu placa ${placa} (${criterio} dígito: ${digito}) NO puede circular de 5am a 8pm.` };
  }
  return { tiene: false, mensaje: `✅ Hoy NO tienes pico y placa. Tu placa ${placa} (${criterio} dígito: ${digito}) puede circular.` };
}

function checkDocumentos(soat: string | null, tecno: string | null): { soat: string; tecno: string; alertas: string[] } {
  const hoy = new Date();
  const alertas: string[] = [];
  const evaluar = (nombre: string, fecha: string | null): string => {
    if (!fecha) return "No registrado";
    const vence = new Date(fecha);
    const dias = Math.ceil((vence.getTime() - hoy.getTime()) / 86400000);
    if (dias < 0) { alertas.push(`🚨 ${nombre} VENCIDO hace ${Math.abs(dias)} días`); return `VENCIDO (${fecha})`; }
    if (dias <= 30) { alertas.push(`⚠️ ${nombre} vence en ${dias} días (${fecha})`); return `Vence pronto: ${dias} días (${fecha})`; }
    return `Vigente hasta ${fecha} (${dias} días)`;
  };
  return { soat: evaluar("SOAT", soat), tecno: evaluar("Tecnomecánica", tecno), alertas };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
  }

  try {
    const { telefono } = await req.json();
    if (!telefono) return new Response(JSON.stringify({ error: "Se requiere telefono" }), { status: 400 });

    const tel = telefono.replace(/\D/g, "").replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id, nombre, apellido, ciudad, moto_marca, moto_modelo, moto_cc, tipo_moto, placa, soat_vence, tecno_vence")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) {
      return new Response(JSON.stringify({
        encontrado: false,
        mensaje: "No encontré tu perfil. Regístrate en la app RIDERA para que pueda darte info personalizada."
      }), { headers: { "Content-Type": "application/json" } });
    }

    const picoPlaca = checkPicoPlaca(rider.placa, "moto");

    const docs = checkDocumentos(rider.soat_vence, rider.tecno_vence);

    const { data: rodadas } = await supabase
      .from("members")
      .select("ride_id, distance_km, duration_seconds, max_speed_kmh, finished_at, rides!inner(nombre, origin_name, destination_name)")
      .eq("uid", rider.id)
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(10);

    const totalRodadas = rodadas?.length ?? 0;
    const totalKm = rodadas?.reduce((s, r) => s + (r.distance_km || 0), 0) ?? 0;
    const maxVel = rodadas?.reduce((m, r) => Math.max(m, r.max_speed_kmh || 0), 0) ?? 0;
    const totalMinutos = rodadas?.reduce((s, r) => s + ((r.duration_seconds || 0) / 60), 0) ?? 0;

    const { data: proximas } = await supabase
      .from("rides")
      .select("id, nombre, origin_name, destination_name, planned_distance_km, created_at")
      .eq("estado", "activa")
      .order("created_at", { ascending: false })
      .limit(5);

    const historial = (rodadas || []).map(r => ({
      nombre: (r as any).rides?.nombre || "Sin nombre",
      origen: (r as any).rides?.origin_name,
      destino: (r as any).rides?.destination_name,
      distancia_km: r.distance_km ? Number(r.distance_km).toFixed(1) : "0",
      duracion_min: r.duration_seconds ? Math.round(r.duration_seconds / 60) : 0,
      vel_max: r.max_speed_kmh ? Number(r.max_speed_kmh).toFixed(0) : "0",
      fecha: r.finished_at?.split("T")[0] || "",
    }));

    const resultado = {
      encontrado: true,
      perfil: {
        nombre: [rider.nombre, rider.apellido].filter(Boolean).join(" "),
        ciudad: rider.ciudad || "No registrada",
        moto: [rider.moto_marca, rider.moto_modelo, rider.moto_cc ? `${rider.moto_cc}cc` : ""].filter(Boolean).join(" ") || "No registrada",
        tipo_moto: rider.tipo_moto || "No registrado",
        placa: rider.placa || "No registrada",
      },
      pico_placa: picoPlaca,
      documentos: { soat: docs.soat, tecno: docs.tecno, alertas: docs.alertas },
      estadisticas: {
        total_rodadas: totalRodadas,
        total_km: Number(totalKm.toFixed(1)),
        max_velocidad_kmh: Number(maxVel.toFixed(0)),
        total_horas: Number((totalMinutos / 60).toFixed(1)),
      },
      historial,
      eventos_proximos: (proximas || []).map(r => ({
        nombre: r.nombre,
        origen: r.origin_name,
        destino: r.destination_name,
        distancia_km: r.planned_distance_km,
      })),
    };

    return new Response(JSON.stringify(resultado), {
      headers: { "Content-Type": "application/json", "Connection": "keep-alive" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
