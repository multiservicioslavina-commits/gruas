// Contabilidad básica (plan Premium): plan de cuentas y libro de
// ingresos/gastos, más un balance de caja por periodo que junta esas
// entradas manuales con lo que ya se registra solo (pagos de clientes,
// compras a proveedores).
import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { crudRouter } from '../lib/crud.js';
import { validate, assertUuid } from '../lib/validate.js';
import { wrap, notFound, badRequest } from '../lib/errors.js';
import { assertDelTaller } from '../lib/pertenencia.js';

export const accountingRouter = Router();

const METHODS = ['cash', 'transfer', 'card', 'nequi', 'daviplata', 'other'];
const today = () => new Date().toISOString().slice(0, 10);

// ── Plan de cuentas ─────────────────────────────────────────────────────
const categoriesRouter = crudRouter({
  table: 'accounting_categories',
  schema: {
    name:   { type: 'string', required: true, max: 120 },
    kind:   { type: 'string', enum: ['income', 'expense'], default: 'expense' },
    active: { type: 'boolean', default: true }
  },
  searchColumns: ['name'],
  filters: { kind: 'kind' },
  orderBy: 'name ASC'
});
accountingRouter.use('/categories', categoriesRouter);

// ── Libro de ingresos y gastos ───────────────────────────────────────────
// No duplica lo que ya se registra solo: es para todo lo demás.
accountingRouter.get('/entries', wrap(async (req, res) => {
  const params = [req.auth.workshopId];
  const where = ['e.workshop_id = $1'];

  if (req.query.kind) {
    params.push(req.query.kind);
    where.push(`e.kind = $${params.length}`);
  }
  if (req.query.from) {
    params.push(req.query.from);
    where.push(`e.entry_date >= $${params.length}`);
  }
  if (req.query.to) {
    params.push(req.query.to);
    where.push(`e.entry_date <= $${params.length}`);
  }

  const { rows } = await query(
    `SELECT e.*, c.name AS category_name FROM cash_entries e
     LEFT JOIN accounting_categories c ON c.id = e.category_id
     WHERE ${where.join(' AND ')}
     ORDER BY e.entry_date DESC, e.created_at DESC LIMIT 300`,
    params
  );
  res.json({ data: rows, total: rows.length });
}));

accountingRouter.post('/entries', wrap(async (req, res) => {
  const data = validate(req.body, {
    category_id: { type: 'string', max: 40 },
    kind:        { type: 'string', required: true, enum: ['income', 'expense'] },
    description: { type: 'string', required: true, max: 300 },
    amount:      { type: 'number', required: true, min: 0.01 },
    method:      { type: 'string', enum: METHODS, default: 'cash' },
    entry_date:  { type: 'string', max: 20 },
    notes:       { type: 'string', max: 1000 }
  });
  if (data.category_id) await assertDelTaller('accounting_categories', data.category_id, req.auth.workshopId);

  const row = await queryOne(
    `INSERT INTO cash_entries
       (workshop_id, category_id, kind, description, amount, method, entry_date, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.auth.workshopId, data.category_id || null, data.kind, data.description, data.amount,
     data.method, data.entry_date || today(), data.notes || null, req.auth.userId]
  );
  res.status(201).json(row);
}));

accountingRouter.patch('/entries/:id', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const data = validate(req.body, {
    category_id: { type: 'string', max: 40 },
    kind:        { type: 'string', enum: ['income', 'expense'] },
    description: { type: 'string', max: 300 },
    amount:      { type: 'number', min: 0.01 },
    method:      { type: 'string', enum: METHODS },
    entry_date:  { type: 'string', max: 20 },
    notes:       { type: 'string', max: 1000 }
  });
  if (data.category_id) await assertDelTaller('accounting_categories', data.category_id, req.auth.workshopId);
  const keys = Object.keys(data);
  if (!keys.length) throw badRequest('No enviaste ningún campo para actualizar');

  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  const values = keys.map((k) => data[k]);
  values.push(req.params.id, req.auth.workshopId);

  const row = await queryOne(
    `UPDATE cash_entries SET ${sets.join(', ')}
     WHERE id = $${values.length - 1} AND workshop_id = $${values.length} RETURNING *`,
    values
  );
  if (!row) throw notFound();
  res.json(row);
}));

accountingRouter.delete('/entries/:id', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const row = await queryOne(
    `DELETE FROM cash_entries WHERE id = $1 AND workshop_id = $2 RETURNING id`,
    [req.params.id, req.auth.workshopId]
  );
  if (!row) throw notFound();
  res.status(204).end();
}));

// ── Operaciones ───────────────────────────────────────────────────────────
// Un solo listado con todos los documentos de plata del taller —facturas
// (normal y electrónica), compras y movimientos manuales— como en el
// "manejador de operaciones" de un ERP tradicional. No agrega datos nuevos:
// junta lo que ya vive en tres tablas distintas para verlo en un solo lugar.
accountingRouter.get('/operations', wrap(async (req, res) => {
  const from = req.query.from || new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().slice(0, 10);
  const to = req.query.to || today();
  const params = [req.auth.workshopId, from, to];
  const typeFilter = req.query.type ? `AND source = $4` : '';
  if (req.query.type) params.push(req.query.type);

  const { rows } = await query(
    `SELECT * FROM (
       SELECT i.id, 'invoice' AS source,
         CASE WHEN i.kind = 'electronic' THEN 'Factura electrónica' ELSE 'Factura de venta' END AS doc_type,
         CASE WHEN i.kind = 'electronic' THEN i.external_id
              ELSE '10-' || lpad(i.number::text, 6, '0') END AS doc_code,
         COALESCE(i.issued_at, i.created_at)::date AS doc_date,
         cu.name AS counterparty, ('Orden ' || wo.public_code) AS detail,
         i.total AS amount, 'income' AS direction, 'Emitida' AS status
       FROM invoices i
       JOIN work_orders wo ON wo.id = i.work_order_id
       LEFT JOIN customers cu ON cu.id = wo.customer_id
       WHERE i.workshop_id = $1 AND i.status = 'issued'

       UNION ALL

       SELECT p.id, 'purchase' AS source, 'Compra' AS doc_type,
         COALESCE(p.reference, 'C-' || substring(p.id::text, 1, 8)) AS doc_code,
         p.purchased_at::date AS doc_date,
         s.name AS counterparty, COALESCE(p.notes, '') AS detail,
         p.total AS amount, 'expense' AS direction, 'Registrada' AS status
       FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.workshop_id = $1

       UNION ALL

       SELECT e.id, 'cash_entry' AS source, 'Movimiento contable' AS doc_type,
         'M-' || substring(e.id::text, 1, 8) AS doc_code,
         e.entry_date AS doc_date,
         COALESCE(c.name, 'Sin categoría') AS counterparty, e.description AS detail,
         e.amount AS amount, e.kind AS direction, 'Registrado' AS status
       FROM cash_entries e
       LEFT JOIN accounting_categories c ON c.id = e.category_id
       WHERE e.workshop_id = $1
     ) ops
     WHERE doc_date BETWEEN $2 AND $3 ${typeFilter}
     ORDER BY doc_date DESC LIMIT 300`,
    params
  );
  res.json({ data: rows, total: rows.length });
}));

// ── Balance de caja por periodo ──────────────────────────────────────────
// Junta las tres fuentes de movimiento de caja: lo que pagaron los
// clientes (`payments`), lo que se compró a proveedores (`purchases`) y
// las entradas manuales de este módulo (`cash_entries`).
accountingRouter.get('/summary', wrap(async (req, res) => {
  const from = req.query.from || new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().slice(0, 10);
  const to = req.query.to || today();
  const w = [req.auth.workshopId, from, to];

  const [payments, purchases, byCategory] = await Promise.all([
    query(`SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS count FROM payments
           WHERE workshop_id = $1 AND created_at::date BETWEEN $2 AND $3`, w),
    query(`SELECT COALESCE(SUM(total), 0) AS total, COUNT(*)::int AS count FROM purchases
           WHERE workshop_id = $1 AND purchased_at::date BETWEEN $2 AND $3`, w),
    query(
      `SELECT e.kind, COALESCE(c.name, 'Sin categoría') AS category, SUM(e.amount) AS total
       FROM cash_entries e LEFT JOIN accounting_categories c ON c.id = e.category_id
       WHERE e.workshop_id = $1 AND e.entry_date BETWEEN $2 AND $3
       GROUP BY e.kind, category ORDER BY total DESC`, w)
  ]);

  const incomeFromOrders = Number(payments.rows[0].total);
  const expenseFromPurchases = Number(purchases.rows[0].total);
  const manualIncome = byCategory.rows.filter((r) => r.kind === 'income')
    .map((r) => ({ category: r.category, total: Number(r.total) }));
  const manualExpense = byCategory.rows.filter((r) => r.kind === 'expense')
    .map((r) => ({ category: r.category, total: Number(r.total) }));

  const income = incomeFromOrders + manualIncome.reduce((s, r) => s + r.total, 0);
  const expense = expenseFromPurchases + manualExpense.reduce((s, r) => s + r.total, 0);

  res.json({
    from, to,
    income: {
      total: income,
      by_category: [
        { category: 'Órdenes (pagos recibidos)', total: incomeFromOrders },
        ...manualIncome
      ].filter((r) => r.total > 0)
    },
    expense: {
      total: expense,
      by_category: [
        { category: 'Repuestos y compras', total: expenseFromPurchases },
        ...manualExpense
      ].filter((r) => r.total > 0)
    },
    net: income - expense
  });
}));
