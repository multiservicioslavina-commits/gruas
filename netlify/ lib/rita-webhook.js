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
