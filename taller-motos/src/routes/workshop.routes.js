// Configuración del taller (spec §3: empresa, impuestos, parámetros).
import { Router } from 'express';
import multer from 'multer';
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { queryOne, transaction } from '../db.js';
import { validate } from '../lib/validate.js';
import { wrap, badRequest, conflict } from '../lib/errors.js';
import { requireRole, requirePlan } from '../middleware/auth.js';
import { listNumberingRanges } from '../lib/factus.js';
import { tipoCodigo, revisar, MOTIVOS, venceEl } from '../lib/licencia.js';
import { config } from '../config.js';

export const workshopRouter = Router();

const LOGO_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!LOGO_MIME.includes(file.mimetype)) {
      return cb(badRequest(`Tipo de imagen no permitido: ${file.mimetype}`));
    }
    cb(null, true);
  }
});

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

// Cambiar de plan (o extender la licencia) de un taller que ya existe, con
// un código nuevo. Mismo mecanismo que el registro (auth.routes.js) —
// código corto (llave de consulta contra license_codes) o largo
// (autocontenido, firmado) — aplicado a un taller existente en vez de crear
// uno. El taller se lleva su código actual como referencia hasta que activa
// uno nuevo, que lo reemplaza entero (plan, vigencia, titular).
workshopRouter.post('/license', requireRole(), wrap(async (req, res) => {
  const data = validate(req.body, {
    license_code: { type: 'string', required: true, max: 600 }
  });

  const tipo = tipoCodigo(data.license_code);
  let licencia = null;
  let codigoCorto = null;

  if (tipo === 'corto') {
    codigoCorto = await queryOne(
      'SELECT * FROM license_codes WHERE upper(code) = upper($1)', [data.license_code.trim()]);
    if (!codigoCorto) throw badRequest(MOTIVOS.firma);
    if (codigoCorto.used_by_workshop_id) throw conflict(MOTIVOS.usado);
    if (codigoCorto.expires_at && new Date(codigoCorto.expires_at) < new Date()) {
      throw badRequest(MOTIVOS.vencido);
    }
    licencia = {
      t: codigoCorto.holder,
      p: codigoCorto.plan,
      e: codigoCorto.expires_at ? Math.floor(new Date(codigoCorto.expires_at).getTime() / 1000) : null
    };
  } else if (tipo === 'largo') {
    const revision = revisar(data.license_code, config.license.publicKey);
    if (!revision.valido) throw badRequest(MOTIVOS[revision.motivo] || MOTIVOS.firma);
    licencia = revision.datos;

    const yaUsado = await queryOne('SELECT id FROM workshops WHERE license_id = $1', [licencia.id]);
    if (yaUsado) throw conflict(MOTIVOS.usado);
  } else {
    throw badRequest(MOTIVOS.formato);
  }

  let workshop;
  try {
    workshop = await transaction(async (client) => {
      // Mismo resguardo que en el registro: el UPDATE con la condición
      // (no un SELECT previo) es lo que impide que dos activaciones a la
      // vez con el mismo código corto se lo lleven ambas.
      if (codigoCorto) {
        const { rowCount } = await client.query(
          `UPDATE license_codes SET used_by_workshop_id = $1, used_at = NOW()
           WHERE id = $2 AND used_by_workshop_id IS NULL`,
          [req.auth.workshopId, codigoCorto.id]
        );
        if (rowCount === 0) throw conflict(MOTIVOS.usado);
      }

      const { rows: [row] } = await client.query(
        `UPDATE workshops SET
           license_code = $1, license_id = $2, license_holder = $3,
           license_plan = $4, license_expires_at = $5, updated_at = NOW()
         WHERE id = $6 RETURNING *`,
        [data.license_code, licencia.id || codigoCorto?.id || null, licencia.t || null,
         licencia.p, venceEl(licencia), req.auth.workshopId]
      );
      return row;
    });
  } catch (err) {
    // Igual que en el registro: dos activaciones a la vez con el mismo
    // código largo pueden pasar el SELECT de "no usado" las dos; el índice
    // único de la base es la última barrera.
    if (err?.code === '23505' && err?.constraint === 'workshops_license_id_key') {
      throw conflict(MOTIVOS.usado);
    }
    throw err;
  }

  res.json(redact(workshop));
}));

// Logo del taller: un solo archivo por taller (se reemplaza el anterior si
// ya había uno), servido sin autenticación en /api/public/workshop/:id/logo
// para que aparezca en la factura impresa y en las páginas públicas del
// cliente (seguimiento, cotizaciones) sin pedirle que inicie sesión.
workshopRouter.post('/logo', requireRole(), logoUpload.single('logo'), wrap(async (req, res) => {
  if (!req.file) throw badRequest('No enviaste ninguna imagen');

  const dir = join(resolve(config.uploads.dir), req.auth.workshopId);
  mkdirSync(dir, { recursive: true });
  // Se borra cualquier logo.* anterior: sólo hay uno vigente por taller.
  for (const name of readdirSync(dir)) {
    if (name.startsWith('logo.')) unlinkSync(join(dir, name));
  }
  const ext = extname(req.file.originalname).toLowerCase() || '.png';
  const filename = `logo${ext}`;
  writeFileSync(join(dir, filename), req.file.buffer);

  const row = await queryOne(
    `UPDATE workshops SET logo_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [filename, req.auth.workshopId]);
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
