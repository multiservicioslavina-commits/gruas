// API de integración para plataformas externas.
//
// Es el punto por el que otro sistema puede consultar el estado de una moto o
// agendar una cita, sin que el software del taller dependa de ninguno de ellos.
// Se autentica con una llave por taller (cabecera X-Api-Key) y cada llave lleva
// sus permisos: read, write.
//
// Versionada desde el primer día (/integration/v1) para poder evolucionarla
// sin romper a quien ya la use.
import { Router } from 'express';
import { query, queryOne, transaction } from '../db.js';
import { generateApiKey } from '../lib/auth.js';
import { validate, assertUuid } from '../lib/validate.js';
import { wrap, notFound, badRequest } from '../lib/errors.js';
import { requireAuth, requireRole, requireApiKey, requireScope, requirePlan } from '../middleware/auth.js';

// ── Administración de llaves (usuario admin del taller) ───────────────────
// Las integraciones externas son un módulo del plan Completo en adelante.
export const apiKeysRouter = Router();
apiKeysRouter.use(requireAuth, requireRole(), requirePlan('completo'));

apiKeysRouter.get('/', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, prefix, scopes, active, last_used_at, created_at
     FROM api_keys WHERE workshop_id = $1 ORDER BY created_at DESC`,
    [req.auth.workshopId]);
  res.json({ data: rows, total: rows.length });
}));

apiKeysRouter.post('/', wrap(async (req, res) => {
  const data = validate(req.body, {
    name:   { type: 'string', required: true, max: 120 },
    scopes: { type: 'array', default: ['read'] }
  });
  const allowed = ['read', 'write'];
  const scopes = data.scopes.map(String).filter((s) => allowed.includes(s));
  if (!scopes.length) throw badRequest(`scopes debe incluir alguno de: ${allowed.join(', ')}`);

  const key = generateApiKey();
  const row = await queryOne(
    `INSERT INTO api_keys (workshop_id, name, prefix, key_hash, scopes)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, name, prefix, scopes, active, created_at`,
    [req.auth.workshopId, data.name, key.prefix, key.hash, scopes]);

  // El secreto se muestra una sola vez: en la base sólo queda su hash.
  res.status(201).json({ ...row, key: key.full });
}));

apiKeysRouter.delete('/:id', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const row = await queryOne(
    'DELETE FROM api_keys WHERE id = $1 AND workshop_id = $2 RETURNING id',
    [req.params.id, req.auth.workshopId]);
  if (!row) throw notFound('Llave no encontrada');
  res.status(204).end();
}));

// ── API pública para integraciones ────────────────────────────────────────
export const integrationRouter = Router();
integrationRouter.use(requireApiKey);

integrationRouter.get('/workshop', requireScope('read'), wrap(async (req, res) => {
  const workshop = await queryOne(
    `SELECT id, name, phone, email, address, city, country, currency, timezone
     FROM workshops WHERE id = $1`, [req.auth.workshopId]);
  res.json(workshop);
}));

// Estado de una orden por su código público.
integrationRouter.get('/orders/:code', requireScope('read'), wrap(async (req, res) => {
  const order = await queryOne(
    `SELECT wo.number, wo.public_code, wo.status, wo.received_at, wo.promised_at,
            wo.delivered_at, wo.complaint, wo.total, wo.paid_total, wo.payment_status,
            m.plate, m.brand, m.model
     FROM work_orders wo
     LEFT JOIN motorcycles m ON m.id = wo.motorcycle_id
     WHERE wo.workshop_id = $1 AND upper(wo.public_code) = upper($2)`,
    [req.auth.workshopId, req.params.code]);
  if (!order) throw notFound('Orden no encontrada');
  res.json(order);
}));

// Historial de servicio de una moto por placa.
integrationRouter.get('/motorcycles/:plate/history', requireScope('read'), wrap(async (req, res) => {
  const plate = String(req.params.plate).toUpperCase().replace(/\s/g, '');
  const moto = await queryOne(
    `SELECT * FROM motorcycles
     WHERE workshop_id = $1 AND upper(replace(plate, ' ', '')) = $2`,
    [req.auth.workshopId, plate]);
  if (!moto) throw notFound('No hay ninguna moto con esa placa en este taller');

  const { rows } = await query(
    `SELECT number, status, received_at, delivered_at, mileage_in, complaint,
            work_performed, total, next_service_mileage, next_service_date
     FROM service_history
     WHERE motorcycle_id = $1 AND workshop_id = $2
     ORDER BY received_at DESC LIMIT 50`,
    [moto.id, req.auth.workshopId]);

  res.json({
    motorcycle: {
      plate: moto.plate, brand: moto.brand, model: moto.model,
      year: moto.year, mileage: moto.mileage
    },
    history: rows
  });
}));

// Agendar una cita desde la plataforma externa.
integrationRouter.post('/appointments', requireScope('write'), wrap(async (req, res) => {
  const data = validate(req.body, {
    customer_name:    { type: 'string', required: true, max: 160 },
    customer_phone:   { type: 'string', max: 40 },
    customer_email:   { type: 'string', max: 160 },
    plate:            { type: 'string', max: 12, uppercase: true },
    brand:            { type: 'string', max: 60 },
    model:            { type: 'string', max: 80 },
    scheduled_at:     { type: 'date', required: true },
    duration_minutes: { type: 'number', integer: true, min: 5, default: 60 },
    reason:           { type: 'string', max: 500 },
    source:           { type: 'string', max: 60, default: 'integration' }
  });

  const appointment = await transaction(async (client) => {
    const workshopId = req.auth.workshopId;

    // Reutiliza el cliente si ya existe por teléfono; si no, lo crea.
    let customer = null;
    if (data.customer_phone) {
      const { rows } = await client.query(
        `SELECT * FROM customers WHERE workshop_id = $1
         AND regexp_replace(COALESCE(phone,''), '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g')
         LIMIT 1`,
        [workshopId, data.customer_phone]);
      customer = rows[0] || null;
    }
    if (!customer) {
      const { rows } = await client.query(
        `INSERT INTO customers (workshop_id, name, phone, email, notes)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [workshopId, data.customer_name, data.customer_phone || null,
         data.customer_email || null, `Alta desde ${data.source}`]);
      customer = rows[0];
    }

    let motorcycle = null;
    if (data.plate) {
      const { rows } = await client.query(
        `SELECT * FROM motorcycles WHERE workshop_id = $1
         AND upper(replace(plate, ' ', '')) = $2`,
        [workshopId, data.plate.replace(/\s/g, '')]);
      motorcycle = rows[0] || null;
      if (!motorcycle) {
        const { rows: created } = await client.query(
          `INSERT INTO motorcycles (workshop_id, customer_id, plate, brand, model)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [workshopId, customer.id, data.plate, data.brand || null, data.model || null]);
        motorcycle = created[0];
      }
    }

    const { rows } = await client.query(
      `INSERT INTO appointments
         (workshop_id, customer_id, motorcycle_id, scheduled_at, duration_minutes, reason, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [workshopId, customer.id, motorcycle?.id || null, data.scheduled_at,
       data.duration_minutes, data.reason || null, `Origen: ${data.source}`]);

    return { ...rows[0], customer, motorcycle };
  });

  res.status(201).json(appointment);
}));
