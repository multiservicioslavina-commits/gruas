#!/usr/bin/env node
// Carga un taller de demostración con datos realistas, para probar el sistema
// sin capturar nada a mano. No usar en producción.
import { pool } from '../src/db.js';
import { hashPassword } from '../src/lib/auth.js';
import { publicCode } from '../src/lib/ids.js';

const EMAIL = process.env.SEED_EMAIL || 'admin@tallerdemo.test';
const PASSWORD = process.env.SEED_PASSWORD || 'demo12345';

const client = await pool.connect();
try {
  await client.query('BEGIN');

  const { rows: existing } = await client.query(
    'SELECT id FROM users WHERE lower(email) = lower($1)', [EMAIL]);
  if (existing.length) {
    console.log(`El taller de demostración ya existe (${EMAIL}). Nada que hacer.`);
    await client.query('ROLLBACK');
    process.exit(0);
  }

  const { rows: [workshop] } = await client.query(
    `INSERT INTO workshops (name, legal_name, phone, email, address, city, tax_rate)
     VALUES ('Taller Demo Motos', 'Taller Demo Motos S.A.S.', '+57 300 000 0000',
             $1, 'Cra 70 # 30-15', 'Medellín', 19)
     RETURNING *`, [EMAIL]);

  const hash = await hashPassword(PASSWORD);
  const users = {};
  for (const [role, name] of [
    ['admin', 'Ana Administradora'], ['reception', 'Rosa Recepción'],
    ['mechanic', 'Miguel Mecánico'], ['warehouse', 'Bruno Bodega'], ['cashier', 'Carla Caja']
  ]) {
    const email = role === 'admin' ? EMAIL : `${role}@tallerdemo.test`;
    const { rows } = await client.query(
      `INSERT INTO users (workshop_id, email, name, password_hash, role, specialty)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [workshop.id, email, name, hash, role, role === 'mechanic' ? 'Motor y transmisión' : null]);
    users[role] = rows[0];
  }

  const services = [
    ['MB-01', 'Mantenimiento básico', 'Aceite, filtro, revisión general', 65000, 60],
    ['SIN-01', 'Sincronización', 'Carburación y puesta a punto', 80000, 90],
    ['FRE-01', 'Cambio de pastillas de freno', null, 35000, 45],
    ['ARR-01', 'Cambio de kit de arrastre', null, 45000, 60],
    ['ELE-01', 'Revisión eléctrica', 'Diagnóstico de sistema eléctrico', 50000, 60]
  ];
  for (const [code, name, description, price, minutes] of services) {
    await client.query(
      `INSERT INTO services (workshop_id, code, name, description, price, estimated_minutes)
       VALUES ($1,$2,$3,$4,$5,$6)`, [workshop.id, code, name, description, price, minutes]);
  }

  const { rows: [supplier] } = await client.query(
    `INSERT INTO suppliers (workshop_id, name, phone, contact_name)
     VALUES ($1, 'Distribuidora de Repuestos del Valle', '+57 301 111 2222', 'Carlos Pérez')
     RETURNING *`, [workshop.id]);

  const parts = [
    ['BJ-NGK-01', 'Bujía NGK CR8E', 'Bujías', 'NGK', 9000, 18000, 24, 6, 'Estante A1'],
    ['FIL-AC-01', 'Filtro de aceite universal', 'Filtros', 'Genérico', 7000, 15000, 18, 5, 'Estante A2'],
    ['ACE-20W50', 'Aceite 20W50 mineral 1L', 'Lubricantes', 'Motul', 22000, 38000, 30, 10, 'Estante B1'],
    ['KIT-428', 'Kit de arrastre 428', 'Transmisión', 'DID', 95000, 165000, 5, 2, 'Estante C1'],
    ['PAS-FR-01', 'Pastillas de freno delanteras', 'Frenos', 'Brembo', 28000, 55000, 3, 4, 'Estante B3'],
    ['LLA-110', 'Llanta 110/80-17', 'Llantas', 'Pirelli', 145000, 230000, 2, 2, 'Bodega']
  ];
  const partIds = {};
  for (const [sku, name, category, brand, cost, price, stock, min, location] of parts) {
    const { rows } = await client.query(
      `INSERT INTO parts (workshop_id, supplier_id, sku, name, category, brand,
                          cost, price, stock, min_stock, location)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [workshop.id, supplier.id, sku, name, category, brand, cost, price, stock, min, location]);
    partIds[sku] = rows[0].id;
  }

  const customers = [
    ['Juan Motero', '3001234567', 'juan@correo.test', 'ABC12D', 'Yamaha', 'FZ 2.0', 2021, 24500],
    ['Marta Gómez', '3019876543', 'marta@correo.test', 'XYZ45E', 'Honda', 'CB 190R', 2020, 18300],
    ['Andrés Ruiz', '3105558899', null, 'JKL78F', 'Bajaj', 'Pulsar NS200', 2022, 9800]
  ];
  const motos = [];
  for (const [name, phone, email, plate, brand, model, year, mileage] of customers) {
    const { rows: [customer] } = await client.query(
      `INSERT INTO customers (workshop_id, name, phone, email) VALUES ($1,$2,$3,$4) RETURNING *`,
      [workshop.id, name, phone, email]);
    const { rows: [moto] } = await client.query(
      `INSERT INTO motorcycles (workshop_id, customer_id, plate, brand, model, year, mileage)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [workshop.id, customer.id, plate, brand, model, year, mileage]);
    motos.push({ customer, moto });
  }

  // Dos órdenes abiertas para que el panel muestre algo desde el primer día.
  let seq = 0;
  for (const [index, { customer, moto }] of motos.slice(0, 2).entries()) {
    seq += 1;
    const { rows: [order] } = await client.query(
      `INSERT INTO work_orders
         (workshop_id, number, public_code, customer_id, motorcycle_id, status, mechanic_id,
          received_by, mileage_in, fuel_level, complaint, tax_rate, promised_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'half',$10,19, NOW() + INTERVAL '1 day')
       RETURNING *`,
      [workshop.id, seq, publicCode(), customer.id, moto.id,
       index === 0 ? 'repairing' : 'diagnosing', users.mechanic.id, users.reception.id,
       moto.mileage, index === 0 ? 'Suena la cadena y pierde fuerza en subida'
                                 : 'No enciende en frío y se apaga en ralentí']);

    await client.query(
      `INSERT INTO work_order_status_history (workshop_id, work_order_id, status, changed_by)
       VALUES ($1,$2,'received',$3), ($1,$2,$4,$3)`,
      [workshop.id, order.id, users.reception.id, order.status]);

    if (index === 0) {
      await client.query(
        `INSERT INTO work_order_services
           (workshop_id, work_order_id, mechanic_id, description, quantity, unit_price)
         VALUES ($1,$2,$3,'Cambio de kit de arrastre',1,45000)`,
        [workshop.id, order.id, users.mechanic.id]);
      await client.query(
        `INSERT INTO work_order_parts
           (workshop_id, work_order_id, part_id, description, quantity, unit_cost, unit_price, stock_applied)
         VALUES ($1,$2,$3,'Kit de arrastre 428',1,95000,165000,TRUE)`,
        [workshop.id, order.id, partIds['KIT-428']]);
      await client.query('UPDATE parts SET stock = stock - 1 WHERE id = $1', [partIds['KIT-428']]);
      await client.query(
        `UPDATE work_orders SET labor_total = 45000, parts_total = 165000,
           tax_total = 39900, total = 249900 WHERE id = $1`, [order.id]);
    }
  }

  await client.query(
    `INSERT INTO sequences (workshop_id, name, value) VALUES ($1, 'work_order', $2)
     ON CONFLICT (workshop_id, name) DO UPDATE SET value = EXCLUDED.value`,
    [workshop.id, seq]);

  await client.query(
    `INSERT INTO appointments (workshop_id, customer_id, motorcycle_id, scheduled_at, reason)
     VALUES ($1,$2,$3, date_trunc('hour', NOW()) + INTERVAL '3 hours', 'Mantenimiento de 10.000 km')`,
    [workshop.id, motos[2].customer.id, motos[2].moto.id]);

  await client.query('COMMIT');
  console.log(`Taller de demostración creado.
  Entra en /  con:
    correo: ${EMAIL}
    clave:  ${PASSWORD}
  Otros usuarios (misma clave): reception@ / mechanic@ / warehouse@ / cashier@tallerdemo.test`);
} catch (err) {
  await client.query('ROLLBACK');
  console.error('No se pudo cargar la demostración:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
