// lib/claude.js
//
// Rita con tool calling nativo de la API de Anthropic (sin SDK externo).
// Claude decide qué herramienta usar según contexto.
// Herramientas disponibles:
//   buscar_taller      → directorio de talleres por ciudad/nombre
//   buscar_almacen     → directorio de almacenes + productos
//   buscar_moto_venta  → marketplace motos.venta en Supabase
//   info_pasaporte     → datos del reto Pasaporte Ridera 125
//   llamar_grua        → emergencia en carretera
//   reportar_error     → usuario corrige información incorrecta

const { getTierConfig } = require("./tiers");
const {
  searchDirectory,
  searchProductos,
  logErrorAlert,
} = require("./supabase");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://vzzxsdtsaahhzyctvmhx.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const sbHeaders = {
  "Content-Type": "application/json",
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
};

// ── Prompt del sistema ────────────────────────────────────────────────────
function buildSystemPrompt(userName) {
  const nombre = userName
    ? `Este usuario se llama ${userName}. Úsalo de forma natural, sin repetirlo en cada frase.`
    : "";
  return `Eres Rita, la asistente virtual de Ridera, el ecosistema de motociclismo de alto cilindraje en Colombia.

Ridera tiene: directorio de talleres y almacenes, grúas de emergencia, el reto Pasaporte Ridera 125 (visitar los 125 municipios de Antioquia), marketplace de motos usadas (500cc+), Ridera Club y Ridera Aventuras.

Respondes por WhatsApp: tono motero, cercano y práctico. Máximo 3-4 frases salvo que pidan más detalle.
No inventes direcciones, teléfonos ni precios — solo usa lo que te devuelvan las herramientas.
Si no hay resultados, dilo honestamente y sugiere ridera.com.co.
${nombre}

IMPORTANTE: Tienes herramientas disponibles. Úsalas siempre que el usuario pregunte por talleres, almacenes, motos en venta, grúas o el Pasaporte. No respondas de memoria cuando puedes buscar datos reales.`;
}

// ── Definición de herramientas (formato Anthropic nativo) ─────────────────
const TOOLS = [
  {
    name: "buscar_taller",
    description:
      "Busca talleres de motos en el directorio de Ridera. Úsala cuando el usuario pregunta por talleres, mecánicos, reparaciones o servicios técnicos.",
    input_schema: {
      type: "object",
      properties: {
        termino: {
          type: "string",
          description: "Ciudad o nombre del taller a buscar",
        },
      },
      required: ["termino"],
    },
  },
  {
    name: "buscar_almacen",
    description:
      "Busca almacenes de repuestos y productos para motos. Úsala cuando el usuario busca repuestos, accesorios, tiendas de motos o productos específicos.",
    input_schema: {
      type: "object",
      properties: {
        termino: {
          type: "string",
          description: "Producto, ciudad o nombre del almacén",
        },
      },
      required: ["termino"],
    },
  },
  {
    name: "buscar_moto_venta",
    description:
      "Busca motos en venta en el marketplace de Ridera (500cc+). Úsala cuando el usuario quiere comprar una moto, ve precios, o pregunta por motos disponibles.",
    input_schema: {
      type: "object",
      properties: {
        marca: {
          type: "string",
          description: "Marca de la moto (ej: BMW, KTM, Honda)",
        },
        presupuesto_max: {
          type: "number",
          description: "Precio máximo en millones de pesos colombianos",
        },
        ciudad: {
          type: "string",
          description: "Ciudad donde está la moto",
        },
        modelo: {
          type: "string",
          description: "Modelo o referencia (ej: GS, Africa Twin, Duke)",
        },
      },
      required: [],
    },
  },
  {
    name: "info_pasaporte",
    description:
      "Entrega información sobre el Pasaporte Ridera 125, el reto de visitar los 125 municipios de Antioquia en moto.",
    input_schema: {
      type: "object",
      properties: {
        pregunta: {
          type: "string",
          description: "La pregunta específica del usuario sobre el Pasaporte",
        },
      },
      required: ["pregunta"],
    },
  },
  {
    name: "llamar_grua",
    description:
      "Activa el protocolo de emergencia en carretera: moto varada, accidente, daño mecánico, o cualquier situación urgente.",
    input_schema: {
      type: "object",
      properties: {
        descripcion: {
          type: "string",
          description: "Qué pasó según el usuario",
        },
      },
      required: ["descripcion"],
    },
  },
  {
    name: "reportar_error",
    description:
      "Registra cuando el usuario dice que hay información incorrecta, un teléfono mal, una dirección equivocada o cualquier dato desactualizado.",
    input_schema: {
      type: "object",
      properties: {
        tipo: {
          type: "string",
          description:
            "Qué tipo de error reporta (teléfono, dirección, horario, precio, etc.)",
        },
        detalle: {
          type: "string",
          description: "Descripción exacta del error según el usuario",
        },
      },
      required: ["tipo", "detalle"],
    },
  },
];

// ── Ejecutores de herramientas ─────────────────────────────────────────────
async function executeTool(name, input, from) {
  if (name === "buscar_taller") {
    const resultados = await searchDirectory("taller", input.termino);
    if (!resultados.length) return { encontrado: false, resultados: [] };
    return {
      encontrado: true,
      resultados: resultados.map((r) => ({
        nombre: stripHtml(r.title),
        resumen: stripHtml(r.excerpt || r.content).slice(0, 250),
        enlace: r.link,
      })),
    };
  }

  if (name === "buscar_almacen") {
    const [directorio, productos] = await Promise.all([
      searchDirectory("almacen", input.termino),
      searchProductos(input.termino, 6),
    ]);
    return {
      encontrado: directorio.length > 0 || productos.length > 0,
      almacenes: directorio.map((r) => ({
        nombre: stripHtml(r.title),
        resumen: stripHtml(r.excerpt || r.content).slice(0, 200),
        enlace: r.link,
      })),
      productos: productos.map((p) => ({
        nombre: p.nombre,
        categoria: p.categoria,
        precio: p.precio ? `$${formatPrice(p.precio)}` : null,
        almacen: p.almacen,
        ciudad: p.ciudad,
        telefono: p.telefono,
      })),
    };
  }

  if (name === "buscar_moto_venta") {
    const { marca, presupuesto_max, ciudad, modelo } = input;
    let url = `${SUPABASE_URL}/rest/v1/motos_venta?aprobado=eq.true&vendido=eq.false&select=titulo,marca,modelo,anio,precio,kilometraje,ciudad,cilindraje&order=destacado.desc,created_at.desc&limit=5`;
    if (marca) url += `&marca=ilike.*${encodeURIComponent(marca)}*`;
    if (ciudad) url += `&ciudad=ilike.*${encodeURIComponent(ciudad)}*`;
    if (presupuesto_max) url += `&precio=lte.${presupuesto_max * 1000000}`;
    if (modelo)
      url += `&or=(modelo.ilike.*${encodeURIComponent(modelo)}*,titulo.ilike.*${encodeURIComponent(modelo)}*)`;

    const res = await fetch(url, { headers: sbHeaders });
    if (!res.ok) return { encontrado: false, motos: [] };
    const motos = await res.json();
    return {
      encontrado: motos.length > 0,
      total_encontradas: motos.length,
      motos: motos.map((m) => ({
        titulo: m.titulo || `${m.marca} ${m.modelo}`,
        anio: m.anio,
        precio: m.precio ? `$${formatPrice(m.precio)}` : "Consultar",
        km: m.kilometraje ? `${formatPrice(m.kilometraje)} km` : null,
        ciudad: m.ciudad,
        cilindraje: m.cilindraje ? `${m.cilindraje} cc` : null,
      })),
      ver_todas: "ridera.com.co/marketplace",
    };
  }

  if (name === "info_pasaporte") {
    return {
      descripcion:
        "El Pasaporte Ridera 125 es un reto digital para motociclistas: visitar los 125 municipios del departamento de Antioquia, Colombia.",
      como_participar:
        "Regístrate en pasaporte.ridera.com.co, descarga la app o úsala desde el navegador, y empieza a sellar municipios. Es gratis.",
      beneficios:
        "Comunidad de riders, álbum digital de municipios visitados, reconocimiento en el mapa de Ridera.",
      estado_actual: "Activo — cualquier motorista puede unirse ahora.",
      pregunta_original: input.pregunta,
    };
  }

  if (name === "llamar_grua") {
    const gruaPhone = process.env.GRUA_RIDERA_PHONE || "ridera.com.co/gruas";
    return {
      es_emergencia: true,
      contacto_grua: gruaPhone,
      app_gruas: "ridera.com.co/gruas",
      mensaje_urgente: true,
      descripcion_recibida: input.descripcion,
    };
  }

  if (name === "reportar_error") {
    await logErrorAlert(null, from, `[${input.tipo}] ${input.detalle}`, {
      via: "tool_calling",
    });
    return {
      registrado: true,
      mensaje: "Error registrado y enviado al equipo de Ridera para revisión.",
    };
  }

  return { error: `Herramienta desconocida: ${name}` };
}

// ── Función principal ─────────────────────────────────────────────────────
async function askClaude(_ignoredSystemPrompt, conversationHistory, options = {}) {
  const tier = getTierConfig();
  const systemPrompt = buildSystemPrompt(options.userName);
  const from = options.from || "unknown";

  const model = options.model || tier.model || "claude-haiku-4-5-20251001";
  const maxTokens = options.maxTokens || tier.maxTokens || 450;

  const messages = conversationHistory.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Agentic loop: hasta 3 rondas de tool calling
  for (let step = 0; step < 3; step++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
        tools: TOOLS,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API falló (${res.status}): ${err}`);
    }

    const data = await res.json();

    // Si Claude terminó con texto, devolvemos
    if (data.stop_reason === "end_turn") {
      const textBlock = data.content?.find((b) => b.type === "text");
      return textBlock?.text || "Perdón, no pude generar una respuesta en este momento.";
    }

    // Si Claude quiere usar herramientas
    if (data.stop_reason === "tool_use") {
      const toolUses = data.content.filter((b) => b.type === "tool_use");
      if (!toolUses.length) break;

      // Agregar respuesta de Claude (con tool_use blocks) al historial
      messages.push({ role: "assistant", content: data.content });

      // Ejecutar todas las herramientas solicitadas
      const toolResults = await Promise.all(
        toolUses.map(async (tu) => ({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(await executeTool(tu.name, tu.input, from)),
        }))
      );

      // Agregar resultados al historial para la próxima ronda
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // Otro stop_reason (max_tokens, etc.) → devolver lo que haya
    const textBlock = data.content?.find((b) => b.type === "text");
    return textBlock?.text || "Perdón, no pude generar una respuesta en este momento.";
  }

  return "Perdón, no pude generar una respuesta en este momento.";
}

// ── Helpers ───────────────────────────────────────────────────────────────
function stripHtml(html = "") {
  return html.replace(/<[^>]*>/g, "").trim();
}

function formatPrice(price) {
  return parseFloat(price).toLocaleString("es-CO", {
    minimumFractionDigits: 0,
  });
}

module.exports = { askClaude };
