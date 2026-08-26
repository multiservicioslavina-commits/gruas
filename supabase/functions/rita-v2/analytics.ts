// ─────────────────────────────────────────────────────────────────
// Rita Phase 5 — Analytics Motero
//
// Análisis de datos de conducción y rutas:
//   - Estadísticas personales de viajes
//   - Análisis de patrones de conducción
//   - Comparativas con la comunidad
//   - Reportes de progreso y mejora
// ─────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase: SupabaseClient = createClient(SB_URL, SB_KEY);

export type PersonalStats = {
  totalSesiones: number;
  totalDistancia: number;
  totalDuracion: number;
  velocidadPromedio: number;
  velocidadMaxima: number;
  consumoPromedio: number;
  seguridad: number;
};

export type RouteAnalytics = {
  id: string;
  nombre: string;
  vecesRecorrida: number;
  distancia: number;
  duracionPromedio: number;
  velocidadPromedio: number;
  seguridad: number;
  dificultad: number;
};

export type RidingPattern = {
  tipo: string;
  horaPromedio: string;
  duracionPromedio: number;
  velocidadTipica: number;
  viaPreferida: string;
  frecuencia: number;
  seguridad: number;
};

export type CommunityBenchmark = {
  metrica: string;
  tuValor: number;
  promedioComunidad: number;
  percentil25: number;
  percentil50: number;
  percentil75: number;
  percentil90: number;
  posicion: string;
};

// ─── Obtener estadísticas personales ────────────────────────────
export async function obtenerEstadisticasPersonales(phone: string): Promise<PersonalStats | null> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return null;

    const { data: stats } = await supabase
      .from("rider_daily_stats")
      .select("total_sesiones, total_distancia_km, total_duracion_minutos, velocidad_promedio, velocidad_maxima, consumo_total_litros, seguridad_score_promedio")
      .eq("rider_id", rider.id)
      .order("fecha", { ascending: false })
      .limit(30);

    if (!stats || stats.length === 0) return null;

    const totalSesiones = stats.reduce((sum, s) => sum + s.total_sesiones, 0);
    const totalDistancia = stats.reduce((sum, s) => sum + (s.total_distancia_km || 0), 0);
    const totalDuracion = stats.reduce((sum, s) => sum + (s.total_duracion_minutos || 0), 0);
    const velocidadPromedio = stats.reduce((sum, s) => sum + (s.velocidad_promedio || 0), 0) / stats.length;
    const velocidadMaxima = Math.max(...stats.map((s) => s.velocidad_maxima || 0));
    const consumoPromedio = stats.reduce((sum, s) => sum + (s.consumo_total_litros || 0), 0) / stats.length;
    const seguridad = stats.reduce((sum, s) => sum + (s.seguridad_score_promedio || 0), 0) / stats.length;

    return {
      totalSesiones,
      totalDistancia: Math.round(totalDistancia * 10) / 10,
      totalDuracion,
      velocidadPromedio: Math.round(velocidadPromedio * 10) / 10,
      velocidadMaxima,
      consumoPromedio: Math.round(consumoPromedio * 100) / 100,
      seguridad: Math.round(seguridad),
    };
  } catch (e) {
    console.error("Error obteniendo estadísticas personales:", e);
    return null;
  }
}

// ─── Obtener rutas favoritas con estadísticas ───────────────────
export async function obtenerRutasFavoritasEstadisticas(
  phone: string,
  limite: number = 5,
): Promise<RouteAnalytics[]> {
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
      .select(
        `id, nombre, route_analytics(
        veces_recorrida, distancia_total_km, duracion_promedio_minutos,
        velocidad_promedio_km_h, seguridad_score_promedio, rating_dificultad_promedio
      )`,
      )
      .eq("rider_id", rider.id)
      .limit(limite);

    if (!rutas) return [];

    return rutas
      .filter((r) => r.route_analytics && r.route_analytics.length > 0)
      .map((r) => {
        const analytics = r.route_analytics[0];
        return {
          id: r.id,
          nombre: r.nombre,
          vecesRecorrida: analytics.veces_recorrida || 0,
          distancia: Math.round((analytics.distancia_total_km || 0) * 10) / 10,
          duracionPromedio: Math.round(analytics.duracion_promedio_minutos || 0),
          velocidadPromedio: Math.round((analytics.velocidad_promedio_km_h || 0) * 10) / 10,
          seguridad: Math.round(analytics.seguridad_score_promedio || 0),
          dificultad: analytics.rating_dificultad_promedio || 0,
        };
      });
  } catch (e) {
    console.error("Error obteniendo rutas favoritas:", e);
    return [];
  }
}

// ─── Obtener patrones de conducción ─────────────────────────────
export async function obtenerPatronesConduction(phone: string): Promise<RidingPattern[]> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return [];

    const { data: patrones } = await supabase
      .from("riding_patterns")
      .select("*")
      .eq("rider_id", rider.id)
      .order("frecuencia_semanal", { ascending: false });

    if (!patrones) return [];

    return patrones.map((p) => ({
      tipo: p.patron_tipo,
      horaPromedio: p.hora_promedio_inicio,
      duracionPromedio: p.duracion_promedio_minutos || 0,
      velocidadTipica: Math.round((p.velocidad_tipica || 0) * 10) / 10,
      viaPreferida: p.via_preferida,
      frecuencia: Math.round((p.frecuencia_semanal || 0) * 10) / 10,
      seguridad: p.seguridad_score || 0,
    }));
  } catch (e) {
    console.error("Error obteniendo patrones de conducción:", e);
    return [];
  }
}

// ─── Generar reporte de progreso ────────────────────────────────
export async function generarReporteProgreso(phone: string): Promise<string> {
  try {
    const stats = await obtenerEstadisticasPersonales(phone);
    const rutas = await obtenerRutasFavoritasEstadisticas(phone, 3);
    const patrones = await obtenerPatronesConduction(phone);

    if (!stats) return "";

    let reporte = "📊 REPORTE DE PROGRESO:\n";
    reporte += `• Sesiones: ${stats.totalSesiones} viajes\n`;
    reporte += `• Distancia: ${stats.totalDistancia}km\n`;
    reporte += `• Velocidad promedio: ${stats.velocidadPromedio}km/h\n`;
    reporte += `• Seguridad: ${stats.seguridad}/100\n`;

    if (rutas.length > 0) {
      reporte += `\n🛣️ Rutas favoritas: ${rutas.length}\n`;
      rutas.slice(0, 2).forEach((r) => {
        reporte += `  • ${r.nombre}: ${r.vecesRecorrida}x (${r.distancia}km)\n`;
      });
    }

    if (patrones.length > 0) {
      reporte += `\n🌙 Patrón principal: ${patrones[0].tipo}\n`;
    }

    return reporte;
  } catch (e) {
    console.error("Error generando reporte de progreso:", e);
    return "";
  }
}

// ─── Comparar con benchmarks de comunidad ───────────────────────
export async function compararConComunidad(phone: string): Promise<CommunityBenchmark[]> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return [];

    const stats = await obtenerEstadisticasPersonales(phone);
    if (!stats) return [];

    const { data: benchmarks } = await supabase
      .from("community_benchmarks")
      .select("*")
      .in("metrica", ["velocidad_promedio", "seguridad", "distancia_mensual"])
      .limit(3);

    if (!benchmarks) return [];

    return benchmarks.map((b) => {
      let tuValor = 0;
      if (b.metrica === "velocidad_promedio") tuValor = stats.velocidadPromedio;
      else if (b.metrica === "seguridad") tuValor = stats.seguridad;
      else if (b.metrica === "distancia_mensual") tuValor = stats.totalDistancia;

      const posicion =
        tuValor > b.valor_percentil_90
          ? "Top 10%"
          : tuValor > b.valor_percentil_75
            ? "Top 25%"
            : tuValor > b.valor_percentil_50
              ? "Arriba del promedio"
              : "Bajo el promedio";

      return {
        metrica: b.metrica,
        tuValor: Math.round(tuValor * 100) / 100,
        promedioComunidad: Math.round((b.valor_promedio || 0) * 100) / 100,
        percentil25: Math.round((b.valor_percentil_25 || 0) * 100) / 100,
        percentil50: Math.round((b.valor_percentil_50 || 0) * 100) / 100,
        percentil75: Math.round((b.valor_percentil_75 || 0) * 100) / 100,
        percentil90: Math.round((b.valor_percentil_90 || 0) * 100) / 100,
        posicion,
      };
    });
  } catch (e) {
    console.error("Error comparando con comunidad:", e);
    return [];
  }
}

// ─── Generar contexto de analytics para el prompt ────────────────
export async function generarContextoAnalytics(phone: string): Promise<string> {
  try {
    const stats = await obtenerEstadisticasPersonales(phone);
    const rutas = await obtenerRutasFavoritasEstadisticas(phone, 2);

    if (!stats) return "";

    let contexto = "ANALYTICS DEL RIDER:\n";
    contexto += `📈 ${stats.totalSesiones} viajes | ${stats.totalDistancia}km total | Seguridad: ${stats.seguridad}/100\n`;

    if (rutas.length > 0) {
      contexto += `🛣️ Ruta favorita: ${rutas[0].nombre} (${rutas[0].vecesRecorrida} veces)\n`;
    }

    return contexto;
  } catch (e) {
    console.error("Error generando contexto analytics:", e);
    return "";
  }
}
