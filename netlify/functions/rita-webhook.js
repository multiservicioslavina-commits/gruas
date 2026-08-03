// netlify/functions/rita-webhook.js
//
// RITA — 100% Haiku (económico) + Tool Use + detección de errores
//
// Variables de entorno requeridas:
//   WHATSAPP_VERIFY_TOKEN, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID
//   ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
//   GRUA_RIDERA_PHONE, RITA_DAILY_MESSAGE_LIMIT (opcional, default 40)

const { sendWhatsAppMessage, extractIncomingMessage } = require("./lib/whatsapp");
const {
  logMessage,
  getRecentHistory,
  countMessagesToday,
  upsertContact,
  setOptOut,
  getContact,
  setPreferredName,
} = require("./lib/supabase");
const { classifyIntent, EMERGENCY_REPLY } = require("./lib/router");
const { TOOLS_DEFINITION, executeTool } = require("./lib/tools");
const { detectsError, logErrorAlert, getErrorAcknowledgmentResponse } = require("./lib/error-detection");

const RIDERA_SYSTEM_PROMPT = `Eres Rita, la asistente virtual de Ridera, un ecosistema de motociclismo en Colombia.

TU PERSONALIDAD:
- Tono cercano, amigable y motero, pero SIN usar "parce" ni frases genéricas
- Eres la asistente confiable de alguien que ama las motos
- Hablas como si fueras una amiga de confianza del mundo del motociclismo
- Claro, breve (máximo 3-4 frases salvo que pidan más detalle)

INFORMACIÓN QUE OFRECES:
- Directorio de talleres, almacenes y grúas en Colombia
- El reto Pasaporte Ridera 125 (visita los 125 municipios de Antioquia)
- Ridera Aventuras (rutas, eventos)

REGLAS IMPORTANTES:
1. Cuando el usuario comparta su nombre, úsalo de forma natural en las respuestas.
2. NO repitas el nombre en cada frase - sé natural, como amigos hablando
3. Si no tienes información, sé honesto: "No tengo esa info en el directorio, pero puedo ayudarte en..."
4. Nunca inventes direcciones, teléfonos ni precios
5. Mantén un tono motivador cuando hables de motos, rutas o aventuras
6. Sé útil: ofrece alternativas si lo que buscan no existe

HERRAMIENTAS (usa cuando sea útil):
- Buscar talleres/almacenes (search_taller, search_almacen)
- Crear citas de servicio (create_cita)
- Reportar errores de información (report_error)
- Obtener eventos cercanos (get_events)
- Guardar/obtener ubicación del usuario (set_user_location, get_user_location)
- Buscar grúas de emergencia (search_grua)

No inventes datos que no vengan de las herramientas.`;

exports.handler = async (event) => {
  if (event.httpMethod === "GET") {
    return handleVerification(event);
  }
  if (event.httpMethod === "POST") {
    return handleIncomingMessage(event);
  }
  return { statusCode: 405, body: "Method not allowed" };
};

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

async function handleIncomingMessage(event) {
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const incoming = extractIncomingMessage(body);
  if (!incoming) {
    return { statusCode: 200, body: "ignored" };
  }

  const { from, text, unsupportedType } = incoming;

  if (unsupportedType) {
    await sendWhatsAppMessage(from, "Por ahora solo puedo leer mensajes de texto 🙏 ¿me lo escribes?");
    return { statusCode: 200, body: "ok" };
  }

  try {
    const existingContact = await getContact(from);
    await upsertContact(from); // crea el contacto si no existe / actualiza last_seen

    // Primera vez que este número escribe -> preguntar el nombre
    if (!existingContact) {
      await sendWhatsAppMessage(from, "¡Hola! Soy Rita, la asistente de Ridera 🏍️ ¿Cómo te llamas?");
      return { statusCode: 200, body: "asked name" };
    }

    // Ya le preguntamos el nombre y este mensaje es la respuesta
    if (existingContact.awaiting_name) {
      const name = sanitizeName(text);
      await setPreferredName(from, name);
      await sendWhatsAppMessage(
        from,
        `¡Un gusto, ${name}! 🛵 Ya quedaste registrado. Cuéntame en qué te ayudo — talleres, almacenes, grúas, o el Pasaporte 125.`
      );
      return { statusCode: 200, body: "name saved" };
    }

    // Opt-out de broadcasts
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
    if (intent === "emergency") {
      reply = EMERGENCY_REPLY;
    } else if (usedToday > dailyLimit) {
      reply = "Hoy ya hablamos bastante 😅 Para cuidar el servicio, tengo un límite diario de mensajes por persona. ¡Escríbeme mañana y seguimos!";
    } else {
      reply = await buildReplyWithHaikuToolUse(from, from, text, existingContact.preferred_name);
    }

    await sendWhatsAppMessage(from, reply);
    await logMessage(from, "assistant", reply, intent);

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("Rita error:", err);
    try {
      await sendWhatsAppMessage(from, "Tuve un problema respondiendo tu mensaje 😕 intenta de nuevo en un momento.");
    } catch (_) {}
    return { statusCode: 200, body: "error handled" };
  }
}

// ============================================================================
// FLUJO 100% HAIKU: decide herramientas -> las ejecuta -> redacta respuesta
// ============================================================================

async function buildReplyWithHaikuToolUse(contactId, whatsappNumber, userText, preferredName) {
  const history = await getRecentHistory(whatsappNumber, 4);

  const systemBlocks = [
    { type: "text", text: RIDERA_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
  ];
  if (preferredName) {
    systemBlocks.push({
      type: "text",
      text: `Este usuario se llama ${preferredName}. Salúdalo naturalmente sin repetir el nombre en cada frase.`,
    });
  }

  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userText },
  ];

  const toolResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: systemBlocks,
      tools: TOOLS_DEFINITION,
      messages,
    }),
  });

  if (!toolResponse.ok) {
    throw new Error(`Claude API failed: ${await toolResponse.text()}`);
  }

  const toolData = await toolResponse.json();

  let toolResults = [];
  for (const content of toolData.content) {
    if (content.type === "tool_use") {
      try {
        const result = await executeTool(contactId, content.name, content.input);
        toolResults.push({ type: "tool_result", tool_use_id: content.id, content: JSON.stringify(result) });
      } catch (err) {
        toolResults.push({ type: "tool_result", tool_use_id: content.id, content: `Error: ${err.message}`, is_error: true });
      }
    } else if (content.type === "text" && toolResults.length === 0) {
      return content.text;
    }
  }

  if (toolResults.length > 0) {
    const finalMessages = [
      ...messages,
      { role: "assistant", content: toolData.content },
      { role: "user", content: toolResults },
    ];

    const finalResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: systemBlocks,
        messages: finalMessages,
      }),
    });

    if (!finalResponse.ok) {
      throw new Error(`Claude API failed: ${await finalResponse.text()}`);
    }

    const finalData = await finalResponse.json();
    const textBlock = finalData.content?.find((b) => b.type === "text");
    return textBlock?.text || "No pude generar una respuesta.";
  }

  return "No entendí bien, ¿puedes ser más específico?";
}

function sanitizeName(rawText) {
  const cleaned = rawText
    .replace(/[^\p{L}\s]/gu, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");

  if (!cleaned) return "amigo";

  return cleaned
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
