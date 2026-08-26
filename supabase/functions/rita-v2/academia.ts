// ─────────────────────────────────────────────────────────────────
// Rita Phase 3 — Academia
//
// Educación y desarrollo de skills:
//   - Contenido educativo categorizado
//   - Seguimiento de progreso
//   - Certificaciones y logros
//   - Directorio de mecánicos
// ─────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase: SupabaseClient = createClient(SB_URL, SB_KEY);

export type AcademicContent = {
  id: string;
  titulo: string;
  categoria: string;
  nivel: string;
  duracion: number;
  autor?: string;
  esOficial: boolean;
  completado?: boolean;
};

export type Certification = {
  id: string;
  titulo: string;
  fechaObtenida: string;
  emiidaPor: string;
  validaHasta?: string;
};

export type Mechanic = {
  id: string;
  nombre: string;
  especialidad: string;
  ciudad: string;
  experiencia: number;
  rating: number;
  verificado: boolean;
};

// ─── Obtener contenido educativo por categoría ──────────────────
export async function obtenerContenidoPorCategoria(
  categoria: string,
  nivel?: string,
): Promise<AcademicContent[]> {
  try {
    let query = supabase
      .from("academic_content")
      .select("*")
      .eq("categoria", categoria);

    if (nivel) {
      query = query.eq("nivel", nivel);
    }

    const { data: contenido } = await query.order("created_at", { ascending: false });

    if (!contenido) return [];

    return contenido.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      categoria: c.categoria,
      nivel: c.nivel,
      duracion: c.duracion_minutos || 0,
      autor: c.autor,
      esOficial: c.es_oficial,
    }));
  } catch (e) {
    console.error("Error obteniendo contenido:", e);
    return [];
  }
}

// ─── Obtener progreso del rider ──────────────────────────────────
export async function obtenerProgreso(phone: string): Promise<{
  contentosCompletados: number;
  totalHorasAprendizaje: number;
  categoriasFuertes: string[];
}> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return { contentosCompletados: 0, totalHorasAprendizaje: 0, categoriasFuertes: [] };

    const { data: progreso } = await supabase
      .from("rider_learning_progress")
      .select("*, academic_content(categoria)")
      .eq("rider_id", rider.id)
      .eq("completado", true);

    if (!progreso) return { contentosCompletados: 0, totalHorasAprendizaje: 0, categoriasFuertes: [] };

    const totalMinutos = progreso.reduce((sum, p) => sum + (p.tiempo_dedicado_minutos || 0), 0);
    const categorias = progreso
      .map((p) => (p.academic_content as { categoria: string }).categoria)
      .filter((v, i, a) => a.indexOf(v) === i);

    return {
      contentosCompletados: progreso.length,
      totalHorasAprendizaje: Math.round(totalMinutos / 60),
      categoriasFuertes: categorias,
    };
  } catch (e) {
    console.error("Error obteniendo progreso:", e);
    return { contentosCompletados: 0, totalHorasAprendizaje: 0, categoriasFuertes: [] };
  }
}

// ─── Marcar contenido como completado ────────────────────────────
export async function marcarContenidoCompletado(
  phone: string,
  contentId: string,
  tiempoDedicadoMinutos?: number,
  calificacion?: number,
): Promise<boolean> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return false;

    const { error } = await supabase.from("rider_learning_progress").upsert({
      rider_id: rider.id,
      content_id: contentId,
      completado: true,
      fecha_completado: new Date().toISOString().split("T")[0],
      tiempo_dedicado_minutos: tiempoDedicadoMinutos,
      calificacion,
    });

    if (error) throw error;
    return true;
  } catch (e) {
    console.error("Error marcando contenido completado:", e);
    return false;
  }
}

// ─── Obtener certificaciones del rider ───────────────────────────
export async function obtenerCertificaciones(phone: string): Promise<Certification[]> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return [];

    const { data: certs } = await supabase
      .from("rider_certifications")
      .select("*")
      .eq("rider_id", rider.id)
      .order("fecha_obtenida", { ascending: false });

    if (!certs) return [];

    return certs.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      fechaObtenida: c.fecha_obtenida,
      emiidaPor: c.emitida_por || "",
      validaHasta: c.valida_hasta,
    }));
  } catch (e) {
    console.error("Error obteniendo certificaciones:", e);
    return [];
  }
}

// ─── Crear certificación ─────────────────────────────────────────
export async function crearCertificacion(
  phone: string,
  titulo: string,
  emitidaPor: string,
  fechaObtenida: Date,
  validaHasta?: Date,
  descripcion?: string,
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
      .from("rider_certifications")
      .insert({
        rider_id: rider.id,
        titulo,
        emitida_por: emitidaPor,
        fecha_obtenida: fechaObtenida.toISOString().split("T")[0],
        valida_hasta: validaHasta ? validaHasta.toISOString().split("T")[0] : null,
        descripcion,
      })
      .select("id");

    if (error) throw error;
    return data?.[0]?.id || null;
  } catch (e) {
    console.error("Error creando certificación:", e);
    return null;
  }
}

// ─── Buscar mecánicos por ciudad ─────────────────────────────────
export async function buscarMecanicos(
  ciudad: string,
  especialidad?: string,
  soloVerificados: boolean = false,
): Promise<Mechanic[]> {
  try {
    let query = supabase.from("mechanic_directory").select("*").eq("ciudad", ciudad);

    if (especialidad) {
      query = query.eq("especialidad", especialidad);
    }

    if (soloVerificados) {
      query = query.eq("es_verificado", true);
    }

    const { data: mecanicos } = await query.order("rating", { ascending: false }).limit(10);

    if (!mecanicos) return [];

    return mecanicos.map((m) => ({
      id: m.id,
      nombre: m.nombre_mecanico,
      especialidad: m.especialidad || "",
      ciudad: m.ciudad,
      experiencia: m.experiencia_años || 0,
      rating: m.rating || 0,
      verificado: m.es_verificado,
    }));
  } catch (e) {
    console.error("Error buscando mecánicos:", e);
    return [];
  }
}

// ─── Generar contexto académico para el prompt ──────────────────
export async function generarContextoAcademia(phone: string): Promise<string> {
  try {
    const progreso = await obtenerProgreso(phone);
    const certificaciones = await obtenerCertificaciones(phone);

    if (progreso.contentosCompletados === 0 && certificaciones.length === 0) return "";

    let contexto = "ACADEMIA DEL RIDER:\n";

    if (progreso.contentosCompletados > 0) {
      contexto += `✓ ${progreso.contentosCompletados} contenidos completados (${progreso.totalHorasAprendizaje}h de aprendizaje)\n`;
      if (progreso.categoriasFuertes.length > 0) {
        contexto += `Especialidades: ${progreso.categoriasFuertes.join(", ")}\n`;
      }
    }

    if (certificaciones.length > 0) {
      contexto += `Certificaciones: ${certificaciones.map((c) => c.titulo).join(", ")}\n`;
    }

    return contexto;
  } catch (e) {
    console.error("Error generando contexto academia:", e);
    return "";
  }
}
