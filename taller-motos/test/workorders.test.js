import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, addUser, closePool } from './helpers.js';

const server = await startServer();
test.after(async () => { await server.close(); await closePool(); });

// Recepción con placa nueva: crea cliente y moto de una sola vez.
async function receive(client, overrides = {}) {
  const res = await client.post('/api/work-orders', {
    plate: `ABC${Math.floor(Math.random() * 900 + 100)}`,
    customer_name: 'Juan Motero',
    customer_phone: '3001234567',
    brand: 'Yamaha',
    model: 'FZ 2.0',
    year: 2021,
    complaint: 'Suena la cadena y no arranca en frío',
    mileage_in: 24500,
    fuel_level: 'half',
    ...overrides
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

test('recepción: crea cliente, moto y orden con número y código público', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await receive(client);

  assert.equal(order.status, 'received');
  assert.equal(order.number, 1, 'el consecutivo empieza en 1');
  assert.match(order.public_code, /^[A-Z0-9]{6}$/);
  assert.equal(order.customer.name, 'Juan Motero');
  assert.equal(order.motorcycle.brand, 'Yamaha');
  assert.equal(order.mileage_in, 24500);
  assert.equal(order.history.length, 1);
  assert.equal(order.history[0].status, 'received');

  const second = await receive(client);
  assert.equal(second.number, 2, 'el consecutivo avanza por taller');
});

test('recepción con placa ya conocida reutiliza la moto y su dueño', async () => {
  const { client } = await createWorkshop(server.url);
  const first = await receive(client, { plate: 'XYZ99A' });
  const again = await receive(client, {
    plate: 'XYZ99A', customer_name: 'Otro Nombre', mileage_in: 26000
  });

  assert.equal(again.motorcycle.id, first.motorcycle.id);
  assert.equal(again.customer.id, first.customer.id, 'no duplica el cliente');
  assert.equal(again.motorcycle.mileage, 26000, 'actualiza el kilometraje');
});

test('la placa es obligatoria si no se manda la moto', async () => {
  const { client } = await createWorkshop(server.url);
  const res = await client.post('/api/work-orders', { complaint: 'Revisión' });
  assert.equal(res.status, 400);
});

test('totales: mano de obra + repuestos − descuento + IVA', async () => {
  const { client } = await createWorkshop(server.url);   // taller con IVA 19%
  const order = await receive(client);

  await client.post(`/api/work-orders/${order.id}/services`,
    { description: 'Sincronización', quantity: 1, unit_price: 50000 });
  const withParts = await client.post(`/api/work-orders/${order.id}/parts`,
    { description: 'Kit de arrastre', quantity: 1, unit_price: 120000 });

  assert.equal(withParts.body.labor_total, 50000);
  assert.equal(withParts.body.parts_total, 120000);
  assert.equal(withParts.body.tax_rate, 19);
  assert.equal(withParts.body.tax_total, 32300);      // 170.000 × 19%
  assert.equal(withParts.body.total, 202300);

  const discounted = await client.patch(`/api/work-orders/${order.id}`, { discount: 20000 });
  assert.equal(discounted.body.tax_total, 28500);     // 150.000 × 19%
  assert.equal(discounted.body.total, 178500);
});

test('sólo se cobran las líneas aprobadas', async () => {
  const { client } = await createWorkshop(server.url, { tax_rate: 0 });
  const order = await receive(client);

  await client.post(`/api/work-orders/${order.id}/services`,
    { description: 'Trabajo autorizado', unit_price: 30000, approved: true });
  const res = await client.post(`/api/work-orders/${order.id}/services`,
    { description: 'Trabajo por autorizar', unit_price: 80000, approved: false });

  assert.equal(res.body.labor_total, 30000, 'lo no aprobado no suma al total');
  assert.equal(res.body.services.length, 2, 'pero la línea sigue registrada');
});

test('cargar un repuesto del inventario descuenta stock y deja movimiento', async () => {
  const { client } = await createWorkshop(server.url, { tax_rate: 0 });
  const part = (await client.post('/api/parts',
    { name: 'Bujía NGK', sku: 'BJ-01', cost: 8000, price: 15000, stock: 10, min_stock: 2 })).body;
  const order = await receive(client);

  const res = await client.post(`/api/work-orders/${order.id}/parts`,
    { part_id: part.id, quantity: 2 });
  assert.equal(res.status, 201);
  assert.equal(res.body.parts_total, 30000, 'toma el precio del inventario');

  const updated = (await client.get(`/api/parts/${part.id}`)).body;
  assert.equal(updated.stock, 8, 'descontó las 2 unidades');

  const movements = (await client.get(`/api/parts/${part.id}/movements`)).body;
  assert.equal(movements.data[0].type, 'out');
  assert.equal(movements.data[0].quantity, 2);
  assert.equal(movements.data[0].balance_after, 8);
});

test('quitar el repuesto de la orden lo devuelve al inventario', async () => {
  const { client } = await createWorkshop(server.url, { tax_rate: 0 });
  const part = (await client.post('/api/parts',
    { name: 'Filtro de aceite', price: 25000, stock: 5 })).body;
  const order = await receive(client);

  const withPart = await client.post(`/api/work-orders/${order.id}/parts`,
    { part_id: part.id, quantity: 3 });
  assert.equal((await client.get(`/api/parts/${part.id}`)).body.stock, 2);

  const lineId = withPart.body.parts[0].id;
  const removed = await client.delete(`/api/work-orders/${order.id}/parts/${lineId}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.parts_total, 0);
  assert.equal((await client.get(`/api/parts/${part.id}`)).body.stock, 5, 'stock restituido');
});

test('no deja cargar más repuestos de los que hay en bodega', async () => {
  const { client } = await createWorkshop(server.url);
  const part = (await client.post('/api/parts', { name: 'Pastillas', price: 40000, stock: 1 })).body;
  const order = await receive(client);

  const res = await client.post(`/api/work-orders/${order.id}/parts`,
    { part_id: part.id, quantity: 3 });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /Sólo quedan 1/);

  // ...salvo que se pida explícitamente permitir stock negativo.
  const forced = await client.post(`/api/work-orders/${order.id}/parts`,
    { part_id: part.id, quantity: 3, allow_negative_stock: true });
  assert.equal(forced.status, 201);
  assert.equal((await client.get(`/api/parts/${part.id}`)).body.stock, -2);
});

test('el flujo de estados respeta el orden de la operación', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await receive(client);
  const setStatus = (status) => client.post(`/api/work-orders/${order.id}/status`, { status });

  const skip = await setStatus('delivered');
  assert.equal(skip.status, 409, 'no se entrega una moto recién recibida');

  assert.equal((await setStatus('diagnosing')).status, 200);
  assert.equal((await setStatus('repairing')).status, 200);
  assert.equal((await setStatus('quality_check')).status, 200);
  assert.equal((await setStatus('ready')).status, 200);

  const delivered = await setStatus('delivered');
  assert.equal(delivered.status, 200);
  assert.ok(delivered.body.delivered_at, 'sella la fecha de entrega');

  const closed = await setStatus('closed');
  assert.ok(closed.body.closed_at);
  assert.equal((await setStatus('repairing')).status, 409, 'una orden cerrada no se reabre');
});

test('registrar un diagnóstico mueve la orden a "en diagnóstico"', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await receive(client);

  const res = await client.post(`/api/work-orders/${order.id}/diagnostics`, {
    findings: 'Cadena estirada, guías desgastadas',
    tests_performed: 'Prueba de compresión',
    recommendations: 'Cambiar kit de arrastre'
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'diagnosing');
  assert.equal(res.body.diagnostics.length, 1);
});

test('pagos: abono parcial y saldo cero', async () => {
  const { client } = await createWorkshop(server.url, { tax_rate: 0 });
  const order = await receive(client);
  await client.post(`/api/work-orders/${order.id}/services`,
    { description: 'Mantenimiento', unit_price: 100000 });

  const partial = await client.post(`/api/work-orders/${order.id}/payments`,
    { amount: 40000, method: 'cash' });
  assert.equal(partial.body.payment_status, 'partial');
  assert.equal(partial.body.balance, 60000);

  const paid = await client.post(`/api/work-orders/${order.id}/payments`,
    { amount: 60000, method: 'transfer' });
  assert.equal(paid.body.payment_status, 'paid');
  assert.equal(paid.body.balance, 0);
});

test('el mecánico no puede registrar pagos', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await receive(client);
  const { client: mechanic } = await addUser(server.url, client, 'mechanic');

  const res = await mechanic.post(`/api/work-orders/${order.id}/payments`, { amount: 1000 });
  assert.equal(res.status, 403);
});

test('una orden cerrada no admite nuevas líneas', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await receive(client);
  for (const status of ['diagnosing', 'repairing', 'ready', 'delivered', 'closed']) {
    await client.post(`/api/work-orders/${order.id}/status`, { status });
  }
  const res = await client.post(`/api/work-orders/${order.id}/services`,
    { description: 'Trabajo tardío', unit_price: 1000 });
  assert.equal(res.status, 409);
});

test('el historial de la moto reúne todos sus servicios', async () => {
  const { client } = await createWorkshop(server.url);
  const first = await receive(client, { plate: 'HIS100' });
  await client.patch(`/api/work-orders/${first.id}`, { work_performed: 'Cambio de aceite' });
  await receive(client, { plate: 'HIS100' });

  const res = await client.get(`/api/motorcycles/${first.motorcycle.id}/history`);
  assert.equal(res.status, 200);
  assert.equal(res.body.history.length, 2);
  assert.equal(res.body.motorcycle.plate, 'HIS100');
});

test('búsqueda de órdenes por placa y por estado', async () => {
  const { client } = await createWorkshop(server.url);
  await receive(client, { plate: 'BUS111' });
  await receive(client, { plate: 'BUS222' });

  const byPlate = await client.get('/api/work-orders?search=BUS111');
  assert.equal(byPlate.body.total, 1);
  assert.equal(byPlate.body.data[0].plate, 'BUS111');

  const open = await client.get('/api/work-orders?open=true');
  assert.equal(open.body.total, 2);
});

test('una moto sin dueño queda vinculada al cliente de su primera orden', async () => {
  const { client } = await createWorkshop(server.url);

  // La moto se registra suelta, sin cliente (por ejemplo, importada del catálogo).
  const moto = (await client.post('/api/motorcycles', { plate: 'ORF001', brand: 'KTM' })).body;
  assert.equal(moto.customer_id, null);

  const order = await receive(client, {
    plate: 'ORF001', customer_name: 'Dueño Encontrado', customer_phone: '3007778899'
  });
  assert.equal(order.motorcycle.id, moto.id, 'reutiliza la moto existente');
  assert.ok(order.customer, 'crea el cliente');

  const updated = (await client.get(`/api/motorcycles/${moto.id}`)).body;
  assert.equal(updated.customer_id, order.customer.id, 'la moto queda vinculada a su dueño');
});
