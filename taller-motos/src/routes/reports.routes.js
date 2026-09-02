// Panel principal (spec §11) y reportes (spec §3).
import { Router } from 'express';
import { query } from '../db.js';
import { wrap } from '../lib/errors.js';
import { requirePlan } from '../middleware/auth.js';
import { OPEN_STATUSES } from '../services/workorders.js';

export const reportsRouter = Router();

// Todo lo que el taller necesita ver al abrir por la mañana.
reportsRouter.get('/dashboard', wrap(async (req, res) => {
  const w = [req.auth.workshopId];

  const [counts, todayAppointments, ready, lowStock, byMechanic, cash, recent] = await Promise.all([
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status = ANY($2))                      AS open_orders,
         COUNT(*) FILTER (WHERE status = 'received')                   AS received,
         COUNT(*) FILTER (WHERE status = 'diagnosing')                 AS diagnosing,
         COUNT(*) FILTER (WHERE status IN ('quoted','pending_approval')) AS awaiting_approval,
         COUNT(*) FILTER (WHERE status IN ('repairing','waiting_parts')) AS in_progress,
         COUNT(*) FILTER (WHERE status = 'ready')                      AS ready_for_pickup,
         COUNT(*) FILTER (WHERE received_at >= date_trunc('day', NOW())) AS received_today,
         COALESCE(SUM(total - paid_total) FILTER (WHERE status <> 'cancelled' AND total > paid_total), 0) AS receivable
       FROM work_orders WHERE workshop_id = $1`, [...w, OPEN_STATUSES]),

    query(
      `SELECT a.*, c.name AS customer_name, m.plate FROM appointments a
       LEFT JOIN customers c ON c.id = a.customer_id
       LEFT JOIN motorcycles m ON m.id = a.motorcycle_id
       WHERE a.workshop_id = $1
         AND a.scheduled_at >= date_trunc('day', NOW())
         AND a.scheduled_at <  date_trunc('day', NOW()) + INTERVAL '1 day'
         AND a.status NOT IN ('cancelled','done')
       ORDER BY a.scheduled_at`, w),

    query(
      `SELECT wo.id, wo.number, wo.public_code, wo.status, wo.total, wo.paid_total,
              wo.received_at, wo.promised_at, m.plate, c.name AS customer_name, c.phone
       FROM work_orders wo
       LEFT JOIN motorcycles m ON m.id = wo.motorcycle_id
       LEFT JOIN customers c   ON c.id = wo.customer_id
       WHERE wo.workshop_id = $1 AND wo.status = 'ready'
       ORDER BY wo.received_at`, w),

    query(
      `SELECT id, name, sku, stock, min_stock FROM parts
       WHERE workshop_id = $1 AND active AND stock <= min_stock
       ORDER BY (min_stock - stock) DESC LIMIT 15`, w),

    query(
      `SELECT u.id, u.name, COUNT(wo.id)::int AS open_orders
       FROM users u LEFT JOIN work_orders wo
         ON wo.mechanic_id = u.id AND wo.status = ANY($2)
       WHERE u.workshop_id = $1 AND u.role = 'mechanic' AND u.active
       GROUP BY u.id, u.name ORDER BY u.name`, [...w, OPEN_STATUSES]),

    query(
      `SELECT COALESCE(SUM(amount), 0) AS today,
              COUNT(*)::int AS payments
       FROM payments
       WHERE workshop_id = $1 AND created_at >= date_trunc('day', NOW())`, w),

    query(
      `SELECT wo.id, wo.number, wo.status, wo.received_at, wo.total,
              m.plate, m.brand, m.model, c.name AS customer_name, c.phone
       FROM work_orders wo
       LEFT JOIN motorcycles m ON m.id = wo.motorcycle_id
       LEFT JOIN customers c   ON c.id = wo.customer_id
       WHERE wo.workshop_id = $1 AND wo.status = ANY($2)
       ORDER BY wo.received_at DESC LIMIT 20`, [...w, OPEN_STATUSES])
  ]);

  res.json({
    counters: counts.rows[0],
    cash_today: cash.rows[0],
    appointments_today: todayAppointments.rows,
    ready_for_pickup: ready.rows,
    low_stock: lowStock.rows,
    mechanics: byMechanic.rows,
    open_orders: recent.rows
  });
}));

// Reporte de un periodo: ventas, servicios, inventario y productividad.
// Es el módulo de análisis, parte del plan Completo en adelante; el panel
// de arriba (lo esencial del día a día) queda abierto para todos.
reportsRouter.get('/summary', requirePlan('completo'), wrap(async (req, res) => {
  const from = req.query.from || new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const range = [req.auth.workshopId, from, to];

  const [sales, byStatus, topServices, topParts, mechanics, inventory, receivable] =
    await Promise.all([
      query(
        `SELECT COUNT(*)::int AS orders,
                COALESCE(SUM(total), 0)        AS invoiced,
                COALESCE(SUM(labor_total), 0)  AS labor,
                COALESCE(SUM(parts_total), 0)  AS parts,
                COALESCE(SUM(discount), 0)     AS discounts,
                COALESCE(SUM(tax_total), 0)    AS taxes,
                COALESCE(AVG(total), 0)        AS average_ticket
         FROM work_orders
         WHERE workshop_id = $1 AND status <> 'cancelled'
           AND received_at >= $2::date AND received_at < ($3::date + INTERVAL '1 day')`, range),

      query(
        `SELECT status, COUNT(*)::int AS count FROM work_orders
         WHERE workshop_id = $1
           AND received_at >= $2::date AND received_at < ($3::date + INTERVAL '1 day')
         GROUP BY status ORDER BY count DESC`, range),

      query(
        `SELECT s.description, SUM(s.quantity)::numeric AS quantity,
                SUM(s.quantity * s.unit_price) AS revenue
         FROM work_order_services s
         JOIN work_orders wo ON wo.id = s.work_order_id
         WHERE s.workshop_id = $1 AND s.approved AND wo.status <> 'cancelled'
           AND wo.received_at >= $2::date AND wo.received_at < ($3::date + INTERVAL '1 day')
         GROUP BY s.description ORDER BY revenue DESC LIMIT 10`, range),

      query(
        `SELECT p.description, SUM(p.quantity)::numeric AS quantity,
                SUM(p.quantity * p.unit_price) AS revenue,
                SUM(p.quantity * (p.unit_price - p.unit_cost)) AS margin
         FROM work_order_parts p
         JOIN work_orders wo ON wo.id = p.work_order_id
         WHERE p.workshop_id = $1 AND p.approved AND wo.status <> 'cancelled'
           AND wo.received_at >= $2::date AND wo.received_at < ($3::date + INTERVAL '1 day')
         GROUP BY p.description ORDER BY revenue DESC LIMIT 10`, range),

      query(
        `SELECT u.id, u.name,
                COUNT(DISTINCT wo.id)::int AS orders,
                COALESCE(SUM(s.quantity * s.unit_price), 0) AS labor_billed
         FROM users u
         LEFT JOIN work_orders wo ON wo.mechanic_id = u.id
           AND wo.received_at >= $2::date AND wo.received_at < ($3::date + INTERVAL '1 day')
           AND wo.status <> 'cancelled'
         LEFT JOIN work_order_services s ON s.work_order_id = wo.id AND s.approved
         WHERE u.workshop_id = $1 AND u.role = 'mechanic'
         GROUP BY u.id, u.name ORDER BY labor_billed DESC`, range),

      query(
        `SELECT COUNT(*)::int AS items,
                COALESCE(SUM(stock * cost), 0)  AS cost_value,
                COALESCE(SUM(stock * price), 0) AS retail_value,
                COUNT(*) FILTER (WHERE stock <= min_stock)::int AS below_minimum
         FROM parts WHERE workshop_id = $1 AND active`, [req.auth.workshopId]),

      query(
        `SELECT COALESCE(SUM(total - paid_total), 0) AS amount, COUNT(*)::int AS orders
         FROM work_orders
         WHERE workshop_id = $1 AND status <> 'cancelled' AND total > paid_total`,
        [req.auth.workshopId])
    ]);

  const payments = await query(
    `SELECT method, COALESCE(SUM(amount), 0) AS amount, COUNT(*)::int AS count
     FROM payments
     WHERE workshop_id = $1 AND created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day')
     GROUP BY method ORDER BY amount DESC`, range);

  res.json({
    from, to,
    sales: sales.rows[0],
    orders_by_status: byStatus.rows,
    top_services: topServices.rows,
    top_parts: topParts.rows,
    mechanics: mechanics.rows,
    inventory: inventory.rows[0],
    receivable: receivable.rows[0],
    payments_by_method: payments.rows
  });
}));

// Cartera pendiente, para llamar a cobrar.
reportsRouter.get('/receivables', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT wo.id, wo.number, wo.status, wo.received_at, wo.delivered_at,
            wo.total, wo.paid_total, (wo.total - wo.paid_total) AS balance,
            c.name AS customer_name, c.phone AS customer_phone, m.plate
     FROM work_orders wo
     LEFT JOIN customers c   ON c.id = wo.customer_id
     LEFT JOIN motorcycles m ON m.id = wo.motorcycle_id
     WHERE wo.workshop_id = $1 AND wo.status <> 'cancelled' AND wo.total > wo.paid_total
     ORDER BY wo.received_at`, [req.auth.workshopId]);
  res.json({ data: rows, total: rows.length });
}));

// Motos que ya deberían volver, por kilometraje o por tiempo (spec §16).
reportsRouter.get('/maintenance-due', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT DISTINCT ON (wo.motorcycle_id)
            wo.motorcycle_id, wo.number, wo.received_at, wo.next_service_date,
            wo.next_service_mileage, m.plate, m.brand, m.model, m.mileage,
            c.name AS customer_name, c.phone AS customer_phone
     FROM work_orders wo
     JOIN motorcycles m    ON m.id = wo.motorcycle_id
     LEFT JOIN customers c ON c.id = wo.customer_id
     WHERE wo.workshop_id = $1
       AND (wo.next_service_date IS NOT NULL OR wo.next_service_mileage IS NOT NULL)
       AND wo.status IN ('delivered','closed')
     ORDER BY wo.motorcycle_id, wo.received_at DESC`, [req.auth.workshopId]);

  const today = new Date();
  const due = rows.filter((r) =>
    (r.next_service_date && new Date(r.next_service_date) <= today) ||
    (r.next_service_mileage && r.mileage && Number(r.mileage) >= Number(r.next_service_mileage)));

  res.json({ data: due, total: due.length, upcoming: rows.length });
}));
