// ─────────────────────────────────────────────────────────────────
// Rita Phase 2 — Alertas Proactivas
//
// Genera alertas automáticas de:
//   - Mantenimiento por km
//   - Clima en zona
//   - Vía cerrada/riesgo
//   - Rodadas de club
// ─────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase: SupabaseClient = createClient(SB_URL, SB_KEY);

export type AlertaProactiva = {
  id: string;
  tipo: "mantenimiento" | "clima" | "via_cerrada" | "rodada" | "promocion";
  titulo: string;
  mensaje: string;
  urgencia: "baja" | "media" | "alta";
  datos_contexto?: Record<string, unknown>;
};

// ─── Obtener alertas para un rider ──────────────────────────────
export async function obtenerAlertasRider(
  phone: string,
): Promise<AlertaProactiva[]> {
  const alertas: AlertaProactiva[] = [];

  try {
    const tel = phone.replace(/^57/, "");

    // Obtener rider
    const { data: rider } = await supabase
      .from("riders")
      .select("id, ubicacion_home")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return alertas;

    // Alertas de km/mantenimiento
    const { data: motos } = await supabase
      .from("rider_motorcycles")
      .select("id, marca, modelo")
      .eq("rider_id", rider.id)
      .eq("esta_activa", true);

    if (motos && motos.length > 0) {
      for (const moto of motos) {
        const { data: odometer } = await supabase
          .from("rider_odometer")
          .select("km_actual, intervalo_mantenimiento, km_ultima_alerta")
          .eq("moto_id", moto.id)
          .maybeSingle();

        if (odometer) {
          const kmDesdeAlerta = odometer.km_actual - odometer.km_ultima_alerta;
          if (kmDesdeAlerta >= odometer.intervalo_mantenimiento * 0.8) {
            alertas.push({
              id: `mantenimiento-${moto.id}`,
              tipo: "mantenimiento",
              titulo: "Mantenimiento próximo",
              mensaje: `Ya llevas ${kmDesdeAlerta.toLocaleString()} km desde tu último mantenimiento. Los talleres cercanos para tu ${moto.marca} ${moto.modelo} son...`,
              urgencia: kmDesdeAlerta >= odometer.intervalo_mantenimiento ? "alta" : "media",
              datos_contexto: {
                moto_id: moto.id,
                km_actual: odometer.km_actual,
                km_faltantes: odometer.intervalo_mantenimiento - kmDesdeAlerta,
              },
            });
          }
        }
      }
    }

    // Alertas de clima
    if (rider.ubicacion_home) {
      const { data: weather } = await supabase
        .from("weather_events")
        .select("*")
        .eq("zona", rider.ubicacion_home)
        .gte("fecha_evento", new Date().toISOString().split("T")[0])
        .lte("fecha_evento", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0]);

      if (weather && weather.length > 0) {
        for (const evento of weather) {
          alertas.push({
            id: `clima-${evento.id}`,
            tipo: "clima",
            titulo: evento.tipo_evento.toUpperCase(),
            mensaje: evento.descripcion || `Se espera ${evento.tipo_evento} en ${rider.ubicacion_home}. Recomendación: ${evento.severidad === "alta" ? "NO SALGAS" : "rodá con precaución"}`,
            urgencia:
              evento.severidad === "alta"
                ? "alta"
                : evento.severidad === "media"
                ? "media"
                : "baja",
            datos_contexto: {
              zona: evento.zona,
              fecha: evento.fecha_evento,
              severidad: evento.severidad,
            },
          });
        }
      }
    }

    // Alertas de vía cerrada
    const { data: incidents } = await supabase
      .from("road_incidents")
      .select("*")
      .lte("fecha_inicio", new Date().toISOString())
      .or(`fecha_fin_estimada.is.null,fecha_fin_estimada.gt.${new Date().toISOString()}`);

    if (incidents && incidents.length > 0) {
      for (const incident of incidents) {
        alertas.push({
          id: `via-${incident.id}`,
          tipo: "via_cerrada",
          titulo: "⚠️ Vía cerrada/riesgo",
          mensaje: `${incident.nombre_vía}: ${incident.descripcion}${incident.ruta_alternativa ? ` → Ruta alternativa: ${incident.ruta_alternativa}` : ""}`,
          urgencia:
            incident.severidad === "alta"
              ? "alta"
              : incident.severidad === "media"
              ? "media"
              : "baja",
          datos_contexto: {
            via: incident.nombre_vía,
            tipo: incident.tipo_incidente,
            alternativa: incident.ruta_alternativa,
          },
        });
      }
    }

    // Alertas de rodadas (si el rider está en algún grupo)
    const { data: grupos } = await supabase
      .from("rider_group_members")
      .select("group_id")
      .eq("rider_id", rider.id);

    if (grupos && grupos.length > 0) {
      const groupIds = grupos.map((g) => g.group_id);
      const { data: rodadas } = await supabase
        .from("group_rides")
        .select("id, nombre, fecha, punto_salida, grupo:rider_groups(nombre)")
        .in("group_id", groupIds)
        .gte("fecha", new Date().toISOString().split("T")[0])
        .lte("fecha", new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0]);

      if (rodadas && rodadas.length > 0) {
        for (const rodada of rodadas) {
          const grupo = rodada.grupo as { nombre: string } | null;
          alertas.push({
            id: `rodada-${rodada.id}`,
            tipo: "rodada",
            titulo: "🏍️ Rodada de tu club",
            mensaje: `${grupo?.nombre || "Tu club"} tiene rodada: "${rodada.nombre}" el ${rodada.fecha} desde ${rodada.punto_salida}. ¿Confirmas asistencia?`,
            urgencia: "media",
            datos_contexto: {
              rodada_id: rodada.id,
              fecha: rodada.fecha,
              grupo: grupo?.nombre,
            },
          });
        }
      }
    }
  } catch (e) {
    console.error("Error obteniendo alertas:", e);
  }

  return alertas;
}

// ─── Actualizar km de una moto ──────────────────────────────────
export async function actualizarKm(
  motoId: string,
  kmNuevos: number,
) {
  try {
    const { data, error } = await supabase
      .from("rider_odometer")
      .update({ km_actual: kmNuevos, ultima_actualizacion: new Date().toISOString() })
      .eq("moto_id", motoId)
      .select();

    if (error) throw error;
    return data;
  } catch (e) {
    console.error("Error actualizando km:", e);
    return null;
  }
}

// ─── Crear alerta de clima ──────────────────────────────────────
export async function crearAlertaClima(
  zona: string,
  tipoEvento: string,
  descripcion: string,
  severidad: "baja" | "media" | "alta",
  fechaEvento: Date,
) {
  try {
    const { error } = await supabase.from("weather_events").insert({
      zona,
      tipo_evento: tipoEvento,
      descripcion,
      severidad,
      fecha_evento: fechaEvento.toISOString().split("T")[0],
    });

    if (error) throw error;
    return true;
  } catch (e) {
    console.error("Error creando alerta de clima:", e);
    return false;
  }
}

// ─── Crear alerta de vía cerrada ────────────────────────────────
export async function crearAlertaVia(
  nombreVia: string,
  tipoIncidente: string,
  descripcion: string,
  fechaInicio: Date,
  rutaAlternativa?: string,
  severidad: "baja" | "media" | "alta" = "media",
) {
  try {
    const { error } = await supabase.from("road_incidents").insert({
      nombre_vía: nombreVia,
      tipo_incidente: tipoIncidente,
      descripcion,
      fecha_inicio: fechaInicio.toISOString(),
      ruta_alternativa: rutaAlternativa,
      severidad,
    });

    if (error) throw error;
    return true;
  } catch (e) {
    console.error("Error creando alerta de vía:", e);
    return false;
  }
}

// ─── Resolver/cerrar incidente de vía ────────────────────────────
export async function cerrarIncidente(incidenteId: string) {
  try {
    const { error } = await supabase
      .from("road_incidents")
      .update({ fecha_fin_estimada: new Date().toISOString() })
      .eq("id", incidenteId);

    if (error) throw error;
    return true;
  } catch (e) {
    console.error("Error cerrando incidente:", e);
    return false;
  }
}

// ─── Generar contexto de alertas para el prompt ──────────────────
export async function generarContextoAlertas(phone: string): Promise<string> {
  const alertas = await obtenerAlertasRider(phone);

  if (alertas.length === 0) return "";

  let contexto = "ALERTAS ACTIVAS:\n";
  const alertasPorTipo = {
    mantenimiento: alertas.filter((a) => a.tipo === "mantenimiento"),
    clima: alertas.filter((a) => a.tipo === "clima"),
    via_cerrada: alertas.filter((a) => a.tipo === "via_cerrada"),
    rodada: alertas.filter((a) => a.tipo === "rodada"),
  };

  if (alertasPorTipo.mantenimiento.length > 0) {
    contexto += "\n⚙️ MANTENIMIENTO:\n";
    alertasPorTipo.mantenimiento.forEach((a) => {
      contexto += `- ${a.mensaje}\n`;
    });
  }

  if (alertasPorTipo.clima.length > 0) {
    contexto += "\n🌧️ CLIMA:\n";
    alertasPorTipo.clima.forEach((a) => {
      contexto += `- ${a.mensaje}\n`;
    });
  }

  if (alertasPorTipo.via_cerrada.length > 0) {
    contexto += "\n⚠️ VÍA CERRADA:\n";
    alertasPorTipo.via_cerrada.forEach((a) => {
      contexto += `- ${a.mensaje}\n`;
    });
  }

  if (alertasPorTipo.rodada.length > 0) {
    contexto += "\n🏍️ RODADAS:\n";
    alertasPorTipo.rodada.forEach((a) => {
      contexto += `- ${a.mensaje}\n`;
    });
  }

  return contexto;
}
