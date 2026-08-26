// ─────────────────────────────────────────────────────────────────
// Rita Profile System — Memoria y contexto del rider
//
// Gestiona:
//   1. Perfil completo del rider (experiencia, contacto de emergencia)
//   2. Motos (rider puede tener varias)
//   3. Documentos y vencimientos (SOAT, técnica, etc)
//   4. Preferencias (alertas, privacidad, recomendaciones)
//   5. Actividad (para contexto y analytics)
// ─────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase: SupabaseClient = createClient(SB_URL, SB_KEY);

// ─── Tipos ───────────────────────────────────────────────────────
export type RiderProfile = {
  id: string;
  nombre: string;
  telefono: string;
  experiencia_nivel: "principiante" | "intermedio" | "avanzado";
  contacto_emergencia: string | null;
  telefono_emergencia: string | null;
  ubicacion_home: string | null;
  club_motociclista: string | null;
  sobre_ti: string | null;
  preferencias_rutas: "montaña" | "ciudad" | "carretera" | "variadas";
};

export type RiderMotorcycle = {
  id: string;
  marca: string;
  modelo: string;
  cc: number | null;
  anio: number | null;
  placa: string | null;
  capacidad_combustible: number | null;
  consumo_promedio: number | null;
  esta_activa: boolean;
};

export type RiderDocument = {
  id: string;
  tipo_documento: string;
  numero_documento: string | null;
  fecha_vencimiento: string | null;
  dias_alerta: number;
};

export type RiderRenewal = {
  id: string;
  tipo_renovacion: string;
  fecha_proximo_vencimiento: string;
  costo_estimado: number | null;
  fue_completada: boolean;
};

// ─── Obtener perfil completo del rider ────────────────────────────
export async function obtenerPerfilCompleto(
  phone: string,
): Promise<{
  perfil: RiderProfile | null;
  motos: RiderMotorcycle[];
  vencimientos: RiderRenewal[];
  proximos_30_dias: RiderRenewal[];
}> {
  try {
    const tel = phone.replace(/^57/, "");

    // Obtener perfil
    const { data: riderData } = await supabase
      .from("riders")
      .select("*")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!riderData) {
      return { perfil: null, motos: [], vencimientos: [], proximos_30_dias: [] };
    }

    // Obtener motos del rider
    const { data: motos } = await supabase
      .from("rider_motorcycles")
      .select("id, marca, modelo, cc, anio, placa, capacidad_combustible, consumo_promedio, esta_activa")
      .eq("rider_id", riderData.id)
      .eq("esta_activa", true);

    // Obtener vencimientos próximos (30 días)
    const hoy = new Date();
    const en30Dias = new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { data: vencimientos } = await supabase
      .from("rider_renewals")
      .select("id, tipo_renovacion, fecha_proximo_vencimiento, costo_estimado, fue_completada")
      .eq("rider_id", riderData.id)
      .eq("fue_completada", false)
      .gte("fecha_proximo_vencimiento", hoy.toISOString().split("T")[0])
      .lte("fecha_proximo_vencimiento", en30Dias.toISOString().split("T")[0])
      .order("fecha_proximo_vencimiento", { ascending: true });

    const { data: todosVencimientos } = await supabase
      .from("rider_renewals")
      .select("id, tipo_renovacion, fecha_proximo_vencimiento, costo_estimado, fue_completada")
      .eq("rider_id", riderData.id)
      .eq("fue_completada", false)
      .order("fecha_proximo_vencimiento", { ascending: true });

    return {
      perfil: riderData as RiderProfile,
      motos: (motos || []) as RiderMotorcycle[],
      vencimientos: (todosVencimientos || []) as RiderRenewal[],
      proximos_30_dias: (vencimientos || []) as RiderRenewal[],
    };
  } catch (e) {
    console.error("Error obteniendo perfil completo:", e);
    return { perfil: null, motos: [], vencimientos: [], proximos_30_dias: [] };
  }
}

// ─── Agregar o actualizar moto ────────────────────────────────────
export async function guardarMoto(
  riderId: string,
  moto: {
    marca: string;
    modelo: string;
    cc?: number;
    anio?: number;
    placa?: string;
    capacidad_combustible?: number;
  },
) {
  try {
    const { error } = await supabase.from("rider_motorcycles").insert({
      rider_id: riderId,
      marca: moto.marca,
      modelo: moto.modelo,
      cc: moto.cc || null,
      anio: moto.anio || null,
      placa: moto.placa || null,
      capacidad_combustible: moto.capacidad_combustible || null,
    });

    if (error) throw error;
    return true;
  } catch (e) {
    console.error("Error guardando moto:", e);
    return false;
  }
}

// ─── Crear recordatorio de vencimiento ────────────────────────────
export async function crearRenovacion(
  riderId: string,
  motoId: string | null,
  tipo: string, // soat, tecnica, impuesto, licencia, mantenimiento
  fechaVencimiento: Date,
  costoEstimado?: number,
) {
  try {
    const { error } = await supabase.from("rider_renewals").insert({
      rider_id: riderId,
      moto_id: motoId,
      tipo_renovacion: tipo,
      fecha_proximo_vencimiento: fechaVencimiento.toISOString().split("T")[0],
      costo_estimado: costoEstimado || null,
      proxima_alerta: new Date(fechaVencimiento.getTime() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
    });

    if (error) throw error;
    return true;
  } catch (e) {
    console.error("Error creando renovación:", e);
    return false;
  }
}

// ─── Marcar vencimiento como completado ───────────────────────────
export async function marcarRenovacionCompletada(renovacionId: string) {
  try {
    const { error } = await supabase
      .from("rider_renewals")
      .update({
        fue_completada: true,
        fecha_completada: new Date().toISOString().split("T")[0],
      })
      .eq("id", renovacionId);

    if (error) throw error;
    return true;
  } catch (e) {
    console.error("Error marcando renovación completada:", e);
    return false;
  }
}

// ─── Actualizar perfil ────────────────────────────────────────────
export async function actualizarPerfil(
  riderId: string,
  datos: Partial<{
    experiencia_nivel: string;
    contacto_emergencia: string;
    telefono_emergencia: string;
    ubicacion_home: string;
    ubicacion_actual: string;
    club_motociclista: string;
    sobre_ti: string;
    preferencias_rutas: string;
  }>,
) {
  try {
    const { error } = await supabase.from("riders").update(datos).eq("id", riderId);

    if (error) throw error;
    return true;
  } catch (e) {
    console.error("Error actualizando perfil:", e);
    return false;
  }
}

// ─── Obtener contexto para el prompt de Rita ──────────────────────
export async function generarContextoRider(phone: string): Promise<string> {
  const { perfil, motos, proximos_30_dias } = await obtenerPerfilCompleto(phone);

  if (!perfil) {
    return ""; // Rider no registrado aún
  }

  let contexto = `CONTEXTO DEL RIDER:
Nombre: ${perfil.nombre}
Experiencia: ${perfil.experiencia_nivel}
Ubicación: ${perfil.ubicacion_home || "No registrada"}
${perfil.club_motociclista ? `Club: ${perfil.club_motociclista}` : ""}

MOTOS DEL RIDER:
`;

  if (motos.length === 0) {
    contexto += "No tiene motos registradas aún.\n";
  } else {
    motos.forEach((moto, idx) => {
      const motoStr = [moto.marca, moto.modelo, moto.cc ? `${moto.cc}cc` : "", moto.anio || ""]
        .filter(Boolean)
        .join(" ");
      contexto += `${idx + 1}. ${motoStr}${moto.placa ? ` (${moto.placa})` : ""}\n`;
    });
  }

  if (proximos_30_dias.length > 0) {
    contexto += `\nVENCIMIENTOS PROXIMOS (próximos 30 días):\n`;
    proximos_30_dias.forEach((v) => {
      const fecha = new Date(v.fecha_proximo_vencimiento);
      const diasFaltantes = Math.ceil((fecha.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      contexto += `- ${v.tipo_renovacion}: ${v.fecha_proximo_vencimiento} (${diasFaltantes} días)${
        v.costo_estimado ? ` ~$${v.costo_estimado}` : ""
      }\n`;
    });
  }

  return contexto;
}

// ─── Registrar actividad del rider ────────────────────────────────
export async function registrarActividad(
  riderId: string,
  tipoActividad: string,
  contexto?: string,
) {
  try {
    await supabase.from("rider_activity").insert({
      rider_id: riderId,
      tipo_actividad: tipoActividad,
      contexto: contexto || null,
    });
  } catch (e) {
    console.error("Error registrando actividad:", e);
  }
}
