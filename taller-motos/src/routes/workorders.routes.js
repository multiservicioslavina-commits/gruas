import { Router } from 'express';
import { query, queryOne, transaction, nextSequence } from '../db.js';
import { validate, assertUuid } from '../lib/validate.js';
import { wrap, notFound, badRequest, conflict } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';
import { publicCode } from '../lib/ids.js';
import {
  recalcWorkOrder, changeStatus, loadFullWorkOrder, getWorkOrder,
  syncPartStock, moveStock, OPEN_STATUSES, STATUS_FLOW
} from '../services/workorders.js';

export const workOrdersRouter = Router();

// ── Listado ───────────────────────────────────────────────────────────────
workOrdersRouter.get('/', wrap(async (req, res) => {
  const params = [req.auth.workshopId];
  const where = ['wo.workshop_id = $1'];

  const push = (value) => { params.push(value); return `$${params.length}`; };

  if (req.query.status)        where.push(`wo.status = ${push(req.query.status)}`);
  if (req.query.mechanic_id)   where.push(`wo.mechanic_id = ${push(req.query.mechanic_id)}`);
  if (req.query.customer_id)   where.push(`wo.customer_id = ${push(req.query.customer_id)}`);
  if (req.query.motorcycle_id) where.push(`wo.motorcycle_id = ${push(req.query.motorcycle_id)}`);
  if (req.query.open === 'true')  where.push(`wo.status = ANY(${push(OPEN_STATUSES)})`);
  if (req.query.unpaid === 'true') where.push('wo.total > wo.paid_total');
  if (req.query.from)  where.push(`wo.received_at >= ${push(req.query.from)}`);
  if (req.query.to)    where.push(`wo.received_at <= ${push(req.query.to)}`);
  if (req.query.search) {
    const term = push(`%${String(req.query.search).trim()}%`);
    where.push(`(m.plate ILIKE ${term} OR c.name ILIKE ${term} OR wo.complaint ILIKE ${term}
                 OR wo.public_code ILIKE ${term} OR wo.number::text ILIKE ${term})`);
  }

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const base = `FROM work_orders wo
    LEFT JOIN customers   c ON c.id = wo.customer_id
    LEFT JOIN motorcycles m ON m.id = wo.motorcycle_id
    LEFT JOIN users       u ON u.id = wo.mechanic_id
    WHERE ${where.join(' AND ')}`;

  const { rows } = await query(
    `SELECT wo.*, c.name AS customer_name, c.phone AS customer_phone,
            m.plate, m.brand, m.model, m.year, u.name AS mechanic_name,
            (wo.total - wo.paid_total) AS balance
     ${base} ORDER BY wo.received_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  const { rows: [{ count }] } = await query(`SELECT COUNT(*)::int AS count ${base}`, params);
  res.json({ data: rows, total: count, limit, offset });
}));

workOrdersRouter.get('/statuses', (_req, res) => res.json(STATUS_FLOW));

// ── Recepción: crear la orden ─────────────────────────────────────────────
// Acepta cliente y moto existentes, o los datos en línea para crearlos.
// El taller trabaja por placa, así que ese es el campo que manda.
workOrdersRouter.post('/', wrap(async (req, res) => {
  const data = validate(req.body, {
    customer_id:        { type: 'string', max: 40 },
    motorcycle_id:      { type: 'string', max: 40 },
    appointment_id:     { type: 'string', max: 40 },
    plate:              { type: 'string', max: 12, uppercase: true },
    customer_name:      { type: 'string', max: 160 },
    customer_phone:     { type: 'string', max: 40 },
    brand:              { type: 'string', max: 60 },
    model:              { type: 'string', max: 80 },
    year:               { type: 'number', integer: true, min: 1900, max: 2100 },
    complaint:          { type: 'string', required: true, max: 2000 },
    mileage_in:         { type: 'number', integer: true, min: 0 },
    fuel_level:         { type: 'string', enum: ['empty','quarter','half','three_quarters','full'] },
    accessories:        { type: 'array', default: [] },
    visual_condition:   { type: 'string', max: 1000 },
    existing_damage:    { type: 'string', max: 2000 },
    reception_notes:    { type: 'string', max: 2000 },
    customer_signature: { type: 'string', max: 200000 },
    mechanic_id:        { type: 'string', max: 40 },
    priority:           { type: 'string', enum: ['low','normal','high'], default: 'normal' },
    promised_at:        { type: 'date' }
  });

  if (!data.motorcycle_id && !data.plate) {
    throw badRequest('Indica la placa de la moto o su identificador');
  }

  const order = await transaction(async (client) => {
    const workshopId = req.auth.workshopId;

    // 1. Moto: por id, por placa existente, o nueva.
    let motorcycle = null;
    if (data.motorcycle_id) {
      const { rows } = await client.query(
        'SELECT * FROM motorcycles WHERE id = $1 AND workshop_id = $2',
        [data.motorcycle_id, workshopId]);
      motorcycle = rows[0];
      if (!motorcycle) throw notFound('Moto no encontrada');
    } else {
      const { rows } = await client.query(
        `SELECT * FROM motorcycles WHERE workshop_id = $1
         AND upper(replace(plate, ' ', '')) = $2`,
        [workshopId, data.plate.replace(/\s/g, '')]);
      motorcycle = rows[0] || null;
    }

    // 2. Cliente: el de la moto, uno existente, o uno nuevo.
    let customerId = data.customer_id || motorcycle?.customer_id || null;
    if (!customerId && data.customer_name) {
      const { rows } = await client.query(
        `INSERT INTO customers (workshop_id, name, phone) VALUES ($1, $2, $3) RETURNING id`,
        [workshopId, data.customer_name, data.customer_phone || null]);
      customerId = rows[0].id;
    }

    if (!motorcycle) {
      const { rows } = await client.query(
        `INSERT INTO motorcycles (workshop_id, customer_id, plate, brand, model, year, mileage)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [workshopId, customerId, data.plate, data.brand || null, data.model || null,
         data.year || null, data.mileage_in || null]);
      motorcycle = rows[0];
    } else if (data.mileage_in && data.mileage_in > (motorcycle.mileage || 0)) {
      await client.query('UPDATE motorcycles SET mileage = $1, updated_at = NOW() WHERE id = $2',
        [data.mileage_in, motorcycle.id]);
    }

    // 3. La orden.
    const { rows: [workshop] } = await client.query(
      'SELECT tax_rate FROM workshops WHERE id = $1', [workshopId]);
    const number = await nextSequence(client, workshopId, 'work_order');

    let code = publicCode();
    for (let i = 0; i < 5; i++) {
      const { rows } = await client.query('SELECT 1 FROM work_orders WHERE public_code = $1', [code]);
      if (!rows.length) break;
      code = publicCode();
    }

    const { rows: [created] } = await client.query(
      `INSERT INTO work_orders
        (workshop_id, number, public_code, customer_id, motorcycle_id, appointment_id,
         status, priority, mechanic_id, received_by, mileage_in, fuel_level, accessories,
         visual_condition, existing_damage, reception_notes, customer_signature, signed_at,
         complaint, promised_at, tax_rate)
       VALUES ($1,$2,$3,$4,$5,$6,'received',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [workshopId, number, code, customerId, motorcycle.id, data.appointment_id || null,
       data.priority, data.mechanic_id || null, req.auth.userId, data.mileage_in || null,
       data.fuel_level || null, JSON.stringify(data.accessories || []),
       data.visual_condition || null, data.existing_damage || null, data.reception_notes || null,
       data.customer_signature || null, data.customer_signature ? new Date() : null,
       data.complaint, data.promised_at || null, workshop.tax_rate]
    );

    await client.query(
      `INSERT INTO work_order_status_history (workshop_id, work_order_id, status, note, changed_by)
       VALUES ($1, $2, 'received', 'Recepción de la moto', $3)`,
      [workshopId, created.id, req.auth.userId]);

    if (data.appointment_id) {
      await client.query(
        `UPDATE appointments SET status = 'arrived', updated_at = NOW()
         WHERE id = $1 AND workshop_id = $2`, [data.appointment_id, workshopId]);
    }

    return loadFullWorkOrder(client, workshopId, created.id);
  });

  res.status(201).json(order);
}));

workOrdersRouter.get('/:id', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const order = await transaction((client) =>
    loadFullWorkOrder(client, req.auth.workshopId, req.params.id));
  res.json(order);
}));

// ── Edición de la orden ───────────────────────────────────────────────────
workOrdersRouter.patch('/:id', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const data = validate(req.body, {
    complaint:            { type: 'string', max: 2000 },
    mechanic_id:          { type: 'string', max: 40 },
    priority:             { type: 'string', enum: ['low','normal','high'] },
    promised_at:          { type: 'date' },
    mileage_in:           { type: 'number', integer: true, min: 0 },
    fuel_level:           { type: 'string', enum: ['empty','quarter','half','three_quarters','full'] },
    accessories:          { type: 'array' },
    visual_condition:     { type: 'string', max: 1000 },
    existing_damage:      { type: 'string', max: 2000 },
    reception_notes:      { type: 'string', max: 2000 },
    customer_signature:   { type: 'string', max: 200000 },
    work_performed:       { type: 'string', max: 4000 },
    observations:         { type: 'string', max: 4000 },
    discount:             { type: 'number', min: 0 },
    tax_rate:             { type: 'number', min: 0, max: 100 },
    next_service_mileage: { type: 'number', integer: true, min: 0 },
    next_service_date:    { type: 'string', max: 20 }
  });
  const keys = Object.keys(data);
  if (!keys.length) throw badRequest('No enviaste ningún campo para actualizar');

  const order = await transaction(async (client) => {
    await getWorkOrder(client, req.auth.workshopId, req.params.id);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`);
    const values = keys.map((k) => (k === 'accessories' ? JSON.stringify(data[k]) : data[k]));
    values.push(req.params.id, req.auth.workshopId);

    await client.query(
      `UPDATE work_orders SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length - 1} AND workshop_id = $${values.length}`, values);

    // El descuento o el impuesto cambian los totales.
    if ('discount' in data || 'tax_rate' in data) {
      await recalcWorkOrder(client, req.auth.workshopId, req.params.id);
    }
    return loadFullWorkOrder(client, req.auth.workshopId, req.params.id);
  });
  res.json(order);
}));

// ── Estado ────────────────────────────────────────────────────────────────
workOrdersRouter.post('/:id/status', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const data = validate(req.body, {
    status: { type: 'string', required: true, enum: Object.keys(STATUS_FLOW) },
    note:   { type: 'string', max: 500 }
  });

  const order = await transaction(async (client) => {
    await changeStatus(client, {
      workshopId: req.auth.workshopId,
      workOrderId: req.params.id,
      status: data.status,
      note: data.note,
      userId: req.auth.userId
    });
    return loadFullWorkOrder(client, req.auth.workshopId, req.params.id);
  });
  res.json(order);
}));

// ── Mano de obra ──────────────────────────────────────────────────────────
workOrdersRouter.post('/:id/services', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const data = validate(req.body, {
    service_id:  { type: 'string', max: 40 },
    mechanic_id: { type: 'string', max: 40 },
    description: { type: 'string', max: 300 },
    quantity:    { type: 'number', min: 0.01, default: 1 },
    unit_price:  { type: 'number', min: 0 },
    approved:    { type: 'boolean', default: true }
  });

  const order = await transaction(async (client) => {
    const wo = await getWorkOrder(client, req.auth.workshopId, req.params.id);
    assertEditable(wo);

    let { description, unit_price } = data;
    if (data.service_id) {
      const { rows } = await client.query(
        'SELECT * FROM services WHERE id = $1 AND workshop_id = $2',
        [data.service_id, req.auth.workshopId]);
      if (!rows[0]) throw notFound('Servicio no encontrado en el catálogo');
      description = description || rows[0].name;
      unit_price = unit_price ?? Number(rows[0].price);
    }
    if (!description) throw badRequest('Falta la descripción del trabajo');

    await client.query(
      `INSERT INTO work_order_services
         (workshop_id, work_order_id, service_id, mechanic_id, description, quantity, unit_price, approved)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.auth.workshopId, wo.id, data.service_id || null, data.mechanic_id || wo.mechanic_id,
       description, data.quantity, unit_price || 0, data.approved]);

    await recalcWorkOrder(client, req.auth.workshopId, wo.id);
    return loadFullWorkOrder(client, req.auth.workshopId, wo.id);
  });
  res.status(201).json(order);
}));

workOrdersRouter.delete('/:id/services/:lineId', wrap(async (req, res) => {
  assertUuid(req.params.id); assertUuid(req.params.lineId, 'lineId');
  const order = await transaction(async (client) => {
    const wo = await getWorkOrder(client, req.auth.workshopId, req.params.id);
    assertEditable(wo);
    const { rowCount } = await client.query(
      'DELETE FROM work_order_services WHERE id = $1 AND work_order_id = $2',
      [req.params.lineId, wo.id]);
    if (!rowCount) throw notFound('Línea no encontrada');
    await recalcWorkOrder(client, req.auth.workshopId, wo.id);
    return loadFullWorkOrder(client, req.auth.workshopId, wo.id);
  });
  res.json(order);
}));

// ── Repuestos (mueven inventario) ─────────────────────────────────────────
workOrdersRouter.post('/:id/parts', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const data = validate(req.body, {
    part_id:     { type: 'string', max: 40 },
    description: { type: 'string', max: 300 },
    quantity:    { type: 'number', min: 0.01, default: 1 },
    unit_price:  { type: 'number', min: 0 },
    unit_cost:   { type: 'number', min: 0 },
    approved:    { type: 'boolean', default: true },
    allow_negative_stock: { type: 'boolean', default: false }
  });

  const order = await transaction(async (client) => {
    const wo = await getWorkOrder(client, req.auth.workshopId, req.params.id);
    assertEditable(wo);

    let { description, unit_price, unit_cost } = data;
    if (data.part_id) {
      const { rows } = await client.query(
        'SELECT * FROM parts WHERE id = $1 AND workshop_id = $2 FOR UPDATE',
        [data.part_id, req.auth.workshopId]);
      const part = rows[0];
      if (!part) throw notFound('Repuesto no encontrado en el inventario');
      if (data.approved && Number(part.stock) < data.quantity && !data.allow_negative_stock) {
        throw conflict(
          `Sólo quedan ${Number(part.stock)} unidades de "${part.name}". ` +
          'Registra la entrada primero o envía allow_negative_stock=true.');
      }
      description = description || part.name;
      unit_price = unit_price ?? Number(part.price);
      unit_cost = unit_cost ?? Number(part.cost);
    }
    if (!description) throw badRequest('Falta la descripción del repuesto');

    const { rows: [line] } = await client.query(
      `INSERT INTO work_order_parts
         (workshop_id, work_order_id, part_id, description, quantity, unit_cost, unit_price, approved)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.auth.workshopId, wo.id, data.part_id || null, description,
       data.quantity, unit_cost || 0, unit_price || 0, data.approved]);

    await syncPartStock(client, { workshopId: req.auth.workshopId, line, userId: req.auth.userId });
    await recalcWorkOrder(client, req.auth.workshopId, wo.id);
    return loadFullWorkOrder(client, req.auth.workshopId, wo.id);
  });
  res.status(201).json(order);
}));

workOrdersRouter.delete('/:id/parts/:lineId', wrap(async (req, res) => {
  assertUuid(req.params.id); assertUuid(req.params.lineId, 'lineId');
  const order = await transaction(async (client) => {
    const wo = await getWorkOrder(client, req.auth.workshopId, req.params.id);
    assertEditable(wo);
    const { rows } = await client.query(
      'SELECT * FROM work_order_parts WHERE id = $1 AND work_order_id = $2',
      [req.params.lineId, wo.id]);
    const line = rows[0];
    if (!line) throw notFound('Línea no encontrada');

    // Devolver al inventario lo que ya se había descontado.
    if (line.stock_applied && line.part_id) {
      await moveStock(client, {
        workshopId: req.auth.workshopId, partId: line.part_id, workOrderId: wo.id,
        delta: Number(line.quantity), unitCost: line.unit_cost,
        reason: 'Repuesto retirado de la orden', userId: req.auth.userId
      });
    }
    await client.query('DELETE FROM work_order_parts WHERE id = $1', [line.id]);
    await recalcWorkOrder(client, req.auth.workshopId, wo.id);
    return loadFullWorkOrder(client, req.auth.workshopId, wo.id);
  });
  res.json(order);
}));

// ── Diagnóstico ───────────────────────────────────────────────────────────
workOrdersRouter.post('/:id/diagnostics', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const data = validate(req.body, {
    findings:        { type: 'string', required: true, max: 4000 },
    tests_performed: { type: 'string', max: 2000 },
    recommendations: { type: 'string', max: 2000 },
    notes:           { type: 'string', max: 2000 },
    mechanic_id:     { type: 'string', max: 40 }
  });

  const order = await transaction(async (client) => {
    const wo = await getWorkOrder(client, req.auth.workshopId, req.params.id);
    await client.query(
      `INSERT INTO diagnostics
         (workshop_id, work_order_id, findings, tests_performed, recommendations, notes, mechanic_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.auth.workshopId, wo.id, data.findings, data.tests_performed || null,
       data.recommendations || null, data.notes || null,
       data.mechanic_id || wo.mechanic_id || req.auth.userId]);

    // Registrar un diagnóstico sobre una orden recién recibida la mueve sola
    // al estado que corresponde: el mecánico no tiene que acordarse.
    if (wo.status === 'received') {
      await changeStatus(client, {
        workshopId: req.auth.workshopId, workOrderId: wo.id,
        status: 'diagnosing', note: 'Diagnóstico registrado', userId: req.auth.userId });
    }
    return loadFullWorkOrder(client, req.auth.workshopId, wo.id);
  });
  res.status(201).json(order);
}));

// ── Pagos ─────────────────────────────────────────────────────────────────
workOrdersRouter.post('/:id/payments', requireRole('cashier', 'reception'), wrap(async (req, res) => {
  assertUuid(req.params.id);
  const data = validate(req.body, {
    amount:    { type: 'number', required: true, min: 0.01 },
    method:    { type: 'string', enum: ['cash','transfer','card','nequi','daviplata','other'], default: 'cash' },
    reference: { type: 'string', max: 120 },
    note:      { type: 'string', max: 500 }
  });

  const order = await transaction(async (client) => {
    const wo = await getWorkOrder(client, req.auth.workshopId, req.params.id);
    if (wo.status === 'cancelled') throw conflict('La orden está anulada: no admite pagos');

    await client.query(
      `INSERT INTO payments (workshop_id, work_order_id, amount, method, reference, note, received_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.auth.workshopId, wo.id, data.amount, data.method,
       data.reference || null, data.note || null, req.auth.userId]);

    await recalcWorkOrder(client, req.auth.workshopId, wo.id);
    return loadFullWorkOrder(client, req.auth.workshopId, wo.id);
  });
  res.status(201).json(order);
}));

workOrdersRouter.delete('/:id/payments/:paymentId', requireRole('cashier'), wrap(async (req, res) => {
  assertUuid(req.params.id); assertUuid(req.params.paymentId, 'paymentId');
  const order = await transaction(async (client) => {
    const wo = await getWorkOrder(client, req.auth.workshopId, req.params.id);
    const { rowCount } = await client.query(
      'DELETE FROM payments WHERE id = $1 AND work_order_id = $2 AND workshop_id = $3',
      [req.params.paymentId, wo.id, req.auth.workshopId]);
    if (!rowCount) throw notFound('Pago no encontrado');
    await recalcWorkOrder(client, req.auth.workshopId, wo.id);
    return loadFullWorkOrder(client, req.auth.workshopId, wo.id);
  });
  res.json(order);
}));

// Una orden cerrada o anulada ya no se toca: es el cierre contable.
function assertEditable(order) {
  if (order.status === 'closed')    throw conflict('La orden está cerrada y ya no admite cambios');
  if (order.status === 'cancelled') throw conflict('La orden está anulada');
}
