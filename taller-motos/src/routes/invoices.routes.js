// Facturación de una orden o de una venta de mostrador, de dos maneras:
// factura de venta normal (todos los planes, sin la DIAN) o factura
// electrónica (plan Premium, vía Factus; sólo para órdenes por ahora).
//
// Ninguna duplica la lógica de órdenes/ventas: arman la factura a partir de
// lo que ya hay cargado (servicios, repuestos, total). La electrónica
// además pide lo que la DIAN exige y no vive en el modelo del taller — el
// tipo/número de documento del cliente, su municipio, cómo pagó.
// `requirePlan(...)` va en cada ruta, no en el router entero: este archivo
// se monta en '/api' junto a otros que no son de pago (ver src/app.js).
import { Router } from 'express';
import { queryOne, transaction, nextSequence } from '../db.js';
import { validate, assertUuid } from '../lib/validate.js';
import { wrap, notFound, badRequest, conflict } from '../lib/errors.js';
import { requirePlan, requireRole } from '../middleware/auth.js';
import { loadFullWorkOrder } from '../services/workorders.js';
import { loadFullSale } from './sales.routes.js';
import { createBill, downloadPdf, credentialsFor } from '../lib/factus.js';
import { docCode } from '../lib/invoices.js';

export const invoicesRouter = Router();

// Una orden o una venta sólo se factura una vez, sea normal o electrónica:
// compartido entre las rutas de creación. Filtra por workshop_id porque el
// id llega del cliente antes de comprobar a quién pertenece — sin el
// filtro, un taller podía asomarse al código de la factura de otro con
// sólo adivinar un UUID ajeno.
async function assertSinFacturar(workshopId, { workOrderId, saleId }) {
  const columna = workOrderId ? 'work_order_id' : 'sale_id';
  const valor = workOrderId || saleId;
  const yaFacturada = await queryOne(
    `SELECT id, kind, number, external_id FROM invoices
     WHERE ${columna} = $1 AND workshop_id = $2 AND status = 'issued'`,
    [valor, workshopId]);
  if (!yaFacturada) return;
  throw conflict(`Esta ${workOrderId ? 'orden' : 'venta'} ya tiene una factura (${docCode(yaFacturada)}). ` +
    (yaFacturada.kind === 'electronic'
      ? 'Para corregirla hace falta una nota crédito, directamente en el panel de Factus.'
      : 'Para corregirla, contacta a quien te entregó el software.'));
}

invoicesRouter.post('/work-orders/:id/invoice-normal', requirePlan('basico'), requireRole('cashier'), wrap(async (req, res) => {
  assertUuid(req.params.id);
  const data = validate(req.body, { observation: { type: 'string', max: 500 } });

  await assertSinFacturar(req.auth.workshopId, { workOrderId: req.params.id });

  const order = await transaction((client) => loadFullWorkOrder(client, req.auth.workshopId, req.params.id));
  const lines = [
    ...order.services.filter((s) => s.approved !== false),
    ...order.parts.filter((p) => p.approved !== false)
  ];
  if (!lines.length) throw badRequest('Esta orden no tiene mano de obra ni repuestos que facturar');

  const subtotal = Number(order.labor_total) + Number(order.parts_total) - Number(order.discount);
  const invoice = await transaction(async (client) => {
    const num = await nextSequence(client, req.auth.workshopId, 'invoices');
    const { rows: [row] } = await client.query(
      `INSERT INTO invoices (workshop_id, work_order_id, number, kind, status, subtotal, tax_total, total,
                              issued_at, payload)
       VALUES ($1,$2,$3,'normal','issued',$4,$5,$6,NOW(),$7) RETURNING *`,
      [req.auth.workshopId, order.id, num, subtotal, order.tax_total, order.total,
       JSON.stringify({ observation: data.observation || null })]
    );
    return row;
  });

  res.status(201).json({ ...invoice, doc_code: docCode(invoice) });
}));

// Misma idea, para una venta de mostrador: ya está cobrada y con todos sus
// totales calculados al crearla, así que aquí no hay nada que recomputar.
invoicesRouter.post('/sales/:id/invoice-normal', requirePlan('basico'), requireRole('cashier'), wrap(async (req, res) => {
  assertUuid(req.params.id);
  const data = validate(req.body, { observation: { type: 'string', max: 500 } });

  await assertSinFacturar(req.auth.workshopId, { saleId: req.params.id });

  const sale = await transaction((client) => loadFullSale(client, req.auth.workshopId, req.params.id));
  if (!sale.items.length) throw badRequest('Esta venta no tiene ítems que facturar');

  const invoice = await transaction(async (client) => {
    const num = await nextSequence(client, req.auth.workshopId, 'invoices');
    const { rows: [row] } = await client.query(
      `INSERT INTO invoices (workshop_id, sale_id, number, kind, status, subtotal, tax_total, total,
                              issued_at, payload)
       VALUES ($1,$2,$3,'normal','issued',$4,$5,$6,NOW(),$7) RETURNING *`,
      [req.auth.workshopId, sale.id, num, sale.subtotal, sale.tax_total, sale.total,
       JSON.stringify({ observation: data.observation || null })]
    );
    return row;
  });

  res.status(201).json({ ...invoice, doc_code: docCode(invoice) });
}));

// Únicos que Factus/la DIAN piden y que el taller no tiene ya guardados en
// otra parte: el resto (items, total, IVA) sale de la orden.
const CUSTOMER_SCHEMA = {
  identification_document_code: { type: 'string', required: true, max: 4 },
  identification:                { type: 'string', required: true, max: 20 },
  dv:                             { type: 'string', max: 2 },
  legal_organization_code:       { type: 'string', required: true, enum: ['1', '2'] },
  names:                          { type: 'string', max: 200 },
  address:                        { type: 'string', max: 200 },
  email:                          { type: 'string', max: 160 },
  phone:                          { type: 'string', max: 40 },
  municipality_code:              { type: 'string', required: true, max: 6 },
  tribute_code:                   { type: 'string', enum: ['01', 'ZZ'], default: 'ZZ' },
  payment_method_code:            { type: 'string', required: true, max: 4 },
  observation:                    { type: 'string', max: 500 }
};

invoicesRouter.post('/work-orders/:id/invoice', requirePlan('premium'), requireRole('cashier'), wrap(async (req, res) => {
  assertUuid(req.params.id);
  const data = validate(req.body, CUSTOMER_SCHEMA);

  const workshop = await queryOne('SELECT * FROM workshops WHERE id = $1', [req.auth.workshopId]);
  // Mismo orden en que el taller lo resuelve: primero conectar la cuenta,
  // después elegir con qué resolución factura.
  if (!credentialsFor(workshop)) {
    throw badRequest('Este taller no tiene configurada su cuenta de Factus. Configúrala en Ajustes → Facturación electrónica.');
  }
  if (!workshop.factus_numbering_range_id) {
    throw badRequest('Configura primero tu rango de numeración de Factus, en Ajustes → Facturación electrónica.');
  }

  // Una orden ya facturada no se vuelve a facturar: un doble clic o un
  // reintento no debe generar dos documentos oficiales ante la DIAN, que no
  // se pueden deshacer desde aquí (haría falta una nota crédito en Factus).
  await assertSinFacturar(req.auth.workshopId, { workOrderId: req.params.id });

  const order = await transaction((client) => loadFullWorkOrder(client, req.auth.workshopId, req.params.id));

  const lines = [
    ...order.services.filter((s) => s.approved !== false),
    ...order.parts.filter((p) => p.approved !== false)
  ];
  if (!lines.length) throw badRequest('Esta orden no tiene mano de obra ni repuestos que facturar');

  // El descuento de la orden es un monto global, pero Factus lo pide por
  // ítem (discount_rate, en %): se reparte proporcionalmente para que la
  // suma de los ítems ya descontados coincida con lo que de verdad se cobró
  // (payment_details.amount = order.total). Sin esto, cualquier orden con
  // descuento facturaba de más y la DIAN podía rechazarla.
  const bruto = Number(order.labor_total) + Number(order.parts_total);
  const discountRate = bruto > 0 ? Math.min(100, (Number(order.discount) / bruto) * 100) : 0;

  const items = lines.map((line, index) => ({
    code_reference: `ITEM-${index + 1}`,
    name: line.description,
    quantity: Number(line.quantity),
    price: Number(line.unit_price),
    discount_rate: discountRate,
    unit_measure_code: '94', // "Unidad" (UN/CEFACT rec. 20): sirve para mano de obra y repuestos por igual.
    standard_code: '999',    // Sin catálogo estándar (UNSPSC/GTIN): el taller no clasifica así sus ítems.
    taxes: [{ code: '01', rate: String(order.tax_rate || 0) }]
  }));

  const referenceCode = `${order.public_code}-${Date.now()}`;
  const billInput = {
    reference_code: referenceCode,
    numbering_range_id: workshop.factus_numbering_range_id,
    observation: data.observation || undefined,
    payment_details: [{
      payment_form: order.payment_status === 'paid' ? '1' : '2',
      payment_method_code: data.payment_method_code,
      amount: String(order.total)
    }],
    customer: {
      identification_document_code: data.identification_document_code,
      identification: data.identification,
      dv: data.dv || undefined,
      legal_organization_code: data.legal_organization_code,
      names: data.names || order.customer?.name || undefined,
      address: data.address || order.customer?.address || undefined,
      email: data.email || order.customer?.email || undefined,
      phone: data.phone || order.customer?.phone || undefined,
      municipality_code: data.municipality_code,
      tribute_code: data.tribute_code
    },
    items
  };

  const result = await createBill(workshop, billInput);
  const bill = result.data;

  const subtotal = Number(order.labor_total) + Number(order.parts_total) - Number(order.discount);
  const invoice = await transaction(async (client) => {
    const num = await nextSequence(client, req.auth.workshopId, 'invoices');
    const { rows: [row] } = await client.query(
      `INSERT INTO invoices (workshop_id, work_order_id, number, status, subtotal, tax_total, total,
                              issued_at, external_id, reference_code, cufe, payload)
       VALUES ($1,$2,$3,'issued',$4,$5,$6,NOW(),$7,$8,$9,$10) RETURNING *`,
      [req.auth.workshopId, order.id, num, subtotal, order.tax_total, order.total,
       bill.number, referenceCode, bill.cufe || null, JSON.stringify(bill)]
    );
    return row;
  });

  res.status(201).json(invoice);
}));

invoicesRouter.get('/invoices/:id/pdf', requirePlan('premium'), wrap(async (req, res) => {
  assertUuid(req.params.id);
  const invoice = await queryOne(
    'SELECT * FROM invoices WHERE id = $1 AND workshop_id = $2', [req.params.id, req.auth.workshopId]);
  if (!invoice) throw notFound();

  const workshop = await queryOne('SELECT * FROM workshops WHERE id = $1', [req.auth.workshopId]);
  const result = await downloadPdf(workshop, invoice.external_id);
  const buffer = Buffer.from(result.data.pdf_base_64_encoded, 'base64');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `attachment; filename="${result.data.file_name || `factura-${invoice.external_id}.pdf`}"`);
  res.send(buffer);
}));
