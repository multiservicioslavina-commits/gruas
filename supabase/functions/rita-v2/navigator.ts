// ─────────────────────────────────────────────────────────────────
// Rita Phase 3 — Navigator Motero
//
// Navegación inteligente para motos:
//   - Rutas guardadas y favoritas
//   - Descubrimiento de talleres y POIs
//   - Rutas seguras basadas en clima y vías cerradas
// ─────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase: SupabaseClient = createClient(SB_URL, SB_KEY);

export type Route = {
  id: string;
  nombre: string;
  km: number;
  dificultad: "fácil" | "media" | "difícil";
  tipo: string;
  esFavorita: boolean;
  vecesRecorrida: number;
};

export type PointOfInterest = {
  id: string;
  nombre: string;
  tipo: string;
  ciudad: string;
  distancia?: number;
  rating: number;
  especialidades?: string[];
  telefono?: string;
};

// ─── Obtener rutas guardadas del rider ───────────────────────────
export async function obtenerRutasGuardadas(phone: string): Promise<Route[]> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return [];

    const { data: rutas } = await supabase
      .from("rider_routes")
      .select("*")
      .eq("rider_id", rider.id)
      .order("es_favorita", { ascending: false })
      .order("updated_at", { ascending: false });

    if (!rutas) return [];

    return rutas.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      km: r.km_aproximados || 0,
      dificultad: r.dificultad as "fácil" | "media" | "difícil",
      tipo: r.tipo_ruta,
      esFavorita: r.es_favorita,
      vecesRecorrida: r.veces_recorrida,
    }));
  } catch (e) {
    console.error("Error obteniendo rutas:", e);
    return [];
  }
}

// ─── Guardar ruta nueva ──────────────────────────────────────────
export async function guardarRuta(
  phone: string,
  nombre: string,
  origenLat: number,
  origenLng: number,
  destinoLat: number,
  destinoLng: number,
  kmAproximados?: number,
  dificultad: "fácil" | "media" | "difícil" = "media",
  tipoRuta: string = "carretera",
): Promise<string | null> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return null;

    const { data, error } = await supabase
      .from("rider_routes")
      .insert({
        rider_id: rider.id,
        nombre,
        origen_lat: origenLat,
        origen_lng: origenLng,
        destino_lat: destinoLat,
        destino_lng: destinoLng,
        km_aproximados: kmAproximados,
        dificultad,
        tipo_ruta: tipoRuta,
      })
      .select("id");

    if (error) throw error;
    return data?.[0]?.id || null;
  } catch (e) {
    console.error("Error guardando ruta:", e);
    return null;
  }
}

// ─── Marcar ruta como favorita ───────────────────────────────────
export async function marcarRutaFavorita(rutaId: string, esFavorita: boolean): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("rider_routes")
      .update({ es_favorita: esFavorita })
      .eq("id", rutaId);

    if (error) throw error;
    return true;
  } catch (e) {
    console.error("Error marcando ruta favorita:", e);
    return false;
  }
}

// ─── Buscar POIs (talleres, gasolineras, etc) ────────────────────
export async function buscarPOIs(
  ciudad: string,
  tipo?: string,
  maxResultados: number = 10,
): Promise<PointOfInterest[]> {
  try {
    let query = supabase.from("points_of_interest").select("*").eq("ciudad", ciudad);

    if (tipo) {
      query = query.eq("tipo", tipo);
    }

    const { data: pois } = await query.limit(maxResultados);

    if (!pois) return [];

    return pois.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      tipo: p.tipo,
      ciudad: p.ciudad,
      rating: p.rating || 0,
      especialidades: p.especialidades || [],
      telefono: p.telefono,
    }));
  } catch (e) {
    console.error("Error buscando POIs:", e);
    return [];
  }
}

// ─── Obtener talleres recomendados ───────────────────────────────
export async function obtenerTalleresRecomendados(
  ciudad: string,
  maxResultados: number = 5,
): Promise<PointOfInterest[]> {
  try {
    const { data: pois } = await supabase
      .from("points_of_interest")
      .select("*")
      .eq("tipo", "taller")
      .eq("ciudad", ciudad)
      .order("rating", { ascending: false })
      .limit(maxResultados);

    if (!pois) return [];

    return pois.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      tipo: p.tipo,
      ciudad: p.ciudad,
      rating: p.rating || 0,
      especialidades: p.especialidades || [],
      telefono: p.telefono,
    }));
  } catch (e) {
    console.error("Error obteniendo talleres:", e);
    return [];
  }
}

// ─── Crear POI (taller, gasolinera, etc) ────────────────────────
export async function crearPOI(
  nombre: string,
  tipo: string,
  latitud: number,
  longitud: number,
  ciudad: string,
  descripcion?: string,
  telefono?: string,
  url?: string,
  especialidades?: string[],
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("points_of_interest")
      .insert({
        nombre,
        tipo,
        latitud,
        longitud,
        ciudad,
        descripcion,
        telefono,
        url,
        especialidades,
      })
      .select("id");

    if (error) throw error;
    return data?.[0]?.id || null;
  } catch (e) {
    console.error("Error creando POI:", e);
    return null;
  }
}

// ─── Generar contexto de navegación para el prompt ────────────────
export async function generarContextoNavigador(phone: string): Promise<string> {
  try {
    const rutas = await obtenerRutasGuardadas(phone);
    const rutasFavoritas = rutas.filter((r) => r.esFavorita);

    if (rutas.length === 0) return "";

    let contexto = "NAVEGADOR DEL RIDER:\n";

    if (rutasFavoritas.length > 0) {
      contexto += `Rutas favoritas: ${rutasFavoritas.map((r) => r.nombre).join(", ")}\n`;
    }

    contexto += `Total de rutas guardadas: ${rutas.length}\n`;
    contexto += `Ruta más recorrida: ${rutas.reduce((max, r) => (r.vecesRecorrida > max.vecesRecorrida ? r : max)).nombre}\n`;

    return contexto;
  } catch (e) {
    console.error("Error generando contexto navegador:", e);
    return "";
  }
}
