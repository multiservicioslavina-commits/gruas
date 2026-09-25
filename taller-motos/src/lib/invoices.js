import { badRequest } from './errors.js';

// El codigo de facturacion y el numero de factura son dos cosas distintas.
//
//   codigo  -> QUE documento es: 10 factura de venta, 1030 factura
//              electronica, o los que el taller tenga en su contabilidad.
//              Sale del catalogo `document_types` y se guarda en la factura.
//   numero  -> el consecutivo de ESE documento, con su prefijo si la
//              resolucion de la DIAN lo exige. Cada tipo lleva el suyo, asi
//              que dos documentos distintos pueden ir ambos en el 1.
//
// Hasta la version anterior se devolvian pegados en una sola cadena
// ("10-000123"), lo que hacia imposible ponerlos en columnas separadas o
// buscar por numero. Se separan.

// El numero tal como se imprime. La electronica no lleva el consecutivo
// interno: su numero autorizado lo asigna la DIAN a traves de Factus, y es
// ese el que vale ante la autoridad.
export function invoiceNumber(invoice) {
  if (invoice.kind === 'electronic' && invoice.external_id) return String(invoice.external_id);
  return `${invoice.prefix || ''}${String(invoice.number).padStart(6, '0')}`;
}

// Agrega a la fila los campos que la interfaz muestra, sin tocar los que
// vienen de la base. `document_type_code`/`_name` ya son columnas: se copian
// tal cual porque una factura emitida no cambia de nombre aunque despues se
// renombre el tipo en el catalogo.
export function decorateInvoice(invoice) {
  return { ...invoice, doc_number: invoiceNumber(invoice) };
}

// Etiqueta corta de una sola linea, para un toast o un renglon de lista
// donde no caben dos columnas. Sigue siendo codigo y numero, sin fundirlos:
// "1030 · FE-4521".
export function invoiceLabel(invoice) {
  return [invoice.document_type_code, invoiceNumber(invoice)].filter(Boolean).join(' · ');
}

// Busca el tipo de documento que pidió el cajero y comprueba que sirva para
// lo que va a hacer. `debeIrALaDian` es lo que decide la ruta (normal vs
// electrónica), no el cliente: si el código elegido no coincide con eso, es
// un error del operario que conviene decir con todas las letras en vez de
// facturar por el camino equivocado.
export async function pickDocumentType(client, workshopId, code, debeIrALaDian) {
  const { rows } = await client.query(
    `SELECT * FROM document_types
     WHERE workshop_id = $1 AND active = TRUE AND sends_to_dian = $2
     ORDER BY sort_order, code`,
    [workshopId, debeIrALaDian]);

  if (!rows.length) {
    throw badRequest(debeIrALaDian
      ? 'No hay ningún tipo de documento electrónico configurado. Agrégalo en Ajustes → Facturación.'
      : 'No hay ningún tipo de documento de venta configurado. Agrégalo en Ajustes → Facturación.');
  }
  if (!code) return rows[0];

  const elegido = rows.find((t) => t.code === String(code));
  if (elegido) return elegido;

  // Existe, pero es del otro tipo: el mensaje tiene que decir por qué, o el
  // operario vuelve a elegir el mismo código pensando que se equivocó de tecla.
  const { rows: [otro] } = await client.query(
    'SELECT * FROM document_types WHERE workshop_id = $1 AND code = $2', [workshopId, String(code)]);
  if (otro) {
    throw badRequest(otro.sends_to_dian
      ? `El código ${otro.code} (${otro.name}) es de facturación electrónica: se emite con "Facturar electrónicamente".`
      : `El código ${otro.code} (${otro.name}) no va a la DIAN: se emite con "Factura de venta".`);
  }
  throw badRequest(`El código de facturación ${code} no existe en este taller. Revísalo en Ajustes → Facturación.`);
}

// ── Reserva contra la doble factura ante la DIAN ──────────────────────────
//
// La llamada a Factus es irreversible: cuando vuelve, el documento ya existe
// ante la DIAN y deshacerlo requiere una nota crédito. Comprobar "¿ya está
// facturada?" con una lectura antes de llamar no sirve: dos peticiones
// simultáneas leen las dos que no hay fila, las dos llaman a Factus, y
// quedan dos documentos reales.
//
// Así que se reserva la fila ANTES de llamar, en estado 'draft'. El índice
// único parcial (que ahora cubre draft e issued) hace que de dos clics
// simultáneos sólo uno consiga la reserva; el otro choca aquí, sin haber
// tocado la DIAN.
export async function reservarFactura(client, { workshopId, workOrderId, saleId, tipo, number, totales }) {
  const { rows: [row] } = await client.query(
    `INSERT INTO invoices (workshop_id, work_order_id, sale_id, number, kind, status,
                           subtotal, tax_total, total,
                           document_type_code, document_type_name, prefix)
     VALUES ($1,$2,$3,$4,'electronic','draft',$5,$6,$7,$8,$9,$10) RETURNING *`,
    [workshopId, workOrderId || null, saleId || null, number,
     totales.subtotal, totales.tax_total, totales.total,
     tipo.code, tipo.name, tipo.prefix]
  );
  return row;
}

// Postgres devuelve 23505 para cualquier índice único, y en esta tabla hay
// dos con significados muy distintos:
//
//   invoices_wo_activa_key / invoices_sale_activa_key
//       ya hay una factura o una reserva para esta orden o venta
//       -> "alguien se te adelantó", que es lo que esta función detecta
//
//   invoices_type_number_key
//       el consecutivo de ese tipo de documento ya está usado
//       -> eso NO es una carrera, es que la numeración quedó descuadrada,
//          y merece tratarse como el error que es en vez de decirle al
//          cajero que espere unos segundos
const INDICES_DE_RESERVA = ['invoices_wo_activa_key', 'invoices_sale_activa_key'];

export const esChoqueDeReserva = (err) =>
  err?.code === '23505' && INDICES_DE_RESERVA.includes(err?.constraint);
