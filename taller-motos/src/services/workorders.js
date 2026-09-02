// Reglas de negocio de la orden de trabajo: totales, flujo de estados e
// impacto en inventario. Todo se ejecuta dentro de una transacción para que
// una orden nunca quede con totales o stock a medias.
import { computeTotals, round2 } from '../lib/money.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { docCode } from '../lib/invoices.js';

// Flujo de la spec §7. Un estado terminal (closed, cancelled) no admite salida.
export const STATUS_FLOW = {
  scheduled:        ['received', 'cancelled'],
  received:         ['diagnosing', 'quoted', 'repairing', 'waiting_parts', 'cancelled'],
  diagnosing:       ['quoted', 'pending_approval', 'repairing', 'waiting_parts', 'cancelled'],
  quoted:           ['pending_approval', 'approved', 'repairing', 'cancelled'],
  pending_approval: ['approved', 'quoted', 'cancelled'],
  approved:         ['repairing', 'waiting_parts', 'cancelled'],
  repairing:        ['waiting_parts', 'quality_check', 'ready', 'cancelled'],
  waiting_parts:    ['repairing', 'quality_check', 'ready', 'cancelled'],
  quality_check:    ['repairing', 'ready', 'cancelled'],
  ready:            ['delivered', 'repairing', 'cancelled'],
  delivered:        ['closed'],
  closed:           [],
  cancelled:        []
};

export const OPEN_STATUSES = [
  'scheduled', 'received', 'diagnosing', 'quoted', 'pending_approval',
  'approved', 'repairing', 'waiting_parts', 'quality_check', 'ready'
];

export function assertTransition(from, to) {
  if (from === to) return;
  const allowed = STATUS_FLOW[from];
  if (!allowed) throw badRequest(`Estado desconocido: ${from}`);
  if (!allowed.includes(to)) {
    throw conflict(
      allowed.length
        ? `No se puede pasar de "${from}" a "${to}". Desde "${from}" sólo se puede ir a: ${allowed.join(', ')}.`
        : `La orden está en "${from}" y ya no admite cambios de estado.`
    );
  }
}

export async function getWorkOrder(client, workshopId, id) {
  const { rows } = await client.query(
    'SELECT * FROM work_orders WHERE id = $1 AND workshop_id = $2',
    [id, workshopId]
  );
  if (!rows[0]) throw notFound('Orden de trabajo no encontrada');
  return rows[0];
}

// Recalcula los totales desde las líneas aprobadas y los pagos registrados.
// Las líneas sin aprobar son propuestas: se cotizan, pero no se cobran.
export async function recalcWorkOrder(client, workshopId, workOrderId) {
  const { rows: [sums] } = await client.query(
    `SELECT
       COALESCE((SELECT SUM(quantity * unit_price) FROM work_order_services
                  WHERE work_order_id = $1 AND approved), 0) AS labor,
       COALESCE((SELECT SUM(quantity * unit_price) FROM work_order_parts
                  WHERE work_order_id = $1 AND approved), 0) AS parts,
       COALESCE((SELECT SUM(amount) FROM payments WHERE work_order_id = $1), 0) AS paid`,
    [workOrderId]
  );

  const { rows: [order] } = await client.query(
    'SELECT discount, tax_rate FROM work_orders WHERE id = $1 AND workshop_id = $2',
    [workOrderId, workshopId]
  );
  if (!order) throw notFound('Orden de trabajo no encontrada');

  const totals = computeTotals({
    laborTotal: sums.labor,
    partsTotal: sums.parts,
    discount:   order.discount,
    taxRate:    order.tax_rate
  });

  const paid = round2(sums.paid);
  const paymentStatus = paid <= 0 ? 'pending' : (paid >= totals.total ? 'paid' : 'partial');

  const { rows } = await client.query(
    `UPDATE work_orders SET
       labor_total = $1, parts_total = $2, tax_total = $3, total = $4,
       paid_total = $5, payment_status = $6, updated_at = NOW()
     WHERE id = $7 AND workshop_id = $8
     RETURNING *`,
    [totals.labor_total, totals.parts_total, totals.tax_total, totals.total,
     paid, paymentStatus, workOrderId, workshopId]
  );
  return rows[0];
}

// Mueve stock y deja el movimiento registrado. `delta` negativo = salida.
export async function moveStock(client, { workshopId, partId, workOrderId, purchaseId,
                                          delta, unitCost, reason, userId }) {
  if (!partId || !delta) return null;

  const { rows } = await client.query(
    `UPDATE parts SET stock = stock + $1, updated_at = NOW()
     WHERE id = $2 AND workshop_id = $3
     RETURNING stock`,
    [delta, partId, workshopId]
  );
  if (!rows[0]) throw notFound('Repuesto no encontrado en el inventario');

  await client.query(
    `INSERT INTO inventory_movements
       (workshop_id, part_id, work_order_id, purchase_id, type, quantity,
        unit_cost, balance_after, reason, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [workshopId, partId, workOrderId || null, purchaseId || null,
     delta > 0 ? 'in' : 'out', Math.abs(delta), unitCost ?? null,
     rows[0].stock, reason || null, userId || null]
  );
  return rows[0].stock;
}

// Sincroniza el inventario con el estado de aprobación de una línea de
// repuesto: sólo se descuenta lo que el cliente autorizó.
export async function syncPartStock(client, { workshopId, line, userId }) {
  const shouldApply = line.approved && !line.stock_applied;
  const shouldRelease = !line.approved && line.stock_applied;
  if (!shouldApply && !shouldRelease) return line.stock_applied;

  await moveStock(client, {
    workshopId,
    partId: line.part_id,
    workOrderId: line.work_order_id,
    delta: shouldApply ? -Number(line.quantity) : Number(line.quantity),
    unitCost: line.unit_cost,
    reason: shouldApply ? 'Consumo en orden de trabajo' : 'Reverso de orden de trabajo',
    userId
  });

  const applied = Boolean(shouldApply);
  await client.query('UPDATE work_order_parts SET stock_applied = $1 WHERE id = $2',
    [applied, line.id]);
  return applied;
}

// Cambia el estado y deja rastro en el historial (spec §14).
export async function changeStatus(client, { workshopId, workOrderId, status, note, userId }) {
  const order = await getWorkOrder(client, workshopId, workOrderId);
  assertTransition(order.status, status);

  const stamps = [];
  const params = [status, workOrderId, workshopId];
  if (status === 'delivered' && !order.delivered_at) stamps.push('delivered_at = NOW()');
  if (status === 'closed' && !order.closed_at) stamps.push('closed_at = NOW()');

  const { rows } = await client.query(
    `UPDATE work_orders SET status = $1, updated_at = NOW()
       ${stamps.length ? ', ' + stamps.join(', ') : ''}
     WHERE id = $2 AND workshop_id = $3 RETURNING *`,
    params
  );

  await client.query(
    `INSERT INTO work_order_status_history (workshop_id, work_order_id, status, note, changed_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [workshopId, workOrderId, status, note || null, userId || null]
  );
  return rows[0];
}

// Carga completa de la orden para la vista de detalle.
export async function loadFullWorkOrder(client, workshopId, id) {
  const order = await getWorkOrder(client, workshopId, id);

  // Un cliente de PostgreSQL atiende una consulta a la vez: dentro de una
  // transacción hay que encadenarlas, no lanzarlas en paralelo.
  const customer = order.customer_id
    ? (await client.query('SELECT * FROM customers WHERE id = $1', [order.customer_id])).rows[0]
    : null;
  const motorcycle = order.motorcycle_id
    ? (await client.query('SELECT * FROM motorcycles WHERE id = $1', [order.motorcycle_id])).rows[0]
    : null;

  const services = await client.query(
    `SELECT s.*, u.name AS mechanic_name FROM work_order_services s
     LEFT JOIN users u ON u.id = s.mechanic_id
     WHERE s.work_order_id = $1 ORDER BY s.created_at`, [id]);
  const parts = await client.query(
    'SELECT * FROM work_order_parts WHERE work_order_id = $1 ORDER BY created_at', [id]);
  const diagnostics = await client.query(
    `SELECT d.*, u.name AS mechanic_name FROM diagnostics d
     LEFT JOIN users u ON u.id = d.mechanic_id
     WHERE d.work_order_id = $1 ORDER BY d.created_at DESC`, [id]);
  const payments = await client.query(
    'SELECT * FROM payments WHERE work_order_id = $1 ORDER BY created_at', [id]);
  const history = await client.query(
    `SELECT h.*, u.name AS user_name FROM work_order_status_history h
     LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.work_order_id = $1 ORDER BY h.created_at`, [id]);
  const quotes = await client.query(
    `SELECT id, number, status, total, public_token, sent_at, responded_at, valid_until
     FROM quotes WHERE work_order_id = $1 ORDER BY created_at DESC`, [id]);
  const invoices = await client.query(
    `SELECT id, number, kind, status, total, external_id, cufe, issued_at, created_at
     FROM invoices WHERE work_order_id = $1 ORDER BY created_at DESC`, [id]);
  for (const invoice of invoices.rows) invoice.doc_code = docCode(invoice);
  const files = await client.query(
    `SELECT id, kind, stage, filename, mime_type, size_bytes, caption, created_at
     FROM attachments WHERE entity_type = 'work_order' AND entity_id = $1
     ORDER BY created_at`, [id]);

  return {
    ...order,
    balance: round2(Number(order.total) - Number(order.paid_total)),
    customer: customer || null,
    motorcycle: motorcycle || null,
    services: services.rows,
    parts: parts.rows,
    diagnostics: diagnostics.rows,
    payments: payments.rows,
    history: history.rows,
    quotes: quotes.rows,
    invoices: invoices.rows,
    attachments: files.rows
  };
}
