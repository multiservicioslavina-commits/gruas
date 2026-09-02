// Nómina básica (plan Premium): lista de empleados y registro de pagos
// mensuales. No liquida automáticamente seguridad social ni prestaciones
// sociales — ver la nota en db/schema.sql sobre por qué.
import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { crudRouter } from '../lib/crud.js';
import { validate, assertUuid } from '../lib/validate.js';
import { wrap, notFound, badRequest } from '../lib/errors.js';
import { assertDelTaller } from '../lib/pertenencia.js';

export const payrollRouter = Router();

const METHODS = ['cash', 'transfer', 'card', 'nequi', 'daviplata', 'other'];
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const today = () => new Date().toISOString().slice(0, 10);

// ── Empleados ────────────────────────────────────────────────────────────
const employeesRouter = crudRouter({
  table: 'employees',
  schema: {
    name:        { type: 'string', required: true, max: 160 },
    position:    { type: 'string', max: 120 },
    base_salary: { type: 'number', min: 0 },
    phone:       { type: 'string', max: 40 },
    hired_at:    { type: 'string', max: 20 },
    active:      { type: 'boolean', default: true },
    notes:       { type: 'string', max: 1000 }
  },
  searchColumns: ['name'],
  orderBy: 'name ASC'
});
payrollRouter.use('/employees', employeesRouter);

// ── Pagos ────────────────────────────────────────────────────────────────
payrollRouter.get('/payments', wrap(async (req, res) => {
  const params = [req.auth.workshopId];
  const where = ['p.workshop_id = $1'];

  if (req.query.employee_id) {
    params.push(req.query.employee_id);
    where.push(`p.employee_id = $${params.length}`);
  }
  if (req.query.from) {
    params.push(req.query.from);
    where.push(`p.paid_at >= $${params.length}`);
  }
  if (req.query.to) {
    params.push(req.query.to);
    where.push(`p.paid_at <= $${params.length}`);
  }

  const { rows } = await query(
    `SELECT p.*, e.name AS employee_name FROM payroll_payments p
     JOIN employees e ON e.id = p.employee_id
     WHERE ${where.join(' AND ')}
     ORDER BY p.paid_at DESC, p.created_at DESC LIMIT 300`,
    params
  );
  res.json({ data: rows, total: rows.length });
}));

payrollRouter.post('/payments', wrap(async (req, res) => {
  const data = validate(req.body, {
    employee_id: { type: 'string', required: true, max: 40 },
    period:      { type: 'string', required: true, max: 7 },
    amount:      { type: 'number', required: true, min: 0.01 },
    paid_at:     { type: 'string', max: 20 },
    method:      { type: 'string', enum: METHODS, default: 'transfer' },
    notes:       { type: 'string', max: 1000 }
  });
  if (!PERIOD_RE.test(data.period)) throw badRequest('El periodo debe tener el formato AAAA-MM');
  await assertDelTaller('employees', data.employee_id, req.auth.workshopId);

  const row = await queryOne(
    `INSERT INTO payroll_payments
       (workshop_id, employee_id, period, amount, paid_at, method, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.auth.workshopId, data.employee_id, data.period, data.amount,
     data.paid_at || today(), data.method, data.notes || null, req.auth.userId]
  );
  res.status(201).json(row);
}));

payrollRouter.patch('/payments/:id', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const data = validate(req.body, {
    employee_id: { type: 'string', max: 40 },
    period:      { type: 'string', max: 7 },
    amount:      { type: 'number', min: 0.01 },
    paid_at:     { type: 'string', max: 20 },
    method:      { type: 'string', enum: METHODS },
    notes:       { type: 'string', max: 1000 }
  });
  if (data.period && !PERIOD_RE.test(data.period)) throw badRequest('El periodo debe tener el formato AAAA-MM');
  if (data.employee_id) await assertDelTaller('employees', data.employee_id, req.auth.workshopId);
  const keys = Object.keys(data);
  if (!keys.length) throw badRequest('No enviaste ningún campo para actualizar');

  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  const values = keys.map((k) => data[k]);
  values.push(req.params.id, req.auth.workshopId);

  const row = await queryOne(
    `UPDATE payroll_payments SET ${sets.join(', ')}
     WHERE id = $${values.length - 1} AND workshop_id = $${values.length} RETURNING *`,
    values
  );
  if (!row) throw notFound();
  res.json(row);
}));

payrollRouter.delete('/payments/:id', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const row = await queryOne(
    `DELETE FROM payroll_payments WHERE id = $1 AND workshop_id = $2 RETURNING id`,
    [req.params.id, req.auth.workshopId]
  );
  if (!row) throw notFound();
  res.status(204).end();
}));
