// Cotización y aprobación digital del cliente (spec §8).
//
// La cotización se arma desde las líneas de la orden. El cliente la abre con
// un enlace firmado, aprueba o rechaza, y esa decisión queda registrada de
// forma inmutable en `approvals`. Los trabajos que no autorizó quedan sin
// aprobar: no se cobran ni descuentan inventario.
import { Router } from 'express';
import { query, queryOne, transaction, nextSequence } from '../db.js';
import { validate, assertUuid } from '../lib/validate.js';
import { wrap, notFound, badRequest, conflict } from '../lib/errors.js';
import { publicToken } from '../lib/ids.js';
import { computeTotals } from '../lib/money.js';
import { config } from '../config.js';
import {
  getWorkOrder, recalcWorkOrder, changeStatus, syncPartStock, STATUS_FLOW
} from '../services/workorders.js';

export const quotesRouter = Router();

async function recalcQuote(client, quoteId) {
  const { rows: [sums] } = await client.query(
    `SELECT COALESCE(SUM(quantity * unit_price), 0) AS subtotal
     FROM quote_items WHERE quote_id = $1 AND (approved IS NULL OR approved)`,
    [quoteId]);
  const { rows: [quote] } = await client.query(
    'SELECT discount, tax_rate FROM quotes WHERE id = $1', [quoteId]);

  const totals = computeTotals({
    laborTotal: sums.subtotal, partsTotal: 0,
    discount: quote.discount, taxRate: quote.tax_rate
  });
  const { rows } = await client.query(
    `UPDATE quotes SET subtotal = $1, tax_total = $2, total = $3, updated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [totals.subtotal, totals.tax_total, totals.total, quoteId]);
  return rows[0];
}

async function loadQuote(client, workshopId, id) {
  const { rows } = await client.query(
    'SELECT * FROM quotes WHERE id = $1 AND workshop_id = $2', [id, workshopId]);
  if (!rows[0]) throw notFound('Cotización no encontrada');
  const { rows: items } = await client.query(
    'SELECT * FROM quote_items WHERE quote_id = $1 ORDER BY created_at', [id]);
  const { rows: approvals } = await client.query(
    'SELECT * FROM approvals WHERE quote_id = $1 ORDER BY decided_at DESC', [id]);
  return {
    ...rows[0],
    items,
    approvals,
    public_url: `${config.publicUrl}/aprobar/${rows[0].public_token}`
  };
}

// Crear una cotización con las líneas actuales de la orden.
quotesRouter.post('/work-orders/:id/quotes', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const data = validate(req.body, {
    discount:    { type: 'number', min: 0, default: 0 },
    valid_until: { type: 'string', max: 20 },
    notes:       { type: 'string', max: 2000 },
    // Marca como opcionales los trabajos que el cliente puede rechazar suelto.
    optional_only_unapproved: { type: 'boolean', default: true }
  });

  const quote = await transaction(async (client) => {
    const wo = await getWorkOrder(client, req.auth.workshopId, req.params.id);
    if (['closed', 'cancelled'].includes(wo.status)) {
      throw conflict('La orden ya está cerrada: no se puede cotizar');
    }

    const { rows: services } = await client.query(
      'SELECT * FROM work_order_services WHERE work_order_id = $1 ORDER BY created_at', [wo.id]);
    const { rows: parts } = await client.query(
      'SELECT * FROM work_order_parts WHERE work_order_id = $1 ORDER BY created_at', [wo.id]);
    if (!services.length && !parts.length) {
      throw badRequest('Carga primero los trabajos y repuestos que vas a cotizar');
    }

    const number = await nextSequence(client, req.auth.workshopId, 'quote');
    const { rows: [created] } = await client.query(
      `INSERT INTO quotes (workshop_id, work_order_id, number, public_token, status,
                           discount, tax_rate, valid_until, notes, created_by)
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9) RETURNING *`,
      [req.auth.workshopId, wo.id, number, publicToken(), data.discount, wo.tax_rate,
       data.valid_until || null, data.notes || null, req.auth.userId]);

    for (const s of services) {
      await client.query(
        `INSERT INTO quote_items (quote_id, kind, service_id, description, quantity,
                                  unit_price, optional, work_order_service_id)
         VALUES ($1,'service',$2,$3,$4,$5,$6,$7)`,
        [created.id, s.service_id, s.description, s.quantity, s.unit_price,
         data.optional_only_unapproved ? !s.approved : false, s.id]);
    }
    for (const p of parts) {
      await client.query(
        `INSERT INTO quote_items (quote_id, kind, part_id, description, quantity,
                                  unit_price, optional, work_order_part_id)
         VALUES ($1,'part',$2,$3,$4,$5,$6,$7)`,
        [created.id, p.part_id, p.description, p.quantity, p.unit_price,
         data.optional_only_unapproved ? !p.approved : false, p.id]);
    }

    await recalcQuote(client, created.id);
    return loadQuote(client, req.auth.workshopId, created.id);
  });

  res.status(201).json(quote);
}));

quotesRouter.get('/quotes/:id', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const quote = await transaction((c) => loadQuote(c, req.auth.workshopId, req.params.id));
  res.json(quote);
}));

// Enviar al cliente: deja la orden esperando su respuesta.
quotesRouter.post('/quotes/:id/send', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const quote = await transaction(async (client) => {
    const current = await loadQuote(client, req.auth.workshopId, req.params.id);
    if (['approved', 'rejected'].includes(current.status)) {
      throw conflict('El cliente ya respondió esta cotización');
    }
    await client.query(
      `UPDATE quotes SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [current.id]);

    const wo = await getWorkOrder(client, req.auth.workshopId, current.work_order_id);
    if (!['pending_approval', 'approved'].includes(wo.status)) {
      const step = wo.status === 'quoted' ? 'pending_approval' : 'quoted';
      await changeStatus(client, {
        workshopId: req.auth.workshopId, workOrderId: wo.id, status: step,
        note: `Cotización #${current.number} enviada`, userId: req.auth.userId });
      if (step === 'quoted') {
        await changeStatus(client, {
          workshopId: req.auth.workshopId, workOrderId: wo.id, status: 'pending_approval',
          note: 'Esperando aprobación del cliente', userId: req.auth.userId });
      }
    }
    return loadQuote(client, req.auth.workshopId, current.id);
  });
  res.json(quote);
}));

quotesRouter.patch('/quotes/:id', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const data = validate(req.body, {
    discount:    { type: 'number', min: 0 },
    valid_until: { type: 'string', max: 20 },
    notes:       { type: 'string', max: 2000 }
  });
  const keys = Object.keys(data);
  if (!keys.length) throw badRequest('No enviaste ningún campo para actualizar');

  const quote = await transaction(async (client) => {
    const current = await loadQuote(client, req.auth.workshopId, req.params.id);
    if (['approved', 'rejected'].includes(current.status)) {
      throw conflict('El cliente ya respondió esta cotización');
    }
    const sets = keys.map((k, i) => `${k} = $${i + 1}`);
    await client.query(`UPDATE quotes SET ${sets.join(', ')} WHERE id = $${keys.length + 1}`,
      [...keys.map((k) => data[k]), current.id]);
    await recalcQuote(client, current.id);
    return loadQuote(client, req.auth.workshopId, current.id);
  });
  res.json(quote);
}));

// ── Respuesta del cliente (se usa desde la ruta pública) ──────────────────
// Aplica la decisión sobre las líneas reales de la orden.
export async function applyQuoteResponse(client, { quote, decision, itemDecisions,
                                                   customerName, note, ip, userAgent }) {
  const { rows: items } = await client.query(
    'SELECT * FROM quote_items WHERE quote_id = $1', [quote.id]);

  const decidedById = new Map(
    (itemDecisions || []).map((d) => [String(d.id), Boolean(d.approved)]));

  const resolved = items.map((item) => {
    // Un ítem no opcional sigue la decisión general; uno opcional puede
    // llevar respuesta propia.
    const approved = decision === 'rejected'
      ? false
      : (item.optional ? (decidedById.has(item.id) ? decidedById.get(item.id) : false) : true);
    return { ...item, approved };
  });

  for (const item of resolved) {
    await client.query('UPDATE quote_items SET approved = $1 WHERE id = $2',
      [item.approved, item.id]);

    if (item.work_order_service_id) {
      await client.query('UPDATE work_order_services SET approved = $1 WHERE id = $2',
        [item.approved, item.work_order_service_id]);
    }
    if (item.work_order_part_id) {
      await client.query('UPDATE work_order_parts SET approved = $1 WHERE id = $2',
        [item.approved, item.work_order_part_id]);
      const { rows } = await client.query('SELECT * FROM work_order_parts WHERE id = $1',
        [item.work_order_part_id]);
      if (rows[0]) {
        await syncPartStock(client, { workshopId: quote.workshop_id, line: rows[0], userId: null });
      }
    }
  }

  const anyApproved = resolved.some((i) => i.approved);
  const allApproved = resolved.every((i) => i.approved);
  const finalStatus = decision === 'rejected' || !anyApproved
    ? 'rejected'
    : (allApproved ? 'approved' : 'partial');

  await client.query(
    `UPDATE quotes SET status = $1, responded_at = NOW(), updated_at = NOW() WHERE id = $2`,
    [finalStatus, quote.id]);

  await client.query(
    `INSERT INTO approvals (workshop_id, quote_id, work_order_id, decision, customer_name,
                            items, note, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [quote.workshop_id, quote.id, quote.work_order_id,
     finalStatus === 'partial' ? 'partial' : finalStatus,
     customerName || null,
     JSON.stringify(resolved.map((i) => ({
       id: i.id, description: i.description, quantity: Number(i.quantity),
       unit_price: Number(i.unit_price), approved: i.approved
     }))),
     note || null, ip || null, userAgent || null]);

  await recalcQuote(client, quote.id);
  await recalcWorkOrder(client, quote.workshop_id, quote.work_order_id);

  // La orden avanza sola con la respuesta: aprobada pasa a reparación,
  // rechazada se anula.
  const wo = await getWorkOrder(client, quote.workshop_id, quote.work_order_id);
  const target = finalStatus === 'rejected' ? 'cancelled' : 'approved';
  // Sólo si el flujo lo permite: si el taller ya movió la orden por otro
  // camino, la respuesta del cliente no debe hacer fallar la petición.
  if (STATUS_FLOW[wo.status]?.includes(target)) {
    await changeStatus(client, {
      workshopId: quote.workshop_id, workOrderId: wo.id, status: target,
      note: finalStatus === 'rejected'
        ? 'El cliente rechazó la cotización'
        : `El cliente aprobó la cotización #${quote.number}`,
      userId: null });
  }

  return { status: finalStatus, items: resolved };
}
