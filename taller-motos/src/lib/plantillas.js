// Plantillas de correo. HTML plano y en línea, sin hoja de estilos externa
// ni imágenes remotas salvo el logo: los clientes de correo descartan casi
// todo lo demás, y la mitad de la gente lo va a abrir en el teléfono.
import { config } from '../config.js';

const ESTADOS = {
  scheduled: 'Programada', received: 'Recibida', diagnosing: 'En diagnóstico',
  quoted: 'Cotizada', pending_approval: 'Esperando al cliente', approved: 'Aprobada',
  repairing: 'En reparación', waiting_parts: 'Esperando repuesto',
  quality_check: 'Control de calidad', ready: 'Lista para entregar',
  delivered: 'Entregada', closed: 'Cerrada', cancelled: 'Anulada'
};

export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function dinero(monto, moneda) {
  return Number(monto || 0).toLocaleString('es-CO', {
    style: 'currency', currency: moneda || 'COP', maximumFractionDigits: 0
  });
}

function fecha(valor) {
  if (!valor) return '';
  return new Date(valor).toLocaleDateString('es-CO', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

function filas(lineas, moneda) {
  if (!lineas.length) return '';
  return lineas.map((l) => `
    <tr>
      <td style="padding:7px 0;border-bottom:1px solid #eee">${esc(l.description)}</td>
      <td style="padding:7px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${Number(l.quantity)}</td>
      <td style="padding:7px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${dinero(l.total ?? Number(l.quantity) * Number(l.unit_price), moneda)}</td>
    </tr>`).join('');
}

// La orden de servicio tal como la recibe el cliente: qué se le hizo a la
// moto, cuánto costó, y el enlace de seguimiento que ya existía. No lleva
// nada que el cliente no deba ver (costos internos, notas del mecánico).
export function ordenDeServicioHtml(workshop, order) {
  const moneda = workshop.currency;
  const servicios = (order.services || []).filter((s) => s.approved !== false);
  const repuestos = (order.parts || []).filter((p) => p.approved !== false);
  const enlace = `${config.publicUrl}/orden/${order.public_code}`;
  const moto = [order.motorcycle?.brand, order.motorcycle?.model].filter(Boolean).join(' ');

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5">
<div style="max-width:620px;margin:0 auto;padding:24px 16px;
            font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2024">

  <div style="background:#fff;border-radius:12px;padding:24px">

    <div style="border-bottom:2px solid #1f2024;padding-bottom:14px;margin-bottom:18px">
      <div style="font-size:19px;font-weight:700">${esc(workshop.legal_name || workshop.name)}</div>
      ${workshop.tax_id ? `<div style="font-size:13px;color:#666">NIT ${esc(workshop.tax_id)}</div>` : ''}
      <div style="font-size:13px;color:#666">
        ${[workshop.address, workshop.city].filter(Boolean).map(esc).join(', ')}
        ${workshop.phone ? ` · Tel. ${esc(workshop.phone)}` : ''}
      </div>
    </div>

    <h1 style="font-size:17px;margin:0 0 4px">Orden de servicio #${esc(order.number)}</h1>
    <p style="margin:0 0 18px;color:#666;font-size:14px">
      ${esc(ESTADOS[order.status] || order.status)}
      ${order.delivered_at ? ` · entregada el ${esc(fecha(order.delivered_at))}` : ''}
    </p>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:18px">
      <tr><td style="padding:3px 0;color:#666;width:120px">Cliente</td>
          <td style="padding:3px 0">${esc(order.customer?.name || '')}</td></tr>
      <tr><td style="padding:3px 0;color:#666">Moto</td>
          <td style="padding:3px 0">${esc(order.motorcycle?.plate || 'Sin placa')}${moto ? ` · ${esc(moto)}` : ''}</td></tr>
      <tr><td style="padding:3px 0;color:#666">Ingresó</td>
          <td style="padding:3px 0">${esc(fecha(order.received_at))}</td></tr>
      ${order.complaint ? `<tr><td style="padding:3px 0;color:#666;vertical-align:top">Motivo</td>
          <td style="padding:3px 0">${esc(order.complaint)}</td></tr>` : ''}
    </table>

    ${servicios.length ? `
    <div style="font-size:12px;text-transform:uppercase;color:#666;font-weight:600;margin-bottom:6px">Mano de obra</div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">
      ${filas(servicios, moneda)}
    </table>` : ''}

    ${repuestos.length ? `
    <div style="font-size:12px;text-transform:uppercase;color:#666;font-weight:600;margin-bottom:6px">Repuestos</div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">
      ${filas(repuestos, moneda)}
    </table>` : ''}

    <table style="width:100%;max-width:280px;margin-left:auto;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:3px 0;color:#666">Subtotal</td>
          <td style="padding:3px 0;text-align:right">${dinero(Number(order.labor_total) + Number(order.parts_total), moneda)}</td></tr>
      ${Number(order.discount) ? `<tr><td style="padding:3px 0;color:#666">Descuento</td>
          <td style="padding:3px 0;text-align:right">-${dinero(order.discount, moneda)}</td></tr>` : ''}
      ${Number(order.tax_total) ? `<tr><td style="padding:3px 0;color:#666">IVA</td>
          <td style="padding:3px 0;text-align:right">${dinero(order.tax_total, moneda)}</td></tr>` : ''}
      <tr><td style="padding:8px 0 0;font-weight:700;border-top:2px solid #1f2024">Total</td>
          <td style="padding:8px 0 0;text-align:right;font-weight:700;border-top:2px solid #1f2024">${dinero(order.total, moneda)}</td></tr>
    </table>

    <div style="margin-top:24px;text-align:center">
      <a href="${esc(enlace)}"
         style="display:inline-block;background:#1f2024;color:#fff;text-decoration:none;
                padding:11px 22px;border-radius:8px;font-size:14px;font-weight:600">
        Ver el detalle de la orden</a>
      <div style="font-size:12px;color:#888;margin-top:10px">${esc(enlace)}</div>
    </div>

  </div>

  <p style="text-align:center;font-size:12px;color:#888;margin-top:16px">
    Este correo lo envía ${esc(workshop.name)}. Si tienes dudas, responde a este mensaje
    ${workshop.phone ? `o escríbenos al ${esc(workshop.phone)}` : ''}.
  </p>

</div></body></html>`;
}

// El texto para WhatsApp. Aquí no hay HTML que valga: es un mensaje que se
// lee en una burbuja, así que va corto y con el enlace al final.
export function ordenDeServicioTexto(workshop, order) {
  const moto = [order.motorcycle?.plate, order.motorcycle?.brand, order.motorcycle?.model]
    .filter(Boolean).join(' ');
  return [
    `Hola ${(order.customer?.name || '').split(' ')[0] || ''}`.trim() + ',',
    `Aquí está la orden de servicio #${order.number} de ${workshop.name}.`,
    '',
    `Moto: ${moto || 'sin placa'}`,
    `Total: ${dinero(order.total, workshop.currency)}`,
    '',
    `Puedes verla completa aquí: ${config.publicUrl}/orden/${order.public_code}`,
    '',
    'Gracias por confiarnos tu moto.'
  ].join('\n');
}
