// ─────────────────────────────────────────────────────────────────
// Rita Phase 2 — Defensa Legal y Tramitadora
//
// Base de conocimiento legal:
//   - Qué documentos mostrar en retén
//   - Cómo actuar ante comparendo
//   - Derechos del motociclista
//   - Checklist para compra de moto usada
// ─────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase: SupabaseClient = createClient(SB_URL, SB_KEY);

export type InfoLegal = {
  id: string;
  tipo: string;
  titulo: string;
  contenido: string;
  pasos: {
    numero: number;
    descripcion: string;
    recomendacion?: string;
  }[];
  documentos_necesarios: string[];
  referencias_legales?: string;
};

// ─── Base de conocimiento legal predefinida ─────────────────────
const CONOCIMIENTO_LEGAL: Omit<InfoLegal, "id">[] = [
  {
    tipo: "retén",
    titulo: "¿Te paran en un retén? Qué debes saber",
    contenido:
      "No eres obligado a entregar documentos originales. Puedes mostrar fotocopia o foto en el celular.",
    pasos: [
      {
        numero: 1,
        descripcion: "El policía te ordena parar (es una ORDEN, no recomendación)",
        recomendacion: "Para de forma segura. No hagas giros bruscos.",
      },
      {
        numero: 2,
        descripcion: "Te pide documentos",
        recomendacion: "NUNCA entregues el original de tu licencia. Muéstrala, pero NO la dejes.",
      },
      {
        numero: 3,
        descripcion: "Documentos a mostrar",
        recomendacion:
          "1) Licencia (foto), 2) SOAT vigente, 3) Tarjeta de propiedad (foto), 4) Revisión técnica",
      },
      {
        numero: 4,
        descripcion: "Si pide más: pide la orden escrita",
        recomendacion:
          "Si no la muestra, NO le entregas nada más. Puedes negarte respetuosamente.",
      },
      {
        numero: 5,
        descripcion: "Toma fotos de la placa patrulla y del policía",
        recomendacion: "Por si hay abuso posterior.",
      },
    ],
    documentos_necesarios: [
      "Cédula",
      "Licencia de conducción vigente",
      "SOAT vigente",
      "Tarjeta de propiedad",
      "Revisión técnico-mecánica",
    ],
    referencias_legales:
      "Código de Tránsito Colombiano - Artículo 127 (Documentos obligatorios)",
  },

  {
    tipo: "comparendo",
    titulo: "Me llegó un comparendo. ¿Qué hago?",
    contenido:
      "Tienes DERECHO A DEFENSA. No es automático pagar. Tienes 30 días para impugnar.",
    pasos: [
      {
        numero: 1,
        descripcion: "Lee el comparendo completo",
        recomendacion:
          "Busca el artículo infringido. Algunos comparendos se dictan MAL (sin prueba real).",
      },
      {
        numero: 2,
        descripcion: "¿Era un retén o una cámara?",
        recomendacion:
          "Si fue cámara: piden prueba legal (calibración de equipo). Si no la tienen, es nulo.",
      },
      {
        numero: 3,
        descripcion: "Tienes 30 DÍAS para impugnar",
        recomendacion:
          "No dejes pasar. Después pierde el derecho de defensa (presunción de culpabilidad).",
      },
      {
        numero: 4,
        descripcion: "Presenta escrito de impugnación",
        recomendacion:
          "Puedes hacerlo por Notaría o directamente en la Secretaría de Movilidad (trae copia de todo).",
      },
      {
        numero: 5,
        descripcion: "Espera audiencia",
        recomendacion:
          "Te notificarán. En la audiencia presenta tu defensa (testigos, fotos, etc).",
      },
      {
        numero: 6,
        descripcion: "Si pierdes: tienes derecho de recursos",
        recomendacion: "Puedes apelar a una instancia superior.",
      },
    ],
    documentos_necesarios: [
      "Comparendo original",
      "Cédula",
      "Licencia",
      "Evidencia (fotos, testigos, dashcam)",
    ],
    referencias_legales:
      "Código de Procedimiento Administrativo - Artículo 85 (Derecho de Audiencia)",
  },

  {
    tipo: "compra_moto_usada",
    titulo: "Voy a comprar una moto usada. ¿Qué verifico?",
    contenido:
      "Checklist técnico y legal antes de firmar. Evita comprar en lío jurídico.",
    pasos: [
      {
        numero: 1,
        descripcion: "Verificación en el RUNT",
        recomendacion:
          "PASO 1: Costo ($16,500). Ve a Transito, trae cédula + placa. Te da certificado de tradición.",
      },
      {
        numero: 2,
        descripcion: "Revisión técnico-mecánica de confianza",
        recomendacion:
          "PASO 2: ¿Tiene choque? ¿Cilindro grano? ¿Aceite quemado? Lleva TU mecánico.",
      },
      {
        numero: 3,
        descripcion: "Transferencia en tránsito",
        recomendacion:
          "PASO 3: (~$150,000). Ambos en tránsito con cédulas + papeles. No firmes nada antes.",
      },
      {
        numero: 4,
        descripcion: "Póliza SOAT a tu nombre",
        recomendacion: "PASO 4: Es OBLIGATORIO. Busca el mejor precio (varía mucho).",
      },
      {
        numero: 5,
        descripcion: "¿Hay multa en el moto?",
        recomendacion: "Pregunta al tránsito. Si la hay, el VENDEDOR debe pagarla antes de vender.",
      },
    ],
    documentos_necesarios: [
      "Cédula vendedor y comprador",
      "Tarjeta de propiedad actual",
      "SOAT vigente",
      "Revisión técnica actual",
      "Certificado de tradición (RUNT)",
    ],
  },

  {
    tipo: "accidente",
    titulo: "Tuve un accidente. ¿Qué hago?",
    contenido:
      "Lo primero: seguridad. Luego: evidencia. Al final: trámites y seguros.",
    pasos: [
      {
        numero: 1,
        descripcion: "Seguridad primero",
        recomendacion:
          "¿Hay heridos? Llama ambulancia (122). ¿Hay peligro? Mueve la moto a un lado si puedes.",
      },
      {
        numero: 2,
        descripcion: "Llama a la policía",
        recomendacion: "Denuncio en línea (123) o presencial. Pide el número de denuncia.",
      },
      {
        numero: 3,
        descripcion: "Toma fotos de todo",
        recomendacion:
          "Placas, daños, posición final de motos, marcas en la vía, testigos (números).",
      },
      {
        numero: 4,
        descripcion: "Intercambia datos con otros involucrados",
        recomendacion: "Nombre, teléfono, cédula, placa, SOAT (NO firmes nada).",
      },
      {
        numero: 5,
        descripcion: "Avisa a tu asegurador ASAP",
        recomendacion:
          "Tienes días (checa póliza). Ellos abren el trámite de cobertura.",
      },
      {
        numero: 6,
        descripcion: "Guarda recibos médicos y de reparación",
        recomendacion: "El seguro los pide para reembolsar o pagar directo.",
      },
    ],
    documentos_necesarios: [
      "Denuncio policial",
      "Fotos del accidente",
      "Datos de otros involucrados",
      "Datos de testigos",
      "Póliza SOAT",
    ],
  },
];

// ─── Obtener información legal por tipo ──────────────────────────
export async function obtenerInfoLegal(tipo: string): Promise<InfoLegal | null> {
  try {
    const { data, error } = await supabase
      .from("legal_knowledge")
      .select("*")
      .eq("tipo", tipo)
      .maybeSingle();

    if (error) throw error;
    return data as InfoLegal | null;
  } catch (e) {
    console.error("Error obteniendo info legal:", e);
    return null;
  }
}

// ─── Inicializar base de conocimiento legal ─────────────────────
export async function inicializarBaseConocimientoLegal() {
  try {
    // Verificar si ya está inicializada
    const { data: existe } = await supabase
      .from("legal_knowledge")
      .select("id")
      .limit(1);

    if (existe && existe.length > 0) {
      console.log("Base de conocimiento legal ya inicializada");
      return true;
    }

    // Insertar conocimiento predefinido
    const { error } = await supabase.from("legal_knowledge").insert(
      CONOCIMIENTO_LEGAL.map((item) => ({
        tipo: item.tipo,
        titulo: item.titulo,
        contenido: item.contenido,
        pasos_json: item.pasos,
        documentos_necesarios: item.documentos_necesarios,
        referencias_legales: item.referencias_legales || null,
      }))
    );

    if (error) throw error;
    console.log("Base de conocimiento legal inicializada");
    return true;
  } catch (e) {
    console.error("Error inicializando base legal:", e);
    return false;
  }
}

// ─── Registrar incidente legal ──────────────────────────────────
export async function registrarIncidenteLegal(
  riderId: string,
  tipoIncidente: string,
  descripcion: string,
) {
  try {
    const { error } = await supabase.from("rider_legal_history").insert({
      rider_id: riderId,
      tipo_incidente: tipoIncidente,
      fecha: new Date().toISOString().split("T")[0],
      descripcion,
    });

    if (error) throw error;
    return true;
  } catch (e) {
    console.error("Error registrando incidente legal:", e);
    return false;
  }
}

// ─── Generar contexto legal para el prompt ──────────────────────
export async function generarContextoLegal(phone: string): Promise<string> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return "";

    const { data: historial } = await supabase
      .from("rider_legal_history")
      .select("*")
      .eq("rider_id", rider.id)
      .order("fecha", { ascending: false })
      .limit(3);

    if (!historial || historial.length === 0) return "";

    let contexto = "HISTORIAL LEGAL DEL RIDER:\n";
    historial.forEach((item) => {
      contexto += `- ${item.tipo_incidente} (${item.fecha}): ${item.descripcion}\n`;
    });

    return contexto;
  } catch (e) {
    console.error("Error generando contexto legal:", e);
    return "";
  }
}
