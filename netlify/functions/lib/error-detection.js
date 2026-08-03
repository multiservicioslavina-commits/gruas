// lib/error-detection.js
//
// Detecta cuando un usuario reporta un error/información incorrecta en Rita
// y lo registra como ALERTA para el admin
//

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Palabras clave que indican un error/corrección
const ERROR_KEYWORDS = [
  "está mal",
  "eso está mal",
  "eso no es correcto",
  "eso no es",
  "información incorrecta",
  "info incorrecta",
  "datos mal",
  "teléfono mal",
  "número mal",
  "ubicación mal",
  "dirección mal",
  "horario mal",
  "ese no es",
  "eso no",
  "corrige",
  "corrígeme",
  "error en",
  "equivocada",
  "equivocado",
  "no es así",
  "falta actualizar",
  "desactualizado",
];

// Detectar si el mensaje contiene un reporte de error
function detectsError(text) {
  const lowerText = text.toLowerCase();
  return ERROR_KEYWORDS.some((keyword) => lowerText.includes(keyword));
}

// Registrar el error como ALERTA CRÍTICA para el admin
async function logErrorAlert(contactId, whatsappNumber, userMessage, context = {}) {
  try {
    const { data, error } = await supabase
      .from("rita_errores_reportados")
      .insert({
        contact_id: contactId || null,
        whatsapp_number: whatsappNumber,
        tipo_error: "reporte_usuario",
        descripcion: userMessage,
        estado: "pendiente_revision",
        prioridad: 1, // CRÍTICA - requiere revisión inmediata
        contexto: context,
        created_at: new Date(),
      })
      .select();

    if (error) {
      console.error("Error logging alert:", error);
      return null;
    }

    // TODO: Enviar notificación al admin
    // await notifyAdmin({
    //   titulo: "⚠️ ALERTA: Error reportado por usuario",
    //   numero: whatsappNumber,
    //   mensaje: userMessage,
    //   prioridad: "ALTA"
    // });

    return data?.[0];
  } catch (err) {
    console.error("Error en logErrorAlert:", err);
    return null;
  }
}

// Respuesta automática cuando alguien reporta un error
function getErrorAcknowledgmentResponse(userName) {
  const responses = [
    `Gracias por avisar${userName ? `, ${userName}` : ""}. Acabo de registrar tu reporte y lo revisaremos de inmediato. Tu ayuda nos hace mejores 🙏`,
    `Entendido${userName ? `, ${userName}` : ""}. He guardado tu corrección y nuestro equipo lo verificará enseguida. ¡Apreciamos tu atención al detalle!`,
    `Anotado${userName ? `, ${userName}` : ""}. Los admins serán notificados para hacer la corrección. ¡Gracias por mantener nuestro directorio actualizado!`,
  ];

  return responses[Math.floor(Math.random() * responses.length)];
}

module.exports = {
  detectsError,
  logErrorAlert,
  getErrorAcknowledgmentResponse,
};
