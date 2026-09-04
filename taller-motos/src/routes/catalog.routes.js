// Catálogo del taller: servicios (mano de obra), repuestos, proveedores,
// compras y reglas de mantenimiento.
import { Router } from 'express';
import multer from 'multer';
import { query, queryOne, transaction } from '../db.js';
import { crudRouter } from '../lib/crud.js';
import { validate, assertUuid } from '../lib/validate.js';
import { wrap, notFound, badRequest, conflict } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';
import { moveStock, defaultWarehouseId, warehouseStock } from '../services/workorders.js';
import { assertDelTaller } from '../lib/pertenencia.js';

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Mismo dialecto que arma export.routes.js: separado por ";", comillas
// dobles para escapar (y "" para una comilla literal dentro del campo).
function parseCsv(texto) {
  const limpio = texto.replace(/^﻿/, '');
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (entreComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') { campo += '"'; i++; } else entreComillas = false;
      } else campo += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ';') { fila.push(campo); campo = ''; }
    else if (c === '\r') { /* se ignora, \n cierra la fila */ }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((v) => v.trim() !== ''));
}

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

// ── Sucursales / bodegas ──────────────────────────────────────────────────
export const warehousesRouter = crudRouter({
  table: 'warehouses',
  schema: {
    name:   { type: 'string', required: true, max: 120 },
    active: { type: 'boolean', default: true }
  },
  updateSchema: {
    name:   { type: 'string', max: 120 },
    active: { type: 'boolean' }
  },
  searchColumns: ['name'],
  orderBy: 'is_default DESC, name ASC',
  beforeUpdate: async (data, req) => {
    if (data.active === false) {
      const { rows } = await query('SELECT is_default FROM warehouses WHERE id = $1', [req.params.id]);
      if (rows[0]?.is_default) throw conflict('La sucursal Principal no se puede desactivar');
    }
  },
  beforeDelete: async (req) => {
    const { rows } = await query(
      'SELECT is_default FROM warehouses WHERE id = $1 AND workshop_id = $2', [req.params.id, req.auth.workshopId]);
    if (!rows[0]) return; // no existe: el DELETE genérico responde el 404
    if (rows[0].is_default) throw conflict('La sucursal Principal no se puede eliminar');
    const { rows: conStock } = await query(
      `SELECT 1 FROM part_stock WHERE warehouse_id = $1 AND stock <> 0 LIMIT 1`, [req.params.id]);
    if (conStock[0]) throw conflict('Esta sucursal todavía tiene existencia; trasládala antes de eliminarla');
  }
});

// ── Repuestos e inventario ────────────────────────────────────────────────
export const partsRouter = crudRouter({
  table: 'parts',
  schema: {
    supplier_id: { type: 'string', max: 40 },
    sku:         { type: 'string', max: 60 },
    barcode:     { type: 'string', max: 60 },
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
  // warehouse_id: en qué sucursal cae la existencia inicial al crear el
  // repuesto. Se valida pero no es columna de `parts` (el catálogo es de
  // todo el taller, no de una sucursal) — afterCreate la usa y la descarta.
  transient: {
    warehouse_id: { type: 'string', max: 40 }
  },
  searchColumns: ['name', 'sku', 'barcode', 'brand', 'category', 'location'],
  filters: { category: 'category', supplier_id: 'supplier_id' },
  references: { supplier_id: 'suppliers' },
  orderBy: 'name ASC',
  duplicateMessage: 'Ya existe un repuesto con ese SKU o código de barras',

  afterCreate: async (row, req, data) => {
    let warehouseId = data.warehouse_id
      ? (await query('SELECT id FROM warehouses WHERE id = $1 AND workshop_id = $2 AND active',
          [data.warehouse_id, req.auth.workshopId])).rows[0]?.id
      : null;
    if (!warehouseId) {
      warehouseId = (await query('SELECT id FROM warehouses WHERE workshop_id = $1 AND is_default',
        [req.auth.workshopId])).rows[0]?.id;
    }
    if (!warehouseId) return; // taller sin sucursal principal: dato roto, nada que hacer acá
    await query(
      `INSERT INTO part_stock (workshop_id, part_id, warehouse_id, stock, min_stock)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (part_id, warehouse_id) DO UPDATE SET stock = $4, min_stock = $5, updated_at = NOW()`,
      [req.auth.workshopId, row.id, warehouseId, row.stock, row.min_stock]);
  },

  // Editar la existencia a mano desde "Editar repuesto" sólo tiene sentido
  // con una única sucursal (ahí, esa sucursal es todo el inventario). Con
  // varias, hay que decir de cuál: eso ya lo resuelven Movimiento y Traslado.
  beforeUpdate: async (data, req) => {
    if (!('stock' in data) && !('min_stock' in data)) return;
    const { rows } = await query(
      'SELECT COUNT(*)::int AS n FROM warehouses WHERE workshop_id = $1 AND active', [req.auth.workshopId]);
    if (rows[0].n > 1) {
      throw badRequest('Con varias sucursales activas, cambia la existencia desde "Movimiento" (elige la '
        + 'sucursal) o "Traslado" — no editando el repuesto directamente.');
    }
  },
  afterUpdate: async (row, req, data) => {
    if (!('stock' in data) && !('min_stock' in data)) return;
    const warehouseId = (await query('SELECT id FROM warehouses WHERE workshop_id = $1 AND is_default',
      [req.auth.workshopId])).rows[0]?.id;
    if (!warehouseId) return;
    await query(
      `INSERT INTO part_stock (workshop_id, part_id, warehouse_id, stock, min_stock)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (part_id, warehouse_id) DO UPDATE SET stock = $4, min_stock = $5, updated_at = NOW()`,
      [req.auth.workshopId, row.id, warehouseId, row.stock, row.min_stock]);
  }
});

// ── Compatibilidad por modelo de moto ──────────────────────────────────────
// A qué marca/línea/años aplica cada repuesto — el diferencial que piden los
// almacenes de repuestos y accesorios frente a un inventario genérico.
export const partFitmentsRouter = crudRouter({
  table: 'part_fitments',
  schema: {
    part_id:   { type: 'string', required: true, max: 40 },
    brand:     { type: 'string', required: true, max: 60 },
    model:     { type: 'string', required: true, max: 80 },
    year_from: { type: 'number', integer: true, min: 1900, max: 2100 },
    year_to:   { type: 'number', integer: true, min: 1900, max: 2100 }
  },
  filters: { part_id: 'part_id' },
  references: { part_id: 'parts' },
  orderBy: 'brand ASC, model ASC, year_from ASC'
});

// Carga masiva desde un CSV — el mismo formato que descarga
// GET /export/inventario.csv, para poder editarlo en Excel y volver a
// subirlo. Empareja por SKU: si ya existe uno con ese SKU en el taller,
// lo actualiza; si no, lo crea. Sin SKU, siempre crea uno nuevo (no hay
// con qué emparejar). Los cambios de existencia pasan por moveStock(),
// igual que una compra o un ajuste manual, para no perder el rastro en
// inventory_movements.
partsRouter.post('/import', requireRole('warehouse'), csvUpload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw badRequest('No enviaste ningún archivo');
  const filas = parseCsv(req.file.buffer.toString('utf8'));
  if (filas.length < 2) throw badRequest('El archivo no tiene filas de datos');

  const encabezado = filas[0].map((h) => h.trim().toLowerCase());
  const col = (...nombres) => nombres.map((n) => encabezado.indexOf(n)).find((i) => i !== -1) ?? -1;
  const c = {
    nombre: col('nombre'), sku: col('sku'), categoria: col('categoría', 'categoria'),
    marca: col('marca'), costo: col('costo'), precio: col('precio'),
    existencia: col('existencia'), minimo: col('mínimo', 'minimo'),
    ubicacion: col('ubicación', 'ubicacion'), proveedor: col('proveedor')
  };
  if (c.nombre === -1) throw badRequest('El archivo debe tener una columna "Nombre"');

  const { rows: proveedores } = await query(
    'SELECT id, name FROM suppliers WHERE workshop_id = $1', [req.auth.workshopId]);
  const proveedorPorNombre = new Map(proveedores.map((p) => [p.name.toLowerCase(), p.id]));
  const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

  let creados = 0;
  let actualizados = 0;
  const errores = [];
  const skusDeEstaCarga = new Map(); // sku -> id, para no chocar entre filas del mismo archivo

  await transaction(async (client) => {
    for (let i = 1; i < filas.length; i++) {
      const f = filas[i];
      const nombre = (f[c.nombre] || '').trim();
      if (!nombre) { errores.push(`Fila ${i + 1}: falta el nombre`); continue; }
      const sku = c.sku !== -1 ? (f[c.sku] || '').trim() : '';

      let existenteId = sku ? skusDeEstaCarga.get(sku) : null;
      if (!existenteId && sku) {
        const { rows: encontrado } = await client.query(
          'SELECT id FROM parts WHERE workshop_id = $1 AND sku = $2', [req.auth.workshopId, sku]);
        existenteId = encontrado[0]?.id || null;
      }

      const supplierId = c.proveedor !== -1 && f[c.proveedor]
        ? proveedorPorNombre.get(f[c.proveedor].trim().toLowerCase()) || null : null;
      const costo = c.costo !== -1 ? num(f[c.costo]) : null;
      const existencia = c.existencia !== -1 ? num(f[c.existencia]) : null;

      if (existenteId) {
        const campos = {
          name: nombre, sku: sku || null,
          category: c.categoria !== -1 ? (f[c.categoria] || null) : undefined,
          brand: c.marca !== -1 ? (f[c.marca] || null) : undefined,
          cost: costo !== null ? costo : undefined,
          price: c.precio !== -1 ? num(f[c.precio]) : undefined,
          min_stock: c.minimo !== -1 ? num(f[c.minimo]) : undefined,
          location: c.ubicacion !== -1 ? (f[c.ubicacion] || null) : undefined,
          supplier_id: supplierId
        };
        const entradas = Object.entries(campos).filter(([, v]) => v !== undefined);
        if (entradas.length) {
          const sets = entradas.map(([k], idx) => `${k} = $${idx + 1}`);
          const values = entradas.map(([, v]) => v);
          values.push(existenteId, req.auth.workshopId);
          await client.query(
            `UPDATE parts SET ${sets.join(', ')}, updated_at = NOW()
             WHERE id = $${values.length - 1} AND workshop_id = $${values.length}`, values);
        }
        if (existencia !== null) {
          const { rows: [actual] } = await client.query('SELECT stock, cost FROM parts WHERE id = $1', [existenteId]);
          const delta = existencia - Number(actual.stock);
          if (delta !== 0) {
            await moveStock(client, {
              workshopId: req.auth.workshopId, partId: existenteId, delta,
              unitCost: costo ?? actual.cost, reason: 'Carga masiva de inventario', userId: req.auth.userId
            });
          }
        }
        if (sku) skusDeEstaCarga.set(sku, existenteId);
        actualizados++;
      } else {
        const { rows: [nuevo] } = await client.query(
          `INSERT INTO parts (workshop_id, name, sku, category, brand, cost, price, min_stock, location, supplier_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [req.auth.workshopId, nombre, sku || null,
           c.categoria !== -1 ? (f[c.categoria] || null) : null,
           c.marca !== -1 ? (f[c.marca] || null) : null,
           costo || 0, c.precio !== -1 ? (num(f[c.precio]) || 0) : 0,
           c.minimo !== -1 ? (num(f[c.minimo]) || 0) : 0,
           c.ubicacion !== -1 ? (f[c.ubicacion] || null) : null, supplierId]);
        if (existencia) {
          await moveStock(client, {
            workshopId: req.auth.workshopId, partId: nuevo.id, delta: existencia,
            unitCost: costo || 0, reason: 'Carga masiva de inventario', userId: req.auth.userId
          });
        }
        if (sku) skusDeEstaCarga.set(sku, nuevo.id);
        creados++;
      }
    }
  });

  res.json({ creados, actualizados, errores });
}));

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

// Existencia de un repuesto desglosada por sucursal.
partsRouter.get('/:id/stock', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const part = await queryOne('SELECT id FROM parts WHERE id = $1 AND workshop_id = $2',
    [req.params.id, req.auth.workshopId]);
  if (!part) throw notFound('Repuesto no encontrado');

  const { rows } = await query(
    `SELECT w.id AS warehouse_id, w.name AS warehouse_name, w.is_default,
            COALESCE(ps.stock, 0) AS stock, COALESCE(ps.min_stock, 0) AS min_stock
     FROM warehouses w
     LEFT JOIN part_stock ps ON ps.warehouse_id = w.id AND ps.part_id = $1
     WHERE w.workshop_id = $2 AND w.active
     ORDER BY w.is_default DESC, w.name ASC`,
    [req.params.id, req.auth.workshopId]);
  res.json({ data: rows, total: rows.length });
}));

// Traslada existencia de una sucursal a otra del mismo taller.
partsRouter.post('/:id/transfer', requireRole('warehouse'), wrap(async (req, res) => {
  assertUuid(req.params.id);
  const data = validate(req.body, {
    from_warehouse_id: { type: 'string', required: true, max: 40 },
    to_warehouse_id:   { type: 'string', required: true, max: 40 },
    quantity:          { type: 'number', required: true, min: 0.01 },
    notes:             { type: 'string', max: 300 }
  });
  if (data.from_warehouse_id === data.to_warehouse_id) {
    throw badRequest('Elige dos sucursales distintas');
  }

  const result = await transaction(async (client) => {
    await assertDelTaller('warehouses', data.from_warehouse_id, req.auth.workshopId, client);
    await assertDelTaller('warehouses', data.to_warehouse_id, req.auth.workshopId, client);

    const { rows } = await client.query('SELECT * FROM parts WHERE id = $1 AND workshop_id = $2 FOR UPDATE',
      [req.params.id, req.auth.workshopId]);
    const part = rows[0];
    if (!part) throw notFound('Repuesto no encontrado');

    const disponible = await warehouseStock(client, part.id, data.from_warehouse_id);
    if (disponible < data.quantity) {
      throw conflict(`Sólo hay ${disponible} unidades de "${part.name}" en esa sucursal.`);
    }

    const reason = `Traslado entre sucursales${data.notes ? `: ${data.notes}` : ''}`;
    await moveStock(client, {
      workshopId: req.auth.workshopId, partId: part.id, warehouseId: data.from_warehouse_id,
      delta: -data.quantity, unitCost: part.cost, reason, userId: req.auth.userId
    });
    await moveStock(client, {
      workshopId: req.auth.workshopId, partId: part.id, warehouseId: data.to_warehouse_id,
      delta: data.quantity, unitCost: part.cost, reason, userId: req.auth.userId
    });
    const { rows: [transfer] } = await client.query(
      `INSERT INTO stock_transfers (workshop_id, part_id, from_warehouse_id, to_warehouse_id, quantity, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.auth.workshopId, part.id, data.from_warehouse_id, data.to_warehouse_id,
       data.quantity, data.notes || null, req.auth.userId]);
    return transfer;
  });
  res.status(201).json(result);
}));

// Entrada, salida o ajuste manual de inventario.
partsRouter.post('/:id/movements', requireRole('warehouse', 'reception'), wrap(async (req, res) => {
  assertUuid(req.params.id);
  const data = validate(req.body, {
    type:         { type: 'string', required: true, enum: ['in', 'out', 'adjust'] },
    quantity:     { type: 'number', required: true },
    unit_cost:    { type: 'number', min: 0 },
    reason:       { type: 'string', max: 300 },
    warehouse_id: { type: 'string', max: 40 }
  });
  if (data.type !== 'adjust' && data.quantity <= 0) {
    throw badRequest('La cantidad debe ser mayor que cero');
  }

  const result = await transaction(async (client) => {
    if (data.warehouse_id) await assertDelTaller('warehouses', data.warehouse_id, req.auth.workshopId, client);
    const { rows } = await client.query(
      'SELECT * FROM parts WHERE id = $1 AND workshop_id = $2 FOR UPDATE',
      [req.params.id, req.auth.workshopId]);
    const part = rows[0];
    if (!part) throw notFound('Repuesto no encontrado');

    // En un ajuste, `quantity` es el conteo físico real: el movimiento es la
    // diferencia contra lo que había — en esa sucursal si se eligió una, o
    // contra el total si no (el caso de siempre, con una sola sucursal).
    const base = data.type === 'adjust' && data.warehouse_id
      ? await warehouseStock(client, part.id, data.warehouse_id)
      : Number(part.stock);
    const delta = data.type === 'in'  ? data.quantity
                : data.type === 'out' ? -data.quantity
                : data.quantity - base;

    if (delta !== 0) {
      await moveStock(client, {
        workshopId: req.auth.workshopId, partId: part.id, warehouseId: data.warehouse_id, delta,
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
    supplier_id:  { type: 'string', max: 40 },
    reference:    { type: 'string', max: 120 },
    notes:        { type: 'string', max: 1000 },
    warehouse_id: { type: 'string', max: 40 },
    items:        { type: 'array', required: true }
  });
  if (!data.items.length) throw badRequest('La compra no tiene ítems');

  const purchase = await transaction(async (client) => {
    await assertDelTaller('suppliers', data.supplier_id, req.auth.workshopId, client);
    if (data.warehouse_id) await assertDelTaller('warehouses', data.warehouse_id, req.auth.workshopId, client);
    const { rows: [created] } = await client.query(
      `INSERT INTO purchases (workshop_id, supplier_id, reference, notes, warehouse_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.auth.workshopId, data.supplier_id || null, data.reference || null,
       data.notes || null, data.warehouse_id || null, req.auth.userId]);

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
          warehouseId: data.warehouse_id, delta: item.quantity, unitCost: item.unit_cost,
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
