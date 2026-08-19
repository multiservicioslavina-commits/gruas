// lib/whatsapp.js
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GRAPH_VERSION = "v19.0";

async function sendWhatsAppMessage(to, text) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp send falló (${res.status}): ${errText}`);
  }

  return res.json();
}

// Envía un mensaje usando una PLANTILLA pre-aprobada por Meta. Es obligatorio
// usar plantillas (no texto libre) para mensajes que Ridera inicia hacia
// alguien que no le ha escrito a Rita en las últimas 24 horas -> esto es
// lo que se usa para broadcasts.
// bodyParams: array de strings que llenan las {{1}}, {{2}}... de la plantilla.
async function sendTemplateMessage(to, templateName, languageCode, bodyParams = []) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const components = bodyParams.length
    ? [
        {
          type: "body",
          parameters: bodyParams.map((text) => ({ type: "text", text })),
        },
      ]
    : [];

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp template send falló (${res.status}): ${errText}`);
  }

  return res.json();
}

// Extrae el primer mensaje de texto entrante de un payload del webhook de Meta.
// Devuelve null si es un evento que no nos interesa (status update, etc.)
function extractIncomingMessage(body) {
  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return null; // ej: delivery/read status, no un mensaje nuevo

    if (message.type !== "text") {
      return {
        from: message.from,
        text: null,
        unsupportedType: message.type,
      };
    }

    return {
      from: message.from,
      text: message.text.body,
      unsupportedType: null,
    };
  } catch (err) {
    return null;
  }
}

module.exports = { sendWhatsAppMessage, sendTemplateMessage, extractIncomingMessage };
