// Catálogo del taller: servicios (mano de obra), repuestos, proveedores,
// compras y reglas de mantenimiento.
import { Router } from 'express';
import { query, queryOne, transaction } from '../db.js';
import { crudRouter } from '../lib/crud.js';
import { validate, assertUuid } from '../lib/validate.js';
import { wrap, notFound, badRequest } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';
import { moveStock } from '../services/workorders.js';
import { assertDelTaller } from '../lib/pertenencia.js';

// ── Servicios ─────────────────────────────────────────────────────────────
export const servicesRouter = crudRouter({
  table: 'services',
  schema: {
    code:              { type: 'string', max: 40 },
    name:              { type: 'string', required: true, max: 160 },
    description:       { type: 'string', max: 1000 },
    price:             { type: 'number', min: 0, default: 0 },
    estimated_minutes: { type: 'number', integer: true, min: 0 },
    active:            { type: 'boolean', default: true }
  },
  searchColumns: ['name', 'code', 'description'],
  orderBy: 'name ASC'
});

// ── Proveedores ───────────────────────────────────────────────────────────
export const suppliersRouter = crudRouter({
  table: 'suppliers',
  schema: {
    name:         { type: 'string', required: true, max: 160 },
    contact_name: { type: 'string', max: 120 },
    phone:        { type: 'string', max: 40 },
    email:        { type: 'string', max: 160 },
    address:      { type: 'string', max: 200 },
    notes:        { type: 'string', max: 2000 },
    active:       { type: 'boolean', default: true }
  },
  searchColumns: ['name', 'contact_name', 'phone', 'email'],
  orderBy: 'name ASC'
});

// ── Repuestos e inventario ────────────────────────────────────────────────
export const partsRouter = crudRouter({
  table: 'parts',
  schema: {
    supplier_id: { type: 'string', max: 40 },
    sku:         { type: 'string', max: 60 },
    name:        { type: 'string', required: true, max: 160 },
    description: { type: 'string', max: 1000 },
    brand:       { type: 'string', max: 60 },
    category:    { type: 'string', max: 60 },
    cost:        { type: 'number', min: 0, default: 0 },
    price:       { type: 'number', min: 0, default: 0 },
    stock:       { type: 'number', default: 0 },
    min_stock:   { type: 'number', min: 0, default: 0 },
    location:    { type: 'string', max: 60 },
    active:      { type: 'boolean', default: true }
  },
  searchColumns: ['name', 'sku', 'brand', 'category', 'location'],
  filters: { category: 'category', supplier_id: 'supplier_id' },
  references: { supplier_id: 'suppliers' },
  orderBy: 'name ASC',
  duplicateMessage: 'Ya existe un repuesto con ese SKU'
});

// Lo que hay que pedir: stock por debajo del mínimo.
partsRouter.get('/alerts/low-stock', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT p.*, s.name AS supplier_name FROM parts p
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     WHERE p.workshop_id = $1 AND p.active AND p.stock <= p.min_stock
     ORDER BY (p.min_stock - p.stock) DESC, p.name`,
    [req.auth.workshopId]);
  res.json({ data: rows, total: rows.length });
}));

// Entrada, salida o ajuste manual de inventario.
partsRouter.post('/:id/movements', requireRole('warehouse', 'reception'), wrap(async (req, res) => {
  assertUuid(req.params.id);
  const data = validate(req.body, {
    type:      { type: 'string', required: true, enum: ['in', 'out', 'adjust'] },
    quantity:  { type: 'number', required: true },
    unit_cost: { type: 'number', min: 0 },
    reason:    { type: 'string', max: 300 }
  });
  if (data.type !== 'adjust' && data.quantity <= 0) {
    throw badRequest('La cantidad debe ser mayor que cero');
  }

  const result = await transaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM parts WHERE id = $1 AND workshop_id = $2 FOR UPDATE',
      [req.params.id, req.auth.workshopId]);
    const part = rows[0];
    if (!part) throw notFound('Repuesto no encontrado');

    // En un ajuste, `quantity` es el conteo físico real: el movimiento es
    // la diferencia contra lo que dice el sistema.
    const delta = data.type === 'in'  ? data.quantity
                : data.type === 'out' ? -data.quantity
                : data.quantity - Number(part.stock);

    if (delta !== 0) {
      await moveStock(client, {
        workshopId: req.auth.workshopId, partId: part.id, delta,
        unitCost: data.unit_cost ?? part.cost,
        reason: data.reason || (data.type === 'adjust' ? 'Ajuste de inventario' : null),
        userId: req.auth.userId
      });
    }
    if (data.type === 'in' && data.unit_cost !== undefined && data.unit_cost !== null) {
      await client.query('UPDATE parts SET cost = $1, updated_at = NOW() WHERE id = $2',
        [data.unit_cost, part.id]);
    }
    const { rows: updated } = await client.query('SELECT * FROM parts WHERE id = $1', [part.id]);
    return updated[0];
  });
  res.status(201).json(result);
}));

partsRouter.get('/:id/movements', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const { rows } = await query(
    `SELECT im.*, u.name AS user_name, wo.number AS work_order_number
     FROM inventory_movements im
     LEFT JOIN users u ON u.id = im.created_by
     LEFT JOIN work_orders wo ON wo.id = im.work_order_id
     WHERE im.part_id = $1 AND im.workshop_id = $2
     ORDER BY im.created_at DESC LIMIT 200`,
    [req.params.id, req.auth.workshopId]);
  res.json({ data: rows, total: rows.length });
}));

// ── Compras a proveedor (entran al inventario) ────────────────────────────
export const purchasesRouter = Router();

purchasesRouter.get('/', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT p.*, s.name AS supplier_name FROM purchases p
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     WHERE p.workshop_id = $1 ORDER BY p.purchased_at DESC LIMIT 200`,
    [req.auth.workshopId]);
  res.json({ data: rows, total: rows.length });
}));

purchasesRouter.post('/', requireRole('warehouse'), wrap(async (req, res) => {
  const data = validate(req.body, {
    supplier_id: { type: 'string', max: 40 },
    reference:   { type: 'string', max: 120 },
    notes:       { type: 'string', max: 1000 },
    items:       { type: 'array', required: true }
  });
  if (!data.items.length) throw badRequest('La compra no tiene ítems');

  const purchase = await transaction(async (client) => {
    await assertDelTaller('suppliers', data.supplier_id, req.auth.workshopId, client);
    const { rows: [created] } = await client.query(
      `INSERT INTO purchases (workshop_id, supplier_id, reference, notes, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.auth.workshopId, data.supplier_id || null, data.reference || null,
       data.notes || null, req.auth.userId]);

    let total = 0;
    for (const raw of data.items) {
      const item = validate(raw, {
        part_id:     { type: 'string', max: 40 },
        description: { type: 'string', max: 300 },
        quantity:    { type: 'number', required: true, min: 0.01 },
        unit_cost:   { type: 'number', required: true, min: 0 }
      });

      let description = item.description;
      if (item.part_id) {
        const { rows } = await client.query(
          'SELECT name FROM parts WHERE id = $1 AND workshop_id = $2',
          [item.part_id, req.auth.workshopId]);
        if (!rows[0]) throw notFound('Repuesto no encontrado en el inventario');
        description = description || rows[0].name;
      }
      if (!description) throw badRequest('Cada ítem necesita descripción o repuesto');

      await client.query(
        `INSERT INTO purchase_items (purchase_id, part_id, description, quantity, unit_cost)
         VALUES ($1,$2,$3,$4,$5)`,
        [created.id, item.part_id || null, description, item.quantity, item.unit_cost]);

      if (item.part_id) {
        await moveStock(client, {
          workshopId: req.auth.workshopId, partId: item.part_id, purchaseId: created.id,
          delta: item.quantity, unitCost: item.unit_cost,
          reason: `Compra ${data.reference || ''}`.trim(), userId: req.auth.userId });
        await client.query('UPDATE parts SET cost = $1, updated_at = NOW() WHERE id = $2',
          [item.unit_cost, item.part_id]);
      }
      total += item.quantity * item.unit_cost;
    }

    const { rows: [updated] } = await client.query(
      'UPDATE purchases SET total = $1 WHERE id = $2 RETURNING *', [total, created.id]);
    const { rows: items } = await client.query(
      'SELECT * FROM purchase_items WHERE purchase_id = $1', [created.id]);
    return { ...updated, items };
  });
  res.status(201).json(purchase);
}));

// ── Reglas de mantenimiento ───────────────────────────────────────────────
export const maintenanceRouter = crudRouter({
  table: 'maintenance_rules',
  schema: {
    name:          { type: 'string', required: true, max: 160 },
    brand:         { type: 'string', max: 60 },
    model:         { type: 'string', max: 80 },
    interval_km:   { type: 'number', integer: true, min: 0 },
    interval_days: { type: 'number', integer: true, min: 0 },
    description:   { type: 'string', max: 1000 },
    active:        { type: 'boolean', default: true }
  },
  searchColumns: ['name', 'brand', 'model'],
  orderBy: 'name ASC'
});
