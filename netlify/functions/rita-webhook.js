// netlify/functions/rita-webhook.js
//
// Core de Rita de Ridera. Maneja:
//  - GET  -> verificacion del webhook de WhatsApp Cloud API (Meta)
//  - POST -> mensajes entrantes: enruta intencion, busca contexto si aplica,
//            llama a Claude, responde por WhatsApp y guarda el historial.
//
// Variables de entorno requeridas:
//   WHATSAPP_VERIFY_TOKEN   -> el que configuras en Meta App > Webhooks
//   WHATSAPP_ACCESS_TOKEN
//   WHATSAPP_PHONE_NUMBER_ID
//   ANTHROPIC_API_KEY
//   CLAUDE_MODEL             (opcional, default claude-haiku-4-5-20251001)
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
//   GRUA_RIDERA_PHONE         (opcional, numero de contacto para emergencias)

const { sendWhatsAppMessage, extractIncomingMessage } = require("./lib/whatsapp");
const {
  searchDirectory,
  searchProductos,
  logMessage,
  getRecentHistory,
  countMessagesToday,
  upsertContact,
  setOptOut,
  getContact,
  setPreferredName,
} = require("./lib/supabase");
const { askClaude } = require("./lib/claude");
const { classifyIntent, extractSearchTerm, EMERGENCY_REPLY } = require("./lib/router");
const { getTierConfig } = require("./lib/tiers");
const { detectsError, logErrorAlert, getErrorAcknowledgmentResponse } = require("./lib/error-detection");

const RIDERA_SYSTEM_PROMPT = `Eres Rita, la asistente virtual de Ridera, un ecosistema
de motociclismo en Colombia (directorio de talleres/almacenes/grúas, el reto
Pasaporte Ridera 125, y Ridera Aventuras). Respondes por WhatsApp: tono cercano,
amigable y motero, pero SIN usar "parce" ni frases genéricas. Claro y breve
(máximo 3-4 frases salvo que te pidan más detalle).
Cuando el usuario comparta su nombre, úsalo de forma natural en tus respuestas,
sin repetirlo en cada frase.
Si no tienes información suficiente para responder algo específico, dilo
honestamente y sugiere que la persona visite ridera.com.co o contacte soporte.
No inventes direcciones, teléfonos ni precios que no te hayan dado como contexto.`;

exports.handler = async (event) => {
  if (event.httpMethod === "GET") {
    return handleVerification(event);
  }

  if (event.httpMethod === "POST") {
    return handleIncomingMessage(event);
  }

  return { statusCode: 405, body: "Method not allowed" };
};

// --- Verificación del webhook (Meta) ---------------------------------

function handleVerification(event) {
  const params = event.queryStringParameters || {};
  const mode = params["hub.mode"];
  const token = params["hub.verify_token"];
  const challenge = params["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return { statusCode: 200, body: challenge };
  }

  return { statusCode: 403, body: "Forbidden" };
}

// --- Mensajes entrantes ------------------------------------------------

async function handleIncomingMessage(event) {
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const incoming = extractIncomingMessage(body);

  // No es un mensaje de texto nuevo (status update, etc.) -> ack silencioso
  if (!incoming) {
    return { statusCode: 200, body: "ignored" };
  }

  const { from, text, unsupportedType } = incoming;

  if (unsupportedType) {
    await sendWhatsAppMessage(
      from,
      "Por ahora solo puedo leer mensajes de texto 🙏 ¿me lo escribes?"
    );
    return { statusCode: 200, body: "ok" };
  }

  try {
    const existingContact = await getContact(from);
    await upsertContact(from); // crea el contacto si no existe / actualiza last_seen

    // Caso 1: es la primera vez que este número le escribe a Rita -> preguntar el nombre
    if (!existingContact) {
      await sendWhatsAppMessage(
        from,
        "¡Hola! Soy Rita, la asistente de Ridera 🏍️ ¿Cómo te llamas?"
      );
      return { statusCode: 200, body: "asked name" };
    }

    // Caso 2: ya le preguntamos el nombre y este mensaje es la respuesta
    if (existingContact.awaiting_name) {
      const name = sanitizeName(text);
      await setPreferredName(from, name);
      await sendWhatsAppMessage(
        from,
        `¡Un gusto, ${name}! Ya quedaste registrado. Cuéntame en qué te ayudo — talleres, almacenes, el Pasaporte Ridera 125, o lo que necesites 🛵`
      );
      return { statusCode: 200, body: "name saved" };
    }

    // Palabra clave para darse de baja de broadcasts (no de Rita en general)
    if (/^\s*(baja|stop|no\s*más)\s*$/i.test(text)) {
      await setOptOut(from, false);
      await sendWhatsAppMessage(from, "Listo, no te volveré a enviar avisos masivos. Sigues pudiendo escribirme cuando quieras 🙂");
      return { statusCode: 200, body: "opted out" };
    }

    // Detección de corrección/error reportado por el usuario -> alerta al admin
    if (detectsError(text)) {
      await logErrorAlert(null, from, text, { preferred_name: existingContact.preferred_name });
      const ack = getErrorAcknowledgmentResponse(existingContact.preferred_name);
      await sendWhatsAppMessage(from, ack);
      await logMessage(from, "user", text, "error_report");
      await logMessage(from, "assistant", ack, "error_report");
      return { statusCode: 200, body: "error logged" };
    }

    const intent = classifyIntent(text);
    await logMessage(from, "user", text, intent);

    const dailyLimit = parseInt(process.env.RITA_DAILY_MESSAGE_LIMIT || "40", 10);
    const usedToday = await countMessagesToday(from);

    let reply;
    if (usedToday > dailyLimit) {
      // No llamamos a Claude: cortamos el gasto antes de generar la respuesta
      reply =
        "Hoy ya hablamos bastante 😅 Para cuidar el servicio, tengo un límite diario de mensajes por persona. ¡Escríbeme mañana y seguimos!";
    } else {
      reply = await buildReply(from, text, intent, existingContact.preferred_name);
    }

    await sendWhatsAppMessage(from, reply);
    await logMessage(from, "assistant", reply, intent);

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("Rita error:", err);
    // Intentamos avisarle al usuario aunque algo haya fallado internamente
    try {
      await sendWhatsAppMessage(
        from,
        "Tuve un problema respondiendo tu mensaje 😕 intenta de nuevo en un momento."
      );
    } catch (_) {}
    return { statusCode: 200, body: "error handled" };
  }
}

// --- Construcción de la respuesta según intención -----------------------

async function buildReply(from, text, intent, preferredName) {
  const tier = getTierConfig();

  if (intent === "emergency") {
    return EMERGENCY_REPLY;
  }

  if (intent === "taller_search" || intent === "almacen_search") {
    const type = intent === "taller_search" ? "taller" : "almacen";
    const term = extractSearchTerm(text, intent);
    const dirResults = term ? await searchDirectory(type, term) : [];

    let context = "";
    if (intent === "almacen_search") {
      const productResults = term ? await searchProductos(term) : [];
      if (productResults.length) {
        context += "Productos encontrados en almacenes Ridera:\n";
        context += productResults
          .map((p) => `- ${p.nombre} (${p.categoria}): $${formatPrice(p.precio)} | ${p.almacen} en ${p.ciudad} | ${p.telefono}`)
          .join("\n");
      }
      if (dirResults.length) {
        if (productResults.length) context += "\n\nTambién hay almacenes en el directorio:\n";
        context += dirResults
          .map((r) => `- ${stripHtml(r.title)}: ${stripHtml(r.excerpt || r.content).slice(0, 200)} (${r.link})`)
          .join("\n");
      }
    } else {
      context = dirResults.length
        ? dirResults
            .map((r) => `- ${stripHtml(r.title)}: ${stripHtml(r.excerpt || r.content).slice(0, 200)} (${r.link})`)
            .join("\n")
        : "No se encontraron resultados en el directorio para ese término.";
    }

    if (!context) context = "No se encontraron resultados para ese término.";

    const history = await getRecentHistory(from, tier.historyMessages);
    const messages = [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      {
        role: "user",
        content: `Pregunta del usuario: "${text}"\n\nResultados disponibles:\n${context}\n\nResponde usando SOLO esta información. Si no hay resultados útiles, dilo y sugiere buscar en ridera.com.co.`,
      },
    ];

    return askClaude(RIDERA_SYSTEM_PROMPT, messages, { model: tier.searchModel, userName: preferredName });
  }

  if (intent === "pasaporte") {
    const history = await getRecentHistory(from, tier.historyMessages);
    const messages = [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      {
        role: "user",
        content: `${text}\n\n(Contexto: el usuario pregunta sobre el Pasaporte Ridera 125, el reto de visitar los 125 municipios de Antioquia en moto y sellar el pasaporte digital.)`,
      },
    ];
    return askClaude(RIDERA_SYSTEM_PROMPT, messages, { userName: preferredName });
  }

  if (intent === "cita") {
    const term = extractSearchTerm(text, "taller_search");
    const results = term ? await searchDirectory("taller", term) : [];

    const context = results.length
      ? results
          .map((r) => `- ${stripHtml(r.title)}: ${stripHtml(r.excerpt || r.content).slice(0, 200)} (${r.link})`)
          .join("\n")
      : "";

    const citaContext = `Pregunta del usuario: "${text}"

El usuario quiere agendar una cita o consultar disponibilidad en un taller.
${context ? `\nTalleres encontrados en el directorio:\n${context}` : "\nNo se encontraron talleres específicos."}

Ayúdalo de forma práctica:
1. Si mencionó un taller específico y lo encontraste en el directorio, dale el enlace y sugiere que los contacte directamente para agendar.
2. Si no especificó taller, pregúntale en qué ciudad está o qué tipo de servicio necesita para buscar opciones.
3. Si no hay resultados, sugiérele buscar en ridera.com.co/talleres.
No inventes horarios ni disponibilidad — esos datos los tiene cada taller.`;

    const history = await getRecentHistory(from, tier.historyMessages);
    const messages = [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: citaContext },
    ];

    return askClaude(RIDERA_SYSTEM_PROMPT, messages, { model: tier.searchModel, userName: preferredName });
  }

  // general
  const history = await getRecentHistory(from, tier.historyMessages);
  const messages = [...history.map((h) => ({ role: h.role, content: h.content })), { role: "user", content: text }];
  return askClaude(RIDERA_SYSTEM_PROMPT, messages, { userName: preferredName });
}

// Limpia lo que la persona respondió a "¿cómo te llamas?"
// para que quede como un nombre presentable (sin frases completas raras).
function sanitizeName(rawText) {
  const cleaned = rawText
    .replace(/[^\p{L}\s]/gu, "") // solo letras y espacios
    .trim()
    .split(/\s+/)
    .slice(0, 2) // máximo dos palabras (nombre + uno más)
    .join(" ");

  if (!cleaned) return "amigo"; // fallback si mandó algo raro (emoji, número, etc.)

  return cleaned
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function stripHtml(html = "") {
  return html.replace(/<[^>]*>/g, "").trim();
}

function formatPrice(price) {
  return parseFloat(price).toLocaleString("es-CO", { minimumFractionDigits: 0 });
}
