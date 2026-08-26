// ─────────────────────────────────────────────────────────────────
// Rita Phase 2 — Social & Community
//
// Conecta riders:
//   - Buscar compañero para rodadas
//   - Confirmar asistencia a rodadas
//   - Crear grupos y rodadas
//   - Recomendaciones verificadas de talleres
// ─────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase: SupabaseClient = createClient(SB_URL, SB_KEY);

export type RiderGroup = {
  id: string;
  nombre: string;
  tipo: "club" | "rodada_puntual" | "grupo_whatsapp";
  descripcion: string | null;
  ubicacion: string | null;
  cantidad_miembros: number;
};

export type GroupRide = {
  id: string;
  nombre: string;
  descripcion: string | null;
  fecha: string;
  hora_salida: string | null;
  punto_salida: string;
  destino: string;
  km_aproximados: number | null;
  dificultad: "fácil" | "media" | "difícil";
  grupo_nombre: string;
};

// ─── Obtener grupos del rider ────────────────────────────────────
export async function obtenerGruposRider(
  phone: string,
): Promise<RiderGroup[]> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return [];

    const { data: miemberships } = await supabase
      .from("rider_group_members")
      .select("group_id")
      .eq("rider_id", rider.id);

    if (!miemberships || miemberships.length === 0) return [];

    const groupIds = miemberships.map((m) => m.group_id);

    const { data: grupos } = await supabase
      .from("rider_groups")
      .select(
        `
        id,
        nombre,
        tipo,
        descripcion,
        ubicacion,
        rider_group_members(id)
      `
      )
      .in("id", groupIds);

    if (!grupos) return [];

    return grupos.map((g) => ({
      id: g.id,
      nombre: g.nombre,
      tipo: g.tipo as "club" | "rodada_puntual" | "grupo_whatsapp",
      descripcion: g.descripcion,
      ubicacion: g.ubicacion,
      cantidad_miembros: (g.rider_group_members as unknown[]).length,
    }));
  } catch (e) {
    console.error("Error obteniendo grupos:", e);
    return [];
  }
}

// ─── Obtener rodadas próximas (para el rider) ────────────────────
export async function obtenerRodadasProximas(phone: string): Promise<GroupRide[]> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return [];

    // Obtener grupos del rider
    const { data: miemberships } = await supabase
      .from("rider_group_members")
      .select("group_id")
      .eq("rider_id", rider.id);

    if (!miemberships || miemberships.length === 0) return [];

    const groupIds = miemberships.map((m) => m.group_id);

    // Obtener rodadas de esos grupos
    const hoy = new Date();
    const en14Dias = new Date(hoy.getTime() + 14 * 24 * 60 * 60 * 1000);

    const { data: rodadas } = await supabase
      .from("group_rides")
      .select(
        `
        id,
        nombre,
        descripcion,
        fecha,
        hora_salida,
        punto_salida,
        destino,
        km_aproximados,
        dificultad,
        rider_groups(nombre)
      `
      )
      .in("group_id", groupIds)
      .gte("fecha", hoy.toISOString().split("T")[0])
      .lte("fecha", en14Dias.toISOString().split("T")[0])
      .order("fecha", { ascending: true });

    if (!rodadas) return [];

    return rodadas.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      descripcion: r.descripcion,
      fecha: r.fecha,
      hora_salida: r.hora_salida,
      punto_salida: r.punto_salida,
      destino: r.destino,
      km_aproximados: r.km_aproximados,
      dificultad: r.dificultad as "fácil" | "media" | "difícil",
      grupo_nombre: (r.rider_groups as { nombre: string } | null)?.nombre || "",
    }));
  } catch (e) {
    console.error("Error obteniendo rodadas próximas:", e);
    return [];
  }
}

// ─── Buscar compañero para una ruta ──────────────────────────────
export async function buscarCompaneroRuta(
  phone: string,
  destino: string,
  fecha: string,
  dificultad?: string,
): Promise<{ nombre: string; telefono: string; moto: string }[]> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id, ubicacion_home")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return [];

    // Obtener otros riders en el mismo grupo/zona con motos activas
    const { data: miemberships } = await supabase
      .from("rider_group_members")
      .select("group_id")
      .eq("rider_id", rider.id);

    if (!miemberships || miemberships.length === 0) return [];

    const groupIds = miemberships.map((m) => m.group_id);

    const { data: otrosRiders } = await supabase
      .from("rider_group_members")
      .select(
        `
        rider_id,
        riders!inner(nombre, telefono, experiencia_nivel, ubicacion_home, rider_motorcycles(marca, modelo))
      `
      )
      .in("group_id", groupIds)
      .neq("rider_id", rider.id)
      .limit(10);

    if (!otrosRiders) return [];

    return otrosRiders
      .filter((or) => {
        const r = or.riders as {
          nombre: string;
          telefono: string;
          experiencia_nivel: string;
          ubicacion_home: string | null;
          rider_motorcycles: { marca: string; modelo: string }[] | null;
        } | null;
        if (!r) return false;
        // Filtrar por dificultad si se especifica
        if (dificultad === "principiante" && r.experiencia_nivel !== "principiante")
          return false;
        if (dificultad === "avanzado" && r.experiencia_nivel === "principiante")
          return false;
        return true;
      })
      .map((or) => {
        const r = or.riders as {
          nombre: string;
          telefono: string;
          experiencia_nivel: string;
          ubicacion_home: string | null;
          rider_motorcycles: { marca: string; modelo: string }[] | null;
        } | null;
        const motos = r?.rider_motorcycles || [];
        const moto =
          motos.length > 0 ? `${motos[0].marca} ${motos[0].modelo}` : "Moto no registrada";
        return {
          nombre: r?.nombre || "",
          telefono: r?.telefono || "",
          moto,
        };
      });
  } catch (e) {
    console.error("Error buscando compañero:", e);
    return [];
  }
}

// ─── Crear/unirse a un grupo ────────────────────────────────────
export async function unirsAGrupo(
  phone: string,
  groupId: string,
): Promise<boolean> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return false;

    const { error } = await supabase.from("rider_group_members").insert({
      group_id: groupId,
      rider_id: rider.id,
      rol: "miembro",
    });

    if (error) {
      if (error.code === "23505") {
        // Ya es miembro
        return true;
      }
      throw error;
    }
    return true;
  } catch (e) {
    console.error("Error uniéndose a grupo:", e);
    return false;
  }
}

// ─── Crear rodada ────────────────────────────────────────────────
export async function crearRodada(
  groupId: string,
  nombre: string,
  descripcion: string,
  fecha: Date,
  puntoSalida: string,
  destino: string,
  kmAproximados?: number,
  horaSalida?: string,
  dificultad: "fácil" | "media" | "difícil" = "media",
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("group_rides")
      .insert({
        group_id: groupId,
        nombre,
        descripcion,
        fecha: fecha.toISOString().split("T")[0],
        hora_salida: horaSalida,
        punto_salida: puntoSalida,
        destino,
        km_aproximados: kmAproximados,
        dificultad,
      })
      .select("id");

    if (error) throw error;
    return data?.[0]?.id || null;
  } catch (e) {
    console.error("Error creando rodada:", e);
    return null;
  }
}

// ─── Generar contexto social para el prompt ─────────────────────
export async function generarContextoSocial(phone: string): Promise<string> {
  try {
    const grupos = await obtenerGruposRider(phone);
    const rodadas = await obtenerRodadasProximas(phone);

    if (grupos.length === 0 && rodadas.length === 0) return "";

    let contexto = "";

    if (grupos.length > 0) {
      contexto += "GRUPOS DEL RIDER:\n";
      grupos.forEach((g) => {
        contexto += `- ${g.nombre} (${g.cantidad_miembros} miembros) - ${g.ubicacion || ""}\n`;
      });
    }

    if (rodadas.length > 0) {
      contexto += "\nRodadas próximas:\n";
      rodadas.forEach((r) => {
        contexto += `- ${r.nombre} (${r.grupo_nombre}) - ${r.fecha} - ${r.punto_salida} → ${r.destino} (${r.km_aproximados} km, ${r.dificultad})\n`;
      });
    }

    return contexto;
  } catch (e) {
    console.error("Error generando contexto social:", e);
    return "";
  }
}
