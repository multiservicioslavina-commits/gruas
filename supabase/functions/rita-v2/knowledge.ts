// ─────────────────────────────────────────────────────────────────
// Rita Knowledge Base — Almacenamiento y reutilización inteligente
//
// Sistema de aprendizaje para Rita:
//   1. Detecta tipo de pregunta (técnica vs general)
//   2. Busca respuestas similares en la BD antes de preguntar a IA
//   3. Almacena cada pregunta + respuesta para futuras búsquedas
//   4. Usa Sonnet para preguntas técnicas, Haiku para general
//
// Evita preguntas repetidas y crece cada día con mejor contexto.
// ─────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { createHash } from "https://deno.land/std@0.208.0/crypto/mod.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase: SupabaseClient = createClient(SB_URL, SB_KEY);

// ─── Palabras clave que marcan preguntas técnicas ─────────────
const PALABRAS_TECNICAS =
  /rpm|gasolina|aceite|batería|bujías|cadena|corona|piñón|embrague|clutch|frenos|pastillas|disco|llanta|goma|presión|compresión|cilindrada|cc|horsepower|hp|torque|consumo|mantenimiento|servicio|filtro|bujía|correa|correa de distribucion|válvula|cilindro|pistón|culata|árbol de levas|cambios|velocidad|engranaje|diferencial|transmisión|amortiguador|suspensión|chasis|bastidor|soldadura|pintura|cromado|herrumbre|óxido|corrosión|combustible|inyector|carburador|turbo|supercharger|intercooler|catalizador|tubo de escape|silenciador|escape libre|flow|rendimiento|potencia|par motor|revoluciones|ralentí|throttle|acelerador|marcha en blanco|ralenti/i;

const PALABRAS_LEGALES =
  /comparendo|multa|infracción|código de tránsito|ley de tránsito|responsabilidad civil|seguro|soat|póliza|aseguradora|demanda|juzgado|tribunal|abogado|derecho|legal|reglamento|ordenanza|norma|prohibido|permitido|señal de tránsito|línea amarilla|límite de velocidad|antecedentes|expediente/i;

const PALABRAS_EMERGENCIA =
  /accidente|choque|colisión|impacto|caída|herida|sangrado|fractura|quemadura|intoxicación|paro cardíaco|inconsciencia|convulsión|emergencia|ambulancia|hospital|urgencia|crítico|grave|peligro/i;

// ─── Tipos de pregunta ────────────────────────────────────────
type TipoPregunta = "tecnica" | "legal" | "emergencia" | "general";

export function clasificarPregunta(texto: string): TipoPregunta {
  if (PALABRAS_EMERGENCIA.test(texto)) return "emergencia";
  if (PALABRAS_LEGALES.test(texto)) return "legal";
  if (PALABRAS_TECNICAS.test(texto)) return "tecnica";
  return "general";
}

// ─── Fingerprint de pregunta para deduplicación ────────────────
function generarFingerprint(pregunta: string): string {
  const normalizado = pregunta.toLowerCase().trim();
  const hash = createHash("sha256");
  hash.update(normalizado);
  return hash.toString("hex").slice(0, 16);
}

// ─── Búsqueda simple de similitud en BD ────────────────────────
export async function buscarRespuestaAnterior(
  pregunta: string,
  tipo: TipoPregunta,
): Promise<{ respuesta: string; fingerprint: string } | null> {
  try {
    const fingerprint = generarFingerprint(pregunta);

    // Búsqueda exacta por fingerprint
    const { data: exacta } = await supabase
      .from("rita_respuestas_almacenadas")
      .select("respuesta, fingerprint, usado_count")
      .eq("fingerprint", fingerprint)
      .single();

    if (exacta) {
      await supabase
        .from("rita_respuestas_almacenadas")
        .update({ usado_count: (exacta.usado_count || 1) + 1, last_used_at: new Date().toISOString() })
        .eq("fingerprint", fingerprint);
      return { respuesta: exacta.respuesta, fingerprint: exacta.fingerprint };
    }

    // Búsqueda aproximada por palabras clave del mismo tipo
    const palabras = pregunta.toLowerCase().split(/\s+/).filter(p => p.length > 4);
    if (palabras.length === 0) return null;

    const { data: similares } = await supabase
      .from("rita_respuestas_almacenadas")
      .select("respuesta, fingerprint, pregunta_original, usado_count")
      .eq("tipo_pregunta", tipo)
      .order("usado_count", { ascending: false })
      .limit(5);

    if (similares && similares.length > 0) {
      for (const candidato of similares) {
        const coincidencias = palabras.filter(p =>
          candidato.pregunta_original.toLowerCase().includes(p)
        ).length;

        // Si hay al menos 2 palabras clave coincidentes, usar la respuesta anterior
        if (coincidencias >= 2) {
          await supabase
            .from("rita_respuestas_almacenadas")
            .update({ usado_count: (candidato.usado_count || 1) + 1, last_used_at: new Date().toISOString() })
            .eq("fingerprint", candidato.fingerprint);
          return { respuesta: candidato.respuesta, fingerprint: candidato.fingerprint };
        }
      }
    }

    return null;
  } catch (e) {
    console.error("Error buscando respuesta anterior:", e);
    return null;
  }
}

// ─── Guardar nueva respuesta en BD ─────────────────────────────
export async function guardarRespuesta(
  telefono: string,
  pregunta: string,
  respuesta: string,
  tipo: TipoPregunta,
  modelo: string,
  proveedor: string,
  tokensEntrada: number,
  tokensSalida: number,
  costoUsd: number,
) {
  try {
    const fingerprint = generarFingerprint(pregunta);

    // Verificar si ya existe este fingerprint
    const { data: existe } = await supabase
      .from("rita_respuestas_almacenadas")
      .select("id")
      .eq("fingerprint", fingerprint)
      .single();

    if (existe) {
      // Ya existe, solo incrementar contador
      await supabase
        .from("rita_respuestas_almacenadas")
        .update({ usado_count: (existe.usado_count || 1) + 1, last_used_at: new Date().toISOString() })
        .eq("fingerprint", fingerprint);
      return;
    }

    // Insertar nueva respuesta
    await supabase.from("rita_respuestas_almacenadas").insert({
      telefono,
      pregunta_original: pregunta,
      respuesta,
      tipo_pregunta: tipo,
      modelo_usado: modelo,
      proveedor,
      tokens_entrada: tokensEntrada,
      tokens_salida: tokensSalida,
      costo_usd: costoUsd,
      fingerprint,
      usado_count: 1,
    });
  } catch (e) {
    console.error("Error guardando respuesta:", e);
  }
}

// ─── Seleccionar modelo según tipo de pregunta ─────────────────
export function seleccionarModelo(tipo: TipoPregunta): { claude: string; openai: string } {
  // Para preguntas técnicas, legales y emergencias: usar modelos más potentes
  if (tipo === "tecnica" || tipo === "legal" || tipo === "emergencia") {
    return {
      claude: "claude-sonnet-5-20250514", // Más potente para técnico
      openai: "gpt-4o", // Más potente para técnico
    };
  }

  // Para general: usar los rápidos y baratos
  return {
    claude: "claude-haiku-4-5-20251001",
    openai: "gpt-4o-mini",
  };
}

// ─── Stats de la knowledge base ────────────────────────────────
export async function statsKnowledgeBase(): Promise<{
  total: number;
  por_tipo: Record<string, number>;
  respuestas_reutilizadas: number;
  tokens_guardados: number;
  costo_ahorrado_usd: number;
}> {
  try {
    const { data: stats } = await supabase
      .from("rita_respuestas_almacenadas")
      .select("tipo_pregunta, usado_count, tokens_entrada, costo_usd");

    if (!stats || stats.length === 0) {
      return { total: 0, por_tipo: {}, respuestas_reutilizadas: 0, tokens_guardados: 0, costo_ahorrado_usd: 0 };
    }

    const por_tipo: Record<string, number> = {};
    let respuestas_reutilizadas = 0;
    let tokens_guardados = 0;
    let costo_ahorrado_usd = 0;

    for (const r of stats) {
      por_tipo[r.tipo_pregunta] = (por_tipo[r.tipo_pregunta] || 0) + 1;

      if (r.usado_count > 1) {
        respuestas_reutilizadas += r.usado_count - 1;
        tokens_guardados += (r.tokens_entrada || 0) * (r.usado_count - 1);
        costo_ahorrado_usd += (r.costo_usd || 0) * (r.usado_count - 1);
      }
    }

    return {
      total: stats.length,
      por_tipo,
      respuestas_reutilizadas,
      tokens_guardados,
      costo_ahorrado_usd: Math.round(costo_ahorrado_usd * 10000) / 10000,
    };
  } catch (e) {
    console.error("Error calculando stats:", e);
    return { total: 0, por_tipo: {}, respuestas_reutilizadas: 0, tokens_guardados: 0, costo_ahorrado_usd: 0 };
  }
}
