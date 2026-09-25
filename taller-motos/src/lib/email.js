// Correo saliente, vía Resend.
//
// A diferencia de WhatsApp —que avisa solo, en segundo plano, y por eso
// falla en silencio a propósito— el correo de aquí lo dispara una persona
// que acaba de pulsar "Enviar" y se queda mirando la pantalla. Si no sale,
// tiene que enterarse: un envío que falla callado es peor que no tener el
// botón, porque el taller cree que el cliente ya recibió su orden.
//
// Por eso estas funciones SÍ lanzan.
import { config } from '../config.js';
import { badRequest, ApiError } from './errors.js';

export function emailConfigurado() {
  return Boolean(config.email.apiKey);
}

export async function enviarCorreo({ to, subject, html, replyTo }) {
  if (!emailConfigurado()) {
    throw badRequest('Este sistema todavía no tiene configurado el envío de correos. ' +
      'Contacta a quien te entregó el software para activarlo, o envíale la orden al cliente por WhatsApp.');
  }
  if (!to) throw badRequest('No hay a qué correo enviarlo.');

  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.email.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: config.email.from,
        to: [to],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {})
      })
    });
  } catch (err) {
    throw new ApiError(502, `No se pudo contactar el servicio de correo: ${err.message}`);
  }

  if (!res.ok) {
    // El cuerpo de Resend trae el motivo real (dominio sin verificar, correo
    // mal formado...). Vale más repetirlo que un "error al enviar" a secas.
    const detalle = await res.text().catch(() => '');
    console.error('Resend: el envío falló', res.status, detalle);
    throw new ApiError(502, `El correo no se pudo enviar (${res.status}). ${detalle.slice(0, 200)}`);
  }

  return { sent: true };
}
