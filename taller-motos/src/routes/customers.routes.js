import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { crudRouter } from '../lib/crud.js';
import { assertUuid } from '../lib/validate.js';
import { wrap, notFound } from '../lib/errors.js';

const schema = {
  name:            { type: 'string', required: true, max: 160 },
  document_type:   { type: 'string', max: 20 },
  document_number: { type: 'string', max: 40 },
  phone:           { type: 'string', max: 40 },
  email:           { type: 'string', max: 160 },
  address:         { type: 'string', max: 200 },
  city:            { type: 'string', max: 80 },
  notes:           { type: 'string', max: 2000 }
};

export const customersRouter = crudRouter({
  table: 'customers',
  schema,
  searchColumns: ['name', 'phone', 'email', 'document_number'],
  orderBy: 'name ASC'
});

// Ficha completa: sus motos y sus órdenes.
customersRouter.get('/:id/detail', wrap(async (req, res) => {
  assertUuid(req.params.id);
  const customer = await queryOne('SELECT * FROM customers WHERE id = $1 AND workshop_id = $2',
    [req.params.id, req.auth.workshopId]);
  if (!customer) throw notFound('Cliente no encontrado');

  const { rows: motorcycles } = await query(
    'SELECT * FROM motorcycles WHERE customer_id = $1 AND workshop_id = $2 ORDER BY plate',
    [customer.id, req.auth.workshopId]
  );
  const { rows: orders } = await query(
    `SELECT wo.id, wo.number, wo.status, wo.received_at, wo.delivered_at, wo.total,
            wo.paid_total, wo.complaint, m.plate
     FROM work_orders wo LEFT JOIN motorcycles m ON m.id = wo.motorcycle_id
     WHERE wo.customer_id = $1 AND wo.workshop_id = $2
     ORDER BY wo.received_at DESC LIMIT 100`,
    [customer.id, req.auth.workshopId]
  );
  res.json({ ...customer, motorcycles, work_orders: orders });
}));
