import { query } from '../db.js';
import { crudRouter } from '../lib/crud.js';
import { wrap } from '../lib/errors.js';

export const appointmentsRouter = crudRouter({
  table: 'appointments',
  schema: {
    customer_id:      { type: 'string', max: 40 },
    motorcycle_id:    { type: 'string', max: 40 },
    scheduled_at:     { type: 'date', required: true },
    duration_minutes: { type: 'number', integer: true, min: 5, default: 60 },
    reason:           { type: 'string', max: 500 },
    status:           { type: 'string', enum: ['scheduled','confirmed','arrived','no_show','cancelled','done'], default: 'scheduled' },
    notes:            { type: 'string', max: 1000 }
  },
  searchColumns: ['reason', 'notes'],
  filters: { status: 'status', customer_id: 'customer_id' },
  orderBy: 'scheduled_at ASC'
});

// Agenda de un rango de fechas, con los datos que la recepción necesita ver.
appointmentsRouter.get('/calendar/range', wrap(async (req, res) => {
  const from = req.query.from || new Date().toISOString().slice(0, 10);
  const to = req.query.to || from;

  const { rows } = await query(
    `SELECT a.*, c.name AS customer_name, c.phone AS customer_phone,
            m.plate, m.brand, m.model
     FROM appointments a
     LEFT JOIN customers c   ON c.id = a.customer_id
     LEFT JOIN motorcycles m ON m.id = a.motorcycle_id
     WHERE a.workshop_id = $1
       AND a.scheduled_at >= $2::date
       AND a.scheduled_at < ($3::date + INTERVAL '1 day')
     ORDER BY a.scheduled_at`,
    [req.auth.workshopId, from, to]);
  res.json({ data: rows, total: rows.length, from, to });
}));
