// Fábrica de rutas CRUD para los recursos simples (clientes, repuestos,
// proveedores, servicios...).
//
// Además de ahorrar repetición, deja el filtro multi-tenant en un solo sitio:
// toda consulta lleva `workshop_id = $n` con el taller del token, así ninguna
// ruta puede olvidarlo y exponer datos de otro taller.
import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { validate, assertUuid } from './validate.js';
import { wrap, notFound, conflict } from './errors.js';

function isUniqueViolation(err) { return err?.code === '23505'; }

export function crudRouter({
  table,
  schema,                 // reglas de validación para crear
  updateSchema,           // reglas para actualizar (por defecto, las de crear sin `required`)
  searchColumns = [],     // columnas que barre el parámetro ?search=
  orderBy = 'created_at DESC',
  filters = {},           // { queryParam: 'columna' } para filtros exactos
  duplicateMessage = 'Ya existe un registro con esos datos',
  afterCreate,            // hook(row, req) opcional
  hidden = []             // columnas que nunca se devuelven
}) {
  const router = Router();
  const relaxed = updateSchema || Object.fromEntries(
    Object.entries(schema).map(([k, rule]) => [k, { ...rule, required: false }])
  );
  const strip = (row) => {
    if (!row || !hidden.length) return row;
    const copy = { ...row };
    for (const key of hidden) delete copy[key];
    return copy;
  };

  router.get('/', wrap(async (req, res) => {
    const params = [req.auth.workshopId];
    const where = [`workshop_id = $1`];

    if (req.query.search && searchColumns.length) {
      params.push(`%${String(req.query.search).trim()}%`);
      const idx = params.length;
      where.push('(' + searchColumns.map((c) => `${c} ILIKE $${idx}`).join(' OR ') + ')');
    }
    for (const [param, column] of Object.entries(filters)) {
      if (req.query[param] !== undefined && req.query[param] !== '') {
        params.push(req.query[param]);
        where.push(`${column} = $${params.length}`);
      }
    }
    if (req.query.active !== undefined && req.query.active !== '') {
      params.push(req.query.active === 'true');
      where.push(`active = $${params.length}`);
    }

    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    params.push(limit, offset);

    const { rows } = await query(
      `SELECT * FROM ${table} WHERE ${where.join(' AND ')}
       ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const { rows: [{ count }] } = await query(
      `SELECT COUNT(*)::int AS count FROM ${table} WHERE ${where.join(' AND ')}`,
      params.slice(0, params.length - 2)
    );
    res.json({ data: rows.map(strip), total: count, limit, offset });
  }));

  router.get('/:id', wrap(async (req, res) => {
    assertUuid(req.params.id);
    const row = await queryOne(`SELECT * FROM ${table} WHERE id = $1 AND workshop_id = $2`,
      [req.params.id, req.auth.workshopId]);
    if (!row) throw notFound();
    res.json(strip(row));
  }));

  router.post('/', wrap(async (req, res) => {
    const data = validate(req.body, schema);
    const keys = Object.keys(data);
    const columns = ['workshop_id', ...keys];
    const values = [req.auth.workshopId, ...keys.map((k) => data[k])];
    const placeholders = values.map((_, i) => `$${i + 1}`);

    let row;
    try {
      row = await queryOne(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        values
      );
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict(duplicateMessage);
      throw err;
    }
    if (afterCreate) await afterCreate(row, req);
    res.status(201).json(strip(row));
  }));

  router.patch('/:id', wrap(async (req, res) => {
    assertUuid(req.params.id);
    const data = validate(req.body, relaxed);
    const keys = Object.keys(data);
    if (!keys.length) throw conflict('No enviaste ningún campo para actualizar');

    const sets = keys.map((k, i) => `${k} = $${i + 1}`);
    const values = keys.map((k) => data[k]);
    values.push(req.params.id, req.auth.workshopId);

    let row;
    try {
      row = await queryOne(
        `UPDATE ${table} SET ${sets.join(', ')}, updated_at = NOW()
         WHERE id = $${values.length - 1} AND workshop_id = $${values.length} RETURNING *`,
        values
      );
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict(duplicateMessage);
      throw err;
    }
    if (!row) throw notFound();
    res.json(strip(row));
  }));

  router.delete('/:id', wrap(async (req, res) => {
    assertUuid(req.params.id);
    const row = await queryOne(
      `DELETE FROM ${table} WHERE id = $1 AND workshop_id = $2 RETURNING id`,
      [req.params.id, req.auth.workshopId]
    );
    if (!row) throw notFound();
    res.status(204).end();
  }));

  return router;
}
