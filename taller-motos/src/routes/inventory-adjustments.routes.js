// Ajustes de inventario en lote: un solo documento con el conteo físico de
// varios repuestos a la vez (un conteo de bodega), en vez de tener que
// entrar repuesto por repuesto a "Movimiento". Cada línea sigue generando
// su propio movimiento en inventory_movements, igual que un ajuste manual.
import { Router } from 'express';
import { query, transaction, nextSequence } from '../db.js';
import { validate, assertUuid } from '../lib/validate.js';
import { wrap, notFound, badRequest } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';
import { moveStock, warehouseStock } from '../services/workorders.js';
import { assertDelTaller } from '../lib/pertenencia.js';

export const inventoryAdjustmentsRouter = Router();

async function loadFullAdjustment(client, workshopId, id) {
  const { rows: [adjustment] } = await client.query(
    `SELECT a.*, u.name AS created_by_name FROM inventory_adjustments a
     LEFT JOIN users u ON u.id = a.created_by
     WHERE a.id = $1 AND a.workshop_id = $2`, [id, workshopId]);
  if (!adjustment) throw notFound('Ajuste no encontrado');

  const { rows: items } = await client.query(
    `SELECT i.*, p.name AS part_name, p.sku AS part_sku
     FROM inventory_adjustment_items i JOIN parts p ON p.id = i.part_id
     WHERE i.adjustment_id = $1 ORDER BY p.name`, [id]);
  return { ...adjustment, items };
}

inventoryAdjustmentsRouter.get('/', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT a.*, u.name AS created_by_name,
            (SELECT COUNT(*) FROM inventory_adjustment_items i WHERE i.adjustment_id = a.id)::int AS item_count
     FROM inventory_adjustments a LEFT JOIN users u ON u.id = a.created_by
     WHERE a.workshop_id = $1 ORDER BY a.created_at DESC LIMIT 300`,
    [req.auth.workshopId]);
  res.json({ data: rows, total: rows.length });
}));

inventoryAdjustmentsRouter.get('/:id', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const adjustment = await transaction((client) => loadFullAdjustment(client, req.auth.workshopId, req.params.id));
  res.json(adjustment);
}));

inventoryAdjustmentsRouter.post('/', requireRole('warehouse', 'reception'), wrap(async (req, res) => {
  const data = validate(req.body, {
    reason:       { type: 'string', max: 300 },
    warehouse_id: { type: 'string', max: 40 },
    items:        { type: 'array', required: true }
  });
  if (!data.items.length) throw badRequest('El ajuste no tiene ítems');

  const adjustment = await transaction(async (client) => {
    if (data.warehouse_id) await assertDelTaller('warehouses', data.warehouse_id, req.auth.workshopId, client);
    const num = await nextSequence(client, req.auth.workshopId, 'inventory_adjustments');
    const { rows: [created] } = await client.query(
      `INSERT INTO inventory_adjustments (workshop_id, number, reason, warehouse_id, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.auth.workshopId, num, data.reason || null, data.warehouse_id || null, req.auth.userId]);

    for (const raw of data.items) {
      const item = validate(raw, {
        part_id:       { type: 'string', required: true, max: 40 },
        counted_stock: { type: 'number', required: true, min: 0 }
      });

      const { rows } = await client.query(
        'SELECT * FROM parts WHERE id = $1 AND workshop_id = $2 FOR UPDATE',
        [item.part_id, req.auth.workshopId]);
      const part = rows[0];
      if (!part) throw notFound('Repuesto no encontrado en el inventario');

      // Contra el total si el ajuste no dice sucursal (el caso de siempre,
      // con una sola); contra esa sucursal puntual si sí la dice.
      const previousStock = data.warehouse_id
        ? await warehouseStock(client, item.part_id, data.warehouse_id)
        : Number(part.stock);
      const delta = item.counted_stock - previousStock;

      await client.query(
        `INSERT INTO inventory_adjustment_items (adjustment_id, part_id, previous_stock, counted_stock, delta)
         VALUES ($1,$2,$3,$4,$5)`,
        [created.id, item.part_id, previousStock, item.counted_stock, delta]);

      if (delta !== 0) {
        await moveStock(client, {
          workshopId: req.auth.workshopId, partId: item.part_id, adjustmentId: created.id,
          warehouseId: data.warehouse_id, delta, unitCost: part.cost,
          reason: data.reason ? `Ajuste #${num}: ${data.reason}` : `Ajuste de inventario #${num}`,
          userId: req.auth.userId
        });
      }
    }

    return loadFullAdjustment(client, req.auth.workshopId, created.id);
  });
  res.status(201).json(adjustment);
}));
