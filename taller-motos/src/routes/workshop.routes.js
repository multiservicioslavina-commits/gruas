// Configuración del taller (spec §3: empresa, impuestos, parámetros).
import { Router } from 'express';
import { queryOne } from '../db.js';
import { validate } from '../lib/validate.js';
import { wrap, badRequest } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';

export const workshopRouter = Router();

workshopRouter.get('/', wrap(async (req, res) => {
  const workshop = await queryOne('SELECT * FROM workshops WHERE id = $1', [req.auth.workshopId]);
  res.json(workshop);
}));

workshopRouter.patch('/', requireRole(), wrap(async (req, res) => {
  const data = validate(req.body, {
    name:       { type: 'string', max: 160 },
    legal_name: { type: 'string', max: 200 },
    tax_id:     { type: 'string', max: 40 },
    phone:      { type: 'string', max: 40 },
    email:      { type: 'string', max: 160 },
    address:    { type: 'string', max: 200 },
    city:       { type: 'string', max: 80 },
    country:    { type: 'string', max: 4 },
    currency:   { type: 'string', max: 5 },
    tax_rate:   { type: 'number', min: 0, max: 100 },
    timezone:   { type: 'string', max: 60 },
    logo_url:   { type: 'string', max: 500 },
    settings:   { type: 'object' }
  });
  const keys = Object.keys(data);
  if (!keys.length) throw badRequest('No enviaste ningún campo para actualizar');

  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  const values = keys.map((k) => (k === 'settings' ? JSON.stringify(data[k]) : data[k]));
  values.push(req.auth.workshopId);

  const row = await queryOne(
    `UPDATE workshops SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length} RETURNING *`, values);
  res.json(row);
}));
