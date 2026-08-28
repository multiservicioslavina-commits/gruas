import { query, queryOne } from '../db.js';
import { crudRouter } from '../lib/crud.js';
import { assertUuid } from '../lib/validate.js';
import { wrap, notFound } from '../lib/errors.js';

const schema = {
  customer_id:   { type: 'string', max: 40 },
  plate:         { type: 'string', required: true, max: 12, uppercase: true },
  brand:         { type: 'string', max: 60 },
  model:         { type: 'string', max: 80 },
  year:          { type: 'number', integer: true, min: 1900, max: 2100 },
  engine_size:   { type: 'string', max: 20 },
  vin:           { type: 'string', max: 40 },
  engine_number: { type: 'string', max: 40 },
  color:         { type: 'string', max: 40 },
  mileage:       { type: 'number', integer: true, min: 0 },
  notes:         { type: 'string', max: 2000 },
  photo_url:     { type: 'string', max: 500 }
};

export const motorcyclesRouter = crudRouter({
  table: 'motorcycles',
  schema,
  searchColumns: ['plate', 'brand', 'model', 'vin'],
  filters: { customer_id: 'customer_id' },
  references: { customer_id: 'customers' },
  orderBy: 'plate ASC',
  duplicateMessage: 'Ya tienes una moto registrada con esa placa'
});

// Historial de servicio de la moto (spec §10): todo lo que se le ha hecho.
motorcyclesRouter.get('/:id/history', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const moto = await queryOne('SELECT * FROM motorcycles WHERE id = $1 AND workshop_id = $2',
    [req.params.id, req.auth.workshopId]);
  if (!moto) throw notFound('Moto no encontrada');

  const { rows } = await query(
    `SELECT * FROM service_history
     WHERE motorcycle_id = $1 AND workshop_id = $2
     ORDER BY received_at DESC`,
    [moto.id, req.auth.workshopId]
  );
  const customer = moto.customer_id
    ? await queryOne('SELECT * FROM customers WHERE id = $1 AND workshop_id = $2',
        [moto.customer_id, req.auth.workshopId])
    : null;

  res.json({ motorcycle: moto, customer, history: rows });
}));

// Búsqueda rápida por placa: es como el taller identifica una moto.
motorcyclesRouter.get('/by-plate/:plate', wrap(async (req, res) => {
  const plate = String(req.params.plate).toUpperCase().replace(/\s/g, '');
  const moto = await queryOne(
    `SELECT m.*, c.name AS customer_name, c.phone AS customer_phone
     FROM motorcycles m LEFT JOIN customers c ON c.id = m.customer_id
     WHERE m.workshop_id = $1 AND upper(replace(m.plate, ' ', '')) = $2`,
    [req.auth.workshopId, plate]
  );
  if (!moto) throw notFound('No hay ninguna moto con esa placa');
  res.json(moto);
}));
