// Fotografías y documentos de la recepción, el diagnóstico y la entrega.
//
// El almacenamiento es en disco local bajo UPLOADS_DIR: no ata el producto a
// ningún proveedor de nube. Cambiar a S3 o similar es sustituir este módulo.
import { Router } from 'express';
import multer from 'multer';
import { mkdirSync, createReadStream, existsSync, unlinkSync } from 'node:fs';
import { join, extname, resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { query, queryOne } from '../db.js';
import { validate, assertUuid } from '../lib/validate.js';
import { wrap, notFound, badRequest } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';
import { config } from '../config.js';

const ENTITIES = ['work_order', 'motorcycle', 'customer', 'diagnostic', 'quote'];
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    // Un directorio por taller: nadie sirve archivos de otro por accidente.
    const dir = join(resolve(config.uploads.dir), req.auth.workshopId);
    mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const ext = extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `${randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: config.uploads.maxBytes, files: 10 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(badRequest(`Tipo de archivo no permitido: ${file.mimetype}`));
    }
    cb(null, true);
  }
});

export const attachmentsRouter = Router();

attachmentsRouter.post('/', upload.array('files', 10), wrap(async (req, res) => {
  const data = validate(req.body, {
    entity_type: { type: 'string', required: true, enum: ENTITIES },
    entity_id:   { type: 'string', required: true, max: 40 },
    kind:        { type: 'string', enum: ['photo', 'document', 'signature'], default: 'photo' },
    stage:       { type: 'string', max: 40 },
    caption:     { type: 'string', max: 300 }
  });
  assertUuid(data.entity_id, 'entity_id');
  if (!req.files?.length) throw badRequest('No enviaste ningún archivo');

  const saved = [];
  for (const file of req.files) {
    const row = await queryOne(
      `INSERT INTO attachments
         (workshop_id, entity_type, entity_id, kind, stage, filename, mime_type,
          size_bytes, storage_path, caption, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, entity_type, entity_id, kind, stage, filename, mime_type,
                 size_bytes, caption, created_at`,
      [req.auth.workshopId, data.entity_type, data.entity_id, data.kind,
       data.stage || null, file.originalname, file.mimetype, file.size,
       join(req.auth.workshopId, basename(file.path)), data.caption || null, req.auth.userId]);
    saved.push(row);
  }
  res.status(201).json({ data: saved, total: saved.length });
}));

attachmentsRouter.get('/', wrap(async (req, res) => {
  const { entity_type, entity_id } = req.query;
  if (!entity_type || !entity_id) throw badRequest('Indica entity_type y entity_id');
  assertUuid(entity_id, 'entity_id');

  const { rows } = await query(
    `SELECT id, entity_type, entity_id, kind, stage, filename, mime_type,
            size_bytes, caption, created_at
     FROM attachments WHERE workshop_id = $1 AND entity_type = $2 AND entity_id = $3
     ORDER BY created_at`,
    [req.auth.workshopId, entity_type, entity_id]);
  res.json({ data: rows, total: rows.length });
}));

attachmentsRouter.get('/:id/file', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const row = await queryOne(
    'SELECT * FROM attachments WHERE id = $1 AND workshop_id = $2',
    [req.params.id, req.auth.workshopId]);
  if (!row) throw notFound('Archivo no encontrado');

  const path = join(resolve(config.uploads.dir), row.storage_path);
  // El path viene de la base, pero se comprueba igual: nunca se sirve nada
  // fuera del directorio de subidas.
  if (!path.startsWith(resolve(config.uploads.dir)) || !existsSync(path)) {
    throw notFound('El archivo ya no está disponible');
  }
  res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.filename)}"`);
  createReadStream(path).pipe(res);
}));

// Borrar es sólo del dueño y de recepción. Las fotos de entrada son la prueba
// del taller si el cliente reclama un rayón: el mecánico al que le achacan el
// daño no puede ser quien las quita.
attachmentsRouter.delete('/:id', requireRole('reception'), wrap(async (req, res) => {
  assertUuid(req.params.id);
  const row = await queryOne(
    'DELETE FROM attachments WHERE id = $1 AND workshop_id = $2 RETURNING storage_path',
    [req.params.id, req.auth.workshopId]);
  if (!row) throw notFound('Archivo no encontrado');

  const path = join(resolve(config.uploads.dir), row.storage_path);
  if (path.startsWith(resolve(config.uploads.dir)) && existsSync(path)) unlinkSync(path);
  res.status(204).end();
}));
