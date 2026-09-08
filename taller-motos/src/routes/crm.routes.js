// CRM (plan Premium): embudo de prospectos, bitácora de contacto y
// recordatorios de seguimiento — todo lo comercial que pasa antes (o
// aparte) de que exista una orden de trabajo.
import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { crudRouter } from '../lib/crud.js';
import { validate, assertUuid } from '../lib/validate.js';
import { wrap, notFound, badRequest } from '../lib/errors.js';
import { assertDelTaller } from '../lib/pertenencia.js';

export const crmRouter = Router();

const STAGES = ['new', 'contacted', 'interested', 'quoted', 'won', 'lost'];
const CHANNELS = ['call', 'whatsapp', 'visit', 'email', 'other'];

// ── Prospectos ────────────────────────────────────────────────────────────
const leadsRouter = crudRouter({
  table: 'leads',
  schema: {
    customer_id:  { type: 'string', max: 40 },
    name:         { type: 'string', required: true, max: 160 },
    phone:        { type: 'string', max: 40 },
    email:        { type: 'string', max: 160 },
    source:       { type: 'string', max: 80 },
    interest:     { type: 'string', max: 300 },
    stage:        { type: 'string', enum: STAGES, default: 'new' },
    lost_reason:  { type: 'string', max: 300 },
    assigned_to:  { type: 'string', max: 40 }
  },
  searchColumns: ['name', 'phone', 'email', 'interest'],
  filters: { stage: 'stage', assigned_to: 'assigned_to' },
  references: { customer_id: 'customers', assigned_to: 'users' },
  orderBy: 'created_at DESC'
});
crmRouter.use('/leads', leadsRouter);

// ── Bitácora de contacto de un prospecto ─────────────────────────────────
crmRouter.get('/leads/:leadId/contacts', wrap(async (req, res) => {
  await assertDelTaller('leads', req.params.leadId, req.auth.workshopId);
  const { rows } = await query(
    `SELECT c.*, u.name AS created_by_name FROM contact_log c
     LEFT JOIN users u ON u.id = c.created_by
     WHERE c.lead_id = $1 ORDER BY c.created_at DESC`,
    [req.params.leadId]);
  res.json({ data: rows, total: rows.length });
}));

crmRouter.post('/leads/:leadId/contacts', wrap(async (req, res) => {
  await assertDelTaller('leads', req.params.leadId, req.auth.workshopId);
  const data = validate(req.body, {
    channel: { type: 'string', enum: CHANNELS, default: 'call' },
    note:    { type: 'string', required: true, max: 1000 }
  });
  const row = await queryOne(
    `INSERT INTO contact_log (workshop_id, lead_id, channel, note, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.auth.workshopId, req.params.leadId, data.channel, data.note, req.auth.userId]
  );
  res.status(201).json(row);
}));

// ── Recordatorios de seguimiento ─────────────────────────────────────────
crmRouter.get('/leads/:leadId/follow-ups', wrap(async (req, res) => {
  await assertDelTaller('leads', req.params.leadId, req.auth.workshopId);
  const { rows } = await query(
    `SELECT * FROM follow_ups WHERE lead_id = $1 ORDER BY due_at`, [req.params.leadId]);
  res.json({ data: rows, total: rows.length });
}));

crmRouter.post('/leads/:leadId/follow-ups', wrap(async (req, res) => {
  await assertDelTaller('leads', req.params.leadId, req.auth.workshopId);
  const data = validate(req.body, {
    note:        { type: 'string', required: true, max: 500 },
    due_at:      { type: 'date', required: true },
    assigned_to: { type: 'string', max: 40 }
  });
  if (data.assigned_to) await assertDelTaller('users', data.assigned_to, req.auth.workshopId);
  const row = await queryOne(
    `INSERT INTO follow_ups (workshop_id, lead_id, note, due_at, assigned_to)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.auth.workshopId, req.params.leadId, data.note, data.due_at, data.assigned_to || null]
  );
  res.status(201).json(row);
}));

// Vista global: todos los recordatorios del taller, para el widget de
// "seguimientos pendientes" sin tener que abrir prospecto por prospecto.
crmRouter.get('/follow-ups', wrap(async (req, res) => {
  const params = [req.auth.workshopId];
  const where = ['f.workshop_id = $1'];

  if (req.query.done !== undefined) {
    params.push(req.query.done === 'true');
    where.push(`f.done = $${params.length}`);
  }
  if (req.query.due === 'overdue') where.push(`f.due_at < NOW() AND f.done = FALSE`);
  if (req.query.due === 'today') where.push(`f.due_at::date = CURRENT_DATE AND f.done = FALSE`);

  const { rows } = await query(
    `SELECT f.*, l.name AS lead_name, l.phone AS lead_phone FROM follow_ups f
     JOIN leads l ON l.id = f.lead_id
     WHERE ${where.join(' AND ')} ORDER BY f.due_at LIMIT 200`,
    params);
  res.json({ data: rows, total: rows.length });
}));

crmRouter.patch('/follow-ups/:id', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const data = validate(req.body, { done: { type: 'boolean' } });
  if (data.done === undefined) throw badRequest('No enviaste ningún campo para actualizar');

  const row = await queryOne(
    `UPDATE follow_ups SET done = $1, done_at = CASE WHEN $1 THEN NOW() ELSE NULL END
     WHERE id = $2 AND workshop_id = $3 RETURNING *`,
    [data.done, req.params.id, req.auth.workshopId]
  );
  if (!row) throw notFound();
  res.json(row);
}));

crmRouter.delete('/follow-ups/:id', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const row = await queryOne(
    `DELETE FROM follow_ups WHERE id = $1 AND workshop_id = $2 RETURNING id`,
    [req.params.id, req.auth.workshopId]
  );
  if (!row) throw notFound();
  res.status(204).end();
}));

// ── Embudo: cuántos prospectos hay en cada etapa ─────────────────────────
crmRouter.get('/summary', wrap(async (req, res) => {
  const w = [req.auth.workshopId];
  const [byStage, overdue, today] = await Promise.all([
    query(`SELECT stage, COUNT(*)::int AS count FROM leads WHERE workshop_id = $1 GROUP BY stage`, w),
    query(`SELECT COUNT(*)::int AS count FROM follow_ups
           WHERE workshop_id = $1 AND done = FALSE AND due_at < NOW()`, w),
    query(`SELECT COUNT(*)::int AS count FROM follow_ups
           WHERE workshop_id = $1 AND done = FALSE AND due_at::date = CURRENT_DATE`, w)
  ]);

  const counts = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (const row of byStage.rows) counts[row.stage] = row.count;

  res.json({
    funnel: STAGES.map((stage) => ({ stage, count: counts[stage] })),
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    follow_ups_overdue: overdue.rows[0].count,
    follow_ups_today: today.rows[0].count
  });
}));
