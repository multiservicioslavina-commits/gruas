// Notificaciones al cliente por WhatsApp (plan pago).
//
// Cada taller elige en Ajustes si usa la cuenta compartida de Ridera o su
// propia cuenta de WhatsApp Business ('own'). Si no configuró ninguna
// ('off', o faltan credenciales), estas funciones simplemente no envían
// nada: un fallo o falta de configuración de WhatsApp nunca debe romper el
// flujo de la orden.
import { config } from '../config.js';

// Nombre y cantidad de variables de cada plantilla, tal como se aprobaron
// en Meta (ver docs/CODIGOS.md... y el hilo de configuración inicial).
const TEMPLATES = {
  moto_recibida:        3,
  cotizacion_pendiente: 4,
  moto_lista:           3
};

function credentialsFor(workshop) {
  if (workshop.whatsapp_mode === 'own') {
    if (!workshop.whatsapp_phone_number_id || !workshop.whatsapp_access_token) return null;
    return {
      phoneNumberId: workshop.whatsapp_phone_number_id,
      accessToken:   workshop.whatsapp_access_token
    };
  }
  if (workshop.whatsapp_mode === 'ridera') {
    const { phoneNumberId, accessToken } = config.whatsapp.ridera;
    if (!phoneNumberId || !accessToken) return null;
    return { phoneNumberId, accessToken };
  }
  return null;
}

// La API exige sólo dígitos con indicativo de país. Los teléfonos locales
// (10 dígitos) se asumen de Colombia.
function formatPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.length === 10 ? `57${digits}` : digits;
}

function formatMoney(amount, currency) {
  return Number(amount || 0).toLocaleString('es-CO', {
    style: 'currency', currency: currency || 'COP', maximumFractionDigits: 0
  });
}

// Envía una plantilla aprobada. No lanza: si algo falla, sólo lo deja
// registrado y devuelve { sent: false }, para que quien llame no tenga que
// envolver cada aviso en try/catch.
export async function sendTemplate(workshop, template, to, params) {
  const paramCount = TEMPLATES[template];
  if (!paramCount) throw new Error(`Plantilla de WhatsApp desconocida: ${template}`);

  const creds = credentialsFor(workshop);
  const phone = formatPhone(to);
  if (!creds || !phone) return { sent: false, reason: !creds ? 'sin_configurar' : 'sin_telefono' };

  const body = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: template,
      language: { code: 'es' },
      components: [{
        type: 'body',
        parameters: params.map((text) => ({ type: 'text', text: String(text) }))
      }]
    }
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${config.whatsapp.apiVersion}/${creds.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.accessToken}` },
        body: JSON.stringify(body)
      });
    if (!res.ok) {
      console.error('WhatsApp: el envío falló', res.status, await res.text());
      return { sent: false, reason: 'error_api' };
    }
    return { sent: true };
  } catch (err) {
    console.error('WhatsApp: no se pudo contactar la API', err.message);
    return { sent: false, reason: 'error_red' };
  }
}

function motoLabel(order) {
  return [order.motorcycle?.brand, order.motorcycle?.model].filter(Boolean).join(' ')
    || `orden #${order.number}`;
}

export function notifyMotoRecibida(workshop, order) {
  if (!order.customer?.phone) return;
  const link = `${config.publicUrl}/orden/${order.public_code}`;
  return sendTemplate(workshop, 'moto_recibida', order.customer.phone,
    [order.customer.name || 'cliente', motoLabel(order), link]);
}

export function notifyMotoLista(workshop, order) {
  if (!order.customer?.phone) return;
  return sendTemplate(workshop, 'moto_lista', order.customer.phone,
    [order.customer.name || 'cliente', motoLabel(order), formatMoney(order.total, workshop.currency)]);
}

export function notifyCotizacionPendiente(workshop, { customerName, customerPhone, moto, total, url }) {
  if (!customerPhone) return;
  return sendTemplate(workshop, 'cotizacion_pendiente', customerPhone,
    [customerName || 'cliente', moto, formatMoney(total, workshop.currency), url]);
}
