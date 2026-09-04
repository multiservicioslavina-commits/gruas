// Ventas de mostrador (todos los planes): vender un repuesto o accesorio
// directo, sin que pase por una orden de trabajo. Se cobra al momento y
// descuenta inventario igual que un repuesto cargado a una orden.
import { Router } from 'express';
import { query, queryOne, transaction, nextSequence } from '../db.js';
import { validate, assertUuid } from '../lib/validate.js';
import { wrap, notFound, badRequest, conflict } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';
import { computeTotals } from '../lib/money.js';
import { moveStock, warehouseStock } from '../services/workorders.js';
import { assertDelTaller } from '../lib/pertenencia.js';

export const salesRouter = Router();

const METHODS = ['cash', 'transfer', 'card', 'nequi', 'daviplata', 'other'];

export async function loadFullSale(client, workshopId, id) {
  const { rows: [sale] } = await client.query(
    `SELECT s.*, c.name AS customer_name_saved, c.phone AS customer_phone,
            u.name AS created_by_name
     FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
     LEFT JOIN users u ON u.id = s.created_by
     WHERE s.id = $1 AND s.workshop_id = $2`, [id, workshopId]);
  if (!sale) throw notFound('Venta no encontrada');

  const { rows: items } = await client.query(
    'SELECT * FROM sale_items WHERE sale_id = $1 ORDER BY id', [id]);
  const { rows: invoices } = await client.query(
    'SELECT id, number, kind, status, total, external_id, cufe, issued_at, created_at FROM invoices WHERE sale_id = $1 ORDER BY created_at DESC',
    [id]);
  for (const invoice of invoices) {
    invoice.doc_code = invoice.kind === 'electronic'
      ? invoice.external_id : `10-${String(invoice.number).padStart(6, '0')}`;
  }
  return { ...sale, items, invoices };
}

salesRouter.get('/', wrap(async (req, res) => {
  const params = [req.auth.workshopId];
  const where = ['s.workshop_id = $1'];
  if (req.query.from) { params.push(req.query.from); where.push(`s.created_at::date >= $${params.length}`); }
  if (req.query.to)   { params.push(req.query.to);   where.push(`s.created_at::date <= $${params.length}`); }
  if (req.query.search) {
    params.push(`%${req.query.search}%`);
    // unaccent() en los nombres, para que "jose" encuentre "José".
    where.push(`(s.number::text ILIKE $${params.length} OR unaccent(c.name) ILIKE unaccent($${params.length})
                 OR unaccent(s.customer_name) ILIKE unaccent($${params.length}))`);
  }

  const { rows } = await query(
    `SELECT s.*, c.name AS customer_name_saved,
            (SELECT COUNT(*) FROM sale_items i WHERE i.sale_id = s.id)::int AS item_count
     FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
     WHERE ${where.join(' AND ')} ORDER BY s.created_at DESC LIMIT 300`,
    params);
  res.json({ data: rows, total: rows.length });
}));

salesRouter.get('/:id', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const sale = await transaction((client) => loadFullSale(client, req.auth.workshopId, req.params.id));
  res.json(sale);
}));

salesRouter.post('/', requireRole('cashier'), wrap(async (req, res) => {
  const data = validate(req.body, {
    customer_id:     { type: 'string', max: 40 },
    customer_name:   { type: 'string', max: 160 },
    discount:        { type: 'number', min: 0, default: 0 },
    tax_rate:        { type: 'number', min: 0, max: 100, default: 0 },
    payment_method:  { type: 'string', enum: METHODS, default: 'cash' },
    warehouse_id:    { type: 'string', max: 40 },
    items:           { type: 'array', required: true }
  });
  if (!data.items.length) throw badRequest('La venta no tiene ítems');

  const sale = await transaction(async (client) => {
    if (data.customer_id) {
      const { rows } = await client.query(
        'SELECT id FROM customers WHERE id = $1 AND workshop_id = $2', [data.customer_id, req.auth.workshopId]);
      if (!rows[0]) throw notFound('Cliente no encontrado');
    }
    if (data.warehouse_id) await assertDelTaller('warehouses', data.warehouse_id, req.auth.workshopId, client);

    const items = [];
    let partsTotal = 0;
    for (const raw of data.items) {
      const item = validate(raw, {
        part_id:     { type: 'string', max: 40 },
        description: { type: 'string', max: 300 },
        quantity:    { type: 'number', required: true, min: 0.01 },
        unit_price:  { type: 'number', min: 0 }
      });

      let description = item.description;
      let unitPrice = item.unit_price;
      if (item.part_id) {
        const { rows } = await client.query(
          'SELECT * FROM parts WHERE id = $1 AND workshop_id = $2 FOR UPDATE', [item.part_id, req.auth.workshopId]);
        const part = rows[0];
        if (!part) throw notFound('Repuesto no encontrado en el inventario');
        // Contra esa sucursal si se eligió una; contra el total si no (el
        // caso de siempre, con una sola sucursal).
        const disponible = data.warehouse_id
          ? await warehouseStock(client, part.id, data.warehouse_id)
          : Number(part.stock);
        if (disponible < item.quantity) {
          throw conflict(`Sólo quedan ${disponible} unidades de "${part.name}".`);
        }
        description = description || part.name;
        unitPrice = unitPrice ?? Number(part.price);
      }
      if (!description) throw badRequest('Cada ítem necesita descripción o repuesto');
      if (unitPrice === undefined || unitPrice === null) throw badRequest('Cada ítem necesita un precio');

      items.push({ part_id: item.part_id || null, description, quantity: item.quantity, unit_price: unitPrice });
      partsTotal += item.quantity * unitPrice;
    }

    const totales = computeTotals({
      laborTotal: 0, partsTotal, discount: data.discount, taxRate: data.tax_rate
    });

    const num = await nextSequence(client, req.auth.workshopId, 'sales');
    const { rows: [created] } = await client.query(
      `INSERT INTO sales (workshop_id, number, customer_id, customer_name, subtotal, discount,
                           tax_rate, tax_total, total, payment_method, warehouse_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.auth.workshopId, num, data.customer_id || null, data.customer_name || null,
       totales.subtotal, totales.discount, totales.tax_rate, totales.tax_total, totales.total,
       data.payment_method, data.warehouse_id || null, req.auth.userId]);

    for (const item of items) {
      await client.query(
        `INSERT INTO sale_items (sale_id, part_id, description, quantity, unit_price)
         VALUES ($1,$2,$3,$4,$5)`,
        [created.id, item.part_id, item.description, item.quantity, item.unit_price]);
      if (item.part_id) {
        await moveStock(client, {
          workshopId: req.auth.workshopId, partId: item.part_id, warehouseId: data.warehouse_id,
          delta: -item.quantity, unitCost: null, reason: `Venta de mostrador #${num}`, userId: req.auth.userId
        });
      }
    }

    return loadFullSale(client, req.auth.workshopId, created.id);
  });
  res.status(201).json(sale);
}));
