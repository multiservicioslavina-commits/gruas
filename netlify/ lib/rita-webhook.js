// netlify/functions/rita-webhook.js
//
// RITA v3 — 100% HAIKU (económico)
// Una sola llamada a Haiku que decide, ejecuta herramientas y responde
//

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
const { classifyIntent } = require("./lib/router");
const { TOOLS_DEFINITION, executeTool } = require("./lib/tools");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const RIDERA_SYSTEM_PROMPT = `Eres Rita, la asistente virtual de Ridera, un ecosistema
de motociclismo en Colombia. Respondes por WhatsApp: tono cercano, motero, claro y breve.

Tienes acceso a herramientas para:
- Buscar talleres/almacenes por nombre o ubicación (search_taller, search_almacen)
- Crear citas de servicio (create_cita)
- Reportar errores de información (report_error)
- Obtener eventos cercanos (get_events)
- Guardar/obtener ubicación del usuario (set_user_location, get_user_location)
- Buscar grúas de emergencia (search_grua)

IMPORTANTE: Usa las herramientas cuando sea útil:
- Si alguien dice "busco taller en Medellín" → search_taller
- Si dice "quiero una cita" → create_cita
- Si dice "me varé" → search_grua
- Si dice "info incorrecta" → report_error
- Si pide ubicación cercana → get_user_location o set_user_location

Sé breve (máx 3-4 frases en WhatsApp). No inventes datos que no vengan de las herramientas.`;

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
    await sendWhatsAppMessage(from, "Por ahora solo puedo leer mensajes de texto 🙏");
    return { statusCode: 200, body: "ok" };
  }

  try {
    const existingContact = await getContact(from);
    let contactId = existingContact?.id;

    // Crea/actualiza contacto
    const { data: contactData } = await supabase
      .from("rita_contacts")
      .upsert({ whatsapp_number: from, last_seen: new Date() }, { onConflict: "whatsapp_number" })
      .select()
      .single();

    if (contactData) {
      contactId = contactData.id;
    }

    // Primera vez: preguntar nombre
    if (!existingContact) {
      await sendWhatsAppMessage(
        from,
        "¡Hola! Soy Rita, la asistente de Ridera 🏍️ ¿Cómo te llamas?"
      );
      return { statusCode: 200, body: "asked name" };
    }

    // Guardando nombre
    if (existingContact.awaiting_name) {
      const name = sanitizeName(text);
      await supabase
        .from("rita_contacts")
        .update({ preferred_name: name, awaiting_name: false })
        .eq("id", contactId);

      await sendWhatsAppMessage(
        from,
        `¡Un gusto, ${name}! 🛵 Cuéntame en qué te ayudo — talleres, almacenes, o lo que necesites.`
      );
      return { statusCode: 200, body: "name saved" };
    }

    // Opt-out broadcasts
    if (/^\s*(baja|stop|no\s*más)\s*$/i.test(text)) {
      await supabase
        .from("rita_contacts")
        .update({ opted_out_broadcasts: true })
        .eq("id", contactId);

      await sendWhatsAppMessage(
        from,
        "Listo, no te enviaré avisos masivos. Sigues pudiendo escribirme 🙂"
      );
      return { statusCode: 200, body: "opted out" };
    }

    const intent = classifyIntent(text);

    // Límite diario
    const dailyLimit = parseInt(process.env.RITA_DAILY_MESSAGE_LIMIT || "40", 10);
    const { count: usedToday } = await supabase
      .from("rita_messages")
      .select("*", { count: "exact" })
      .eq("contact_id", contactId)
      .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString());

    let reply;
    if ((usedToday || 0) > dailyLimit) {
      reply = "Hoy ya hablamos bastante 😅 ¡Escríbeme mañana!";
    } else {
      // ========== FLUJO CON TOOL USE (HAIKU) ==========
      reply = await buildReplyWithHaikuToolUse(
        contactId,
        from,
        text,
        existingContact.preferred_name
      );
    }

    await sendWhatsAppMessage(from, reply);
    await supabase.from("rita_messages").insert({
      contact_id: contactId,
      role: "assistant",
      content: reply,
      intent,
    });

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("Rita error:", err);
    try {
      await sendWhatsAppMessage(from, "Tuve un problema 😕 Intenta de nuevo.");
    } catch (_) {}
    return { statusCode: 200, body: "error handled" };
  }
}

// ============================================================================
// FLUJO 100% HAIKU (decision + ejecución + respuesta en una llamada)
// ============================================================================

async function buildReplyWithHaikuToolUse(contactId, whatsappNumber, userText, preferredName) {
  const history = await getRecentHistory(whatsappNumber, 4); // Últimos 4 mensajes

  // Construir historial
  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userText },
  ];

  // Primer paso: Haiku decide qué herramientas usar y las ejecuta
  const systemBlocks = [
    {
      type: "text",
      text: RIDERA_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
  ];

  if (preferredName) {
    systemBlocks.push({
      type: "text",
      text: `Este usuario se llama ${preferredName}. Salúdalo naturalmente.`,
    });
  }

  // Llamada 1: Haiku CON TOOL USE
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

  // Ejecutar herramientas si las usó
  let toolResults = [];
  let finalMessages = [...messages];

  for (const content of toolData.content) {
    if (content.type === "tool_use") {
      try {
        const result = await executeTool(contactId, content.name, content.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: content.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: content.id,
          content: `Error: ${err.message}`,
          is_error: true,
        });
      }
    } else if (content.type === "text") {
      // Si Claude ya generó texto, guardarlo para la respuesta final
      return content.text;
    }
  }

  // Si usó herramientas, segunda llamada con los resultados
  if (toolResults.length > 0) {
    finalMessages.push({ role: "assistant", content: toolData.content });
    finalMessages.push({ role: "user", content: toolResults });

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

// ============================================================================
// HELPERS
// ============================================================================

function sanitizeName(rawText) {
  const cleaned = rawText
    .replace(/[^\p{L}\s]/gu, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");

  return cleaned || "amigo";
}

module.exports = { handler: exports.handler };
