// Gestión del equipo del taller. Sólo el administrador crea o modifica
// usuarios; cualquiera puede consultar la lista de mecánicos para asignar
// trabajos.
import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { hashPassword } from '../lib/auth.js';
import { validate, assertUuid } from '../lib/validate.js';
import { wrap, notFound, conflict, badRequest } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';
import { publicUser } from './auth.routes.js';

export const usersRouter = Router();

const ROLES = ['admin', 'reception', 'mechanic', 'warehouse', 'cashier'];

usersRouter.get('/', wrap(async (req, res) => {
  const params = [req.auth.workshopId];
  let where = 'workshop_id = $1';
  if (req.query.role) { params.push(req.query.role); where += ` AND role = $${params.length}`; }
  if (req.query.active !== undefined && req.query.active !== '') {
    params.push(req.query.active === 'true');
    where += ` AND active = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT * FROM users WHERE ${where} ORDER BY name`, params);
  res.json({ data: rows.map(publicUser), total: rows.length });
}));

usersRouter.post('/', requireRole(), wrap(async (req, res) => {
  const data = validate(req.body, {
    name:        { type: 'string', required: true, max: 120 },
    email:       { type: 'email',  required: true },
    password:    { type: 'string', required: true, min: 8, max: 100 },
    role:        { type: 'string', required: true, enum: ROLES },
    phone:       { type: 'string', max: 40 },
    specialty:   { type: 'string', max: 120 },
    hourly_rate: { type: 'number', min: 0 }
  });

  const exists = await queryOne('SELECT id FROM users WHERE lower(email) = lower($1)', [data.email]);
  if (exists) throw conflict('Ese correo ya está registrado');

  const row = await queryOne(
    `INSERT INTO users (workshop_id, name, email, password_hash, role, phone, specialty, hourly_rate)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.auth.workshopId, data.name, data.email, await hashPassword(data.password),
     data.role, data.phone || null, data.specialty || null, data.hourly_rate ?? null]);
  res.status(201).json(publicUser(row));
}));

usersRouter.patch('/:id', requireRole(), wrap(async (req, res) => {
  assertUuid(req.params.id);
  const data = validate(req.body, {
    name:        { type: 'string', max: 120 },
    role:        { type: 'string', enum: ROLES },
    phone:       { type: 'string', max: 40 },
    specialty:   { type: 'string', max: 120 },
    hourly_rate: { type: 'number', min: 0 },
    active:      { type: 'boolean' },
    password:    { type: 'string', min: 8, max: 100 }
  });

  // El administrador no puede desactivarse ni degradarse a sí mismo: dejaría
  // al taller sin nadie que administre.
  if (req.params.id === req.auth.userId) {
    if (data.active === false) throw badRequest('No puedes desactivar tu propio usuario');
    if (data.role && data.role !== 'admin') throw badRequest('No puedes quitarte el rol de administrador');
  }

  if (data.password) {
    data.password_hash = await hashPassword(data.password);
    delete data.password;
  }
  const keys = Object.keys(data);
  if (!keys.length) throw badRequest('No enviaste ningún campo para actualizar');

  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  const values = keys.map((k) => data[k]);
  values.push(req.params.id, req.auth.workshopId);

  const row = await queryOne(
    `UPDATE users SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length - 1} AND workshop_id = $${values.length} RETURNING *`, values);
  if (!row) throw notFound('Usuario no encontrado');
  res.json(publicUser(row));
}));
