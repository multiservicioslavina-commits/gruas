// Configuración del taller (spec §3: empresa, impuestos, parámetros).
import { Router } from 'express';
import { queryOne } from '../db.js';
import { validate } from '../lib/validate.js';
import { wrap, badRequest } from '../lib/errors.js';
import { requireRole, requirePlan } from '../middleware/auth.js';
import { listNumberingRanges } from '../lib/factus.js';

export const workshopRouter = Router();

// El token de WhatsApp y las credenciales de Factus no deben volver al
// navegador: sólo el servidor los necesita para llamar a esas APIs.
function redact(workshop) {
  const { whatsapp_access_token, factus_client_secret, factus_password, ...rest } = workshop;
  return {
    ...rest,
    whatsapp_configured: Boolean(whatsapp_access_token),
    factus_configured: Boolean(factus_client_secret && factus_password)
  };
}

workshopRouter.get('/', wrap(async (req, res) => {
  const workshop = await queryOne('SELECT * FROM workshops WHERE id = $1', [req.auth.workshopId]);
  res.json(redact(workshop));
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
    settings:   { type: 'object' },
    whatsapp_mode:            { type: 'string', enum: ['off', 'ridera', 'own'] },
    whatsapp_phone_number_id: { type: 'string', max: 60 },
    whatsapp_access_token:    { type: 'string', max: 500 },
    factus_client_id:         { type: 'string', max: 200 },
    factus_client_secret:     { type: 'string', max: 500 },
    factus_username:          { type: 'string', max: 160 },
    factus_password:          { type: 'string', max: 200 },
    factus_environment:       { type: 'string', enum: ['sandbox', 'production'] },
    factus_numbering_range_id: { type: 'number', integer: true, min: 1 }
  });
  const keys = Object.keys(data);
  if (!keys.length) throw badRequest('No enviaste ningún campo para actualizar');

  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  const values = keys.map((k) => (k === 'settings' ? JSON.stringify(data[k]) : data[k]));
  values.push(req.auth.workshopId);

  const row = await queryOne(
    `UPDATE workshops SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length} RETURNING *`, values);
  res.json(redact(row));
}));

// Rangos de numeración (resoluciones DIAN) que el taller tiene registrados
// en Factus, para elegir con cuál factura. Se piden con las credenciales ya
// guardadas: si aún no las guardó, factus.js explica qué falta.
workshopRouter.get('/factus/numbering-ranges', requireRole(), requirePlan('premium'), wrap(async (req, res) => {
  const workshop = await queryOne('SELECT * FROM workshops WHERE id = $1', [req.auth.workshopId]);
  const ranges = await listNumberingRanges(workshop);
  res.json(ranges.data?.data || ranges.data || []);
}));
