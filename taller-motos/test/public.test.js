// Seguimiento del cliente: entra con el código de su orden, sin cuenta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, makeClient, closePool } from './helpers.js';

const server = await startServer();
const anon = makeClient(server.url);
test.after(async () => { await server.close(); await closePool(); });

test('con el código ve el estado de su moto y el avance', async () => {
  const { client } = await createWorkshop(server.url, { tax_rate: 0 });
  const order = (await client.post('/api/work-orders', {
    plate: 'PUB001', customer_name: 'Marta Gómez', customer_phone: '3001112233',
    brand: 'Honda', model: 'CB 190', complaint: 'Frenos flojos'
  })).body;
  await client.post(`/api/work-orders/${order.id}/services`,
    { description: 'Cambio de pastillas', unit_price: 80000 });
  await client.post(`/api/work-orders/${order.id}/status`, { status: 'diagnosing' });

  const res = await anon.get(`/api/public/orders/${order.public_code}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.plate, 'PUB001');
  assert.equal(res.body.status, 'diagnosing');
  assert.equal(res.body.total, 80000);
  assert.equal(res.body.balance, 80000);
  assert.equal(res.body.history.length, 2, 'muestra el recorrido de la orden');
  assert.ok(res.body.workshop_name);
});

test('no expone datos internos ni del cliente completo', async () => {
  const { client } = await createWorkshop(server.url);
  const order = (await client.post('/api/work-orders', {
    plate: 'PUB002', customer_name: 'Marta Gómez Restrepo',
    customer_phone: '3001112233', complaint: 'Revisión'
  })).body;

  const res = await anon.get(`/api/public/orders/${order.public_code}`);
  assert.equal(res.body.customer_first_name, 'Marta', 'sólo el primer nombre');
  assert.equal(res.body.id, undefined, 'no expone el id interno de la orden');
  assert.equal(res.body.customer_id, undefined);
  assert.equal(res.body.workshop_id, undefined);
  assert.equal(res.body.mechanic_id, undefined);
  assert.equal(res.body.parts_total, undefined, 'no desglosa costos internos');
});

test('el código es insensible a mayúsculas y rechaza los inventados', async () => {
  const { client } = await createWorkshop(server.url);
  const order = (await client.post('/api/work-orders',
    { plate: 'PUB003', customer_name: 'Quien Sea', complaint: 'x' })).body;

  assert.equal((await anon.get(`/api/public/orders/${order.public_code.toLowerCase()}`)).status, 200);
  assert.equal((await anon.get('/api/public/orders/ZZZZZZ')).status, 404);
  assert.equal((await anon.get('/api/public/orders/AB')).status, 400);
});

test('una orden anulada deja de ser consultable', async () => {
  const { client } = await createWorkshop(server.url);
  const order = (await client.post('/api/work-orders',
    { plate: 'PUB004', customer_name: 'Quien Sea', complaint: 'x' })).body;

  await client.post(`/api/work-orders/${order.id}/status`, { status: 'cancelled' });
  assert.equal((await anon.get(`/api/public/orders/${order.public_code}`)).status, 404);
});

test('avisa si hay una cotización esperando respuesta', async () => {
  const { client } = await createWorkshop(server.url);
  const order = (await client.post('/api/work-orders',
    { plate: 'PUB005', customer_name: 'Quien Sea', complaint: 'x' })).body;
  await client.post(`/api/work-orders/${order.id}/services`,
    { description: 'Trabajo', unit_price: 50000 });

  const before = await anon.get(`/api/public/orders/${order.public_code}`);
  assert.equal(before.body.pending_quote, null);

  const quote = (await client.post(`/api/work-orders/${order.id}/quotes`, {})).body;
  await client.post(`/api/quotes/${quote.id}/send`);

  const after = await anon.get(`/api/public/orders/${order.public_code}`);
  assert.equal(after.body.pending_quote.number, quote.number);
  assert.ok(after.body.pending_quote.public_token);
});

test('la salud del servicio responde sin autenticación', async () => {
  const res = await anon.get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});
