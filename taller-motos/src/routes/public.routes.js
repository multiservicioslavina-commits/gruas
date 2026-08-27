// Rutas sin autenticación, para el cliente final del taller.
//
// El cliente no tiene cuenta: entra con el código de su orden o con el enlace
// de la cotización. Por eso estas respuestas exponen lo mínimo — nunca costos
// internos, teléfonos de otros clientes ni datos del equipo.
import { Router } from 'express';
import { query, queryOne, transaction } from '../db.js';
import { validate } from '../lib/validate.js';
import { wrap, notFound, conflict, badRequest } from '../lib/errors.js';
import { applyQuoteResponse } from './quotes.routes.js';

export const publicRouter = Router();

// Seguimiento de la orden por código.
publicRouter.get('/orders/:code', wrap(async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (code.length < 4) throw badRequest('Código inválido');

  const order = await queryOne(
    `SELECT wo.id, wo.number, wo.public_code, wo.status, wo.received_at, wo.promised_at,
            wo.delivered_at, wo.complaint, wo.work_performed, wo.total, wo.paid_total,
            wo.payment_status, wo.next_service_mileage, wo.next_service_date,
            m.plate, m.brand, m.model, m.year,
            split_part(COALESCE(c.name, ''), ' ', 1) AS customer_first_name,
            w.name AS workshop_name, w.phone AS workshop_phone,
            w.city AS workshop_city, w.address AS workshop_address, w.currency
     FROM work_orders wo
     JOIN workshops w        ON w.id = wo.workshop_id
     LEFT JOIN motorcycles m ON m.id = wo.motorcycle_id
     LEFT JOIN customers c   ON c.id = wo.customer_id
     WHERE upper(wo.public_code) = $1 AND wo.status <> 'cancelled'`,
    [code]);
  if (!order) throw notFound('No encontramos ninguna orden con ese código');

  const { rows: history } = await query(
    `SELECT status, created_at FROM work_order_status_history
     WHERE work_order_id = $1 ORDER BY created_at`, [order.id]);

  // Recomendaciones del taller, sin las notas internas.
  const { rows: diagnostics } = await query(
    `SELECT findings, recommendations, created_at FROM diagnostics
     WHERE work_order_id = $1 ORDER BY created_at`, [order.id]);

  const { rows: pendingQuotes } = await query(
    `SELECT public_token, number, total, valid_until FROM quotes
     WHERE work_order_id = $1 AND status = 'sent' ORDER BY created_at DESC LIMIT 1`,
    [order.id]);

  const { id, ...safe } = order;
  res.json({
    ...safe,
    balance: Number(order.total) - Number(order.paid_total),
    history,
    diagnostics,
    pending_quote: pendingQuotes[0] || null
  });
}));

// Ver la cotización que el taller envió.
publicRouter.get('/quotes/:token', wrap(async (req, res) => {
  const quote = await queryOne(
    `SELECT q.*, wo.number AS work_order_number, wo.complaint, wo.public_code,
            m.plate, m.brand, m.model,
            w.name AS workshop_name, w.phone AS workshop_phone, w.currency
     FROM quotes q
     JOIN work_orders wo     ON wo.id = q.work_order_id
     JOIN workshops w        ON w.id = q.workshop_id
     LEFT JOIN motorcycles m ON m.id = wo.motorcycle_id
     WHERE q.public_token = $1`,
    [req.params.token]);
  if (!quote) throw notFound('Esta cotización no existe o el enlace ya no es válido');
  if (quote.status === 'draft') throw notFound('Esta cotización todavía no ha sido enviada');

  const { rows: items } = await query(
    `SELECT id, kind, description, quantity, unit_price, optional, approved
     FROM quote_items WHERE quote_id = $1 ORDER BY created_at`, [quote.id]);

  const expired = quote.valid_until && new Date(quote.valid_until) < new Date(new Date().toDateString());

  res.json({
    number: quote.number,
    status: quote.status,
    subtotal: quote.subtotal,
    discount: quote.discount,
    tax_rate: quote.tax_rate,
    tax_total: quote.tax_total,
    total: quote.total,
    valid_until: quote.valid_until,
    expired: Boolean(expired),
    notes: quote.notes,
    sent_at: quote.sent_at,
    responded_at: quote.responded_at,
    work_order_number: quote.work_order_number,
    public_code: quote.public_code,
    complaint: quote.complaint,
    plate: quote.plate,
    brand: quote.brand,
    model: quote.model,
    workshop_name: quote.workshop_name,
    workshop_phone: quote.workshop_phone,
    currency: quote.currency,
    items
  });
}));

// Aprobar o rechazar. Queda registrado con fecha, IP y navegador (spec §8).
publicRouter.post('/quotes/:token/respond', wrap(async (req, res) => {
  const data = validate(req.body, {
    decision:      { type: 'string', required: true, enum: ['approved', 'rejected'] },
    customer_name: { type: 'string', max: 160 },
    note:          { type: 'string', max: 1000 },
    items:         { type: 'array', default: [] }
  });

  const result = await transaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM quotes WHERE public_token = $1 FOR UPDATE', [req.params.token]);
    const quote = rows[0];
    if (!quote) throw notFound('Esta cotización no existe o el enlace ya no es válido');
    if (quote.status === 'draft') throw notFound('Esta cotización todavía no ha sido enviada');
    if (['approved', 'rejected', 'partial'].includes(quote.status)) {
      throw conflict('Esta cotización ya fue respondida');
    }
    if (quote.status === 'cancelled') throw conflict('El taller anuló esta cotización');
    if (quote.valid_until && new Date(quote.valid_until) < new Date(new Date().toDateString())) {
      throw conflict('Esta cotización venció. Pídele al taller una nueva.');
    }

    return applyQuoteResponse(client, {
      quote,
      decision: data.decision,
      itemDecisions: data.items,
      customerName: data.customer_name,
      note: data.note,
      ip: req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress,
      userAgent: req.headers['user-agent']
    });
  });

  res.json({ ok: true, status: result.status });
}));
