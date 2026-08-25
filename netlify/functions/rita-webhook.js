// netlify/functions/rita-webhook.js
//
// Rita de Ridera — con Vercel AI SDK + tool calling.
// Claude decide qué herramientas usar; ya no hay clasificador manual de intenciones.
//
// Variables de entorno requeridas:
//   WHATSAPP_VERIFY_TOKEN
//   WHATSAPP_ACCESS_TOKEN
//   WHATSAPP_PHONE_NUMBER_ID
//   ANTHROPIC_API_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
//   RITA_TIER              (basico | avanzado | maximo — default: basico)
//   RITA_DAILY_MESSAGE_LIMIT (default: 40)
//   GRUA_RIDERA_PHONE      (número de emergencias)

const { sendWhatsAppMessage, extractIncomingMessage } = require("./lib/whatsapp");
const {
  logMessage,
  getRecentHistory,
  countMessagesToday,
  upsertContact,
  setOptOut,
  getContact,
  setPreferredName,
  checkConsent,
  saveConsent,
} = require("./lib/supabase");
const { askClaude } = require("./lib/claude");
const { getTierConfig } = require("./lib/tiers");
const { getErrorAcknowledgmentResponse } = require("./lib/error-detection");

exports.handler = async (event) => {
  if (event.httpMethod === "GET")  return handleVerification(event);
  if (event.httpMethod === "POST") return handleIncomingMessage(event);
  return { statusCode: 405, body: "Method not allowed" };
};

// ── Verificación del webhook (Meta) ───────────────────────────────────────
function handleVerification(event) {
  const p = event.queryStringParameters || {};
  if (p["hub.mode"] === "subscribe" && p["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN) {
    return { statusCode: 200, body: p["hub.challenge"] };
  }
  return { statusCode: 403, body: "Forbidden" };
}

// ── Mensajes entrantes ────────────────────────────────────────────────────
async function handleIncomingMessage(event) {
  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: "Invalid JSON" }; }

  const incoming = extractIncomingMessage(body);
  if (!incoming) return { statusCode: 200, body: "ignored" };

  const { from, text, unsupportedType } = incoming;

  if (unsupportedType) {
    await sendWhatsAppMessage(from, "Por ahora solo puedo leer mensajes de texto 🙏 ¿me lo escribes?");
    return { statusCode: 200, body: "ok" };
  }

  try {
    const contact = await getContact(from);
    await upsertContact(from);

    // ── Primera vez → pedir nombre ────────────────────────────────────────
    if (!contact) {
      await sendWhatsAppMessage(from, "¡Hola! Soy Rita, la asistente de Ridera 🏍️ ¿Cómo te llamas?");
      return { statusCode: 200, body: "asked name" };
    }

    // ── Esperando el nombre → guardarlo ──────────────────────────────────
    if (contact.awaiting_name) {
      const name = sanitizeName(text);
      await setPreferredName(from, name);
      await sendWhatsAppMessage(
        from,
        `¡Un gusto, ${name}! Ya quedaste registrado 🏍️\n\nPuedo ayudarte con talleres, almacenes, motos en venta, rutas, el Pasaporte Ridera 125 y grúas de emergencia.\n\n¿Aceptas recibir info útil de Ridera (eventos, rutas, promos)? Responde *SÍ* o *NO*.\n\n_(Puedes darte de baja escribiendo BAJA en cualquier momento)_`
      );
      return { statusCode: 200, body: "name saved" };
    }

    // ── Respuesta al consentimiento ───────────────────────────────────────
    const nombre = contact.preferred_name || "amigo";
    if (/^\s*(si|sí|yes|ok|dale|claro|vale)\s*$/i.test(text)) {
      if ((await checkConsent(from)) === null) {
        await saveConsent(from, true);
        await sendWhatsAppMessage(from, `¡Perfecto, ${nombre}! Te mantendré al tanto de lo mejor del mundo motero 🛵\n\n¿En qué te puedo ayudar hoy?`);
        return { statusCode: 200, body: "consent accepted" };
      }
    }
    if (/^\s*(no|nel|nop|nah)\s*$/i.test(text)) {
      if ((await checkConsent(from)) === null) {
        await saveConsent(from, false);
        await setOptOut(from, false);
        await sendWhatsAppMessage(from, "Entendido, no te enviaré mensajes masivos. Sigues pudiendo escribirme cuando necesites algo 🙂");
        return { statusCode: 200, body: "consent denied" };
      }
    }

    // ── Baja de broadcasts ────────────────────────────────────────────────
    if (/^\s*(baja|stop|no\s*más|nomás)\s*$/i.test(text)) {
      await setOptOut(from, false);
      await sendWhatsAppMessage(from, "Listo, ya no recibirás avisos masivos. Sigo aquí si necesitas algo 🙂");
      return { statusCode: 200, body: "opted out" };
    }

    // ── Límite diario de mensajes (control de costo) ──────────────────────
    const dailyLimit = parseInt(process.env.RITA_DAILY_MESSAGE_LIMIT || "40", 10);
    const usedToday  = await countMessagesToday(from);
    if (usedToday > dailyLimit) {
      const limitMsg = "Hoy ya hablamos bastante 😅 Tengo un límite diario para cuidar el servicio. ¡Escríbeme mañana!";
      await sendWhatsAppMessage(from, limitMsg);
      await logMessage(from, "user", text, "limit_reached");
      await logMessage(from, "assistant", limitMsg, "limit_reached");
      return { statusCode: 200, body: "limit" };
    }

    // ── Rita responde con tool calling (Vercel AI) ────────────────────────
    await logMessage(from, "user", text, "tool_calling");

    const tier    = getTierConfig();
    const history = await getRecentHistory(from, tier.historyMessages);

    const reply = await askClaude(
      null,           // el system prompt lo construye claude.js con el nombre
      history,
      {
        model:       tier.model,
        maxTokens:   tier.maxTokens,
        userName:    nombre,
        from,        // necesario para la tool reportar_error
      }
    );

    await sendWhatsAppMessage(from, reply);
    await logMessage(from, "assistant", reply, "tool_calling");

    return { statusCode: 200, body: "ok" };

  } catch (err) {
    console.error("Rita error:", err);
    try {
      await sendWhatsAppMessage(from, "Tuve un problema respondiendo 😕 intenta de nuevo en un momento.");
    } catch (_) {}
    return { statusCode: 200, body: "error handled" };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function sanitizeName(rawText) {
  const cleaned = rawText
    .replace(/[^\p{L}\s]/gu, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");
  if (!cleaned) return "amigo";
  return cleaned.toLowerCase().split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
