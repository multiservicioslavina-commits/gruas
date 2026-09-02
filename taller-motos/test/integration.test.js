// API de integración: es la puerta para vincular el software con otra
// plataforma más adelante, sin acoplar el producto a ninguna.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, makeClient, addUser, closePool } from './helpers.js';

const server = await startServer();
const anon = makeClient(server.url);
test.after(async () => { await server.close(); await closePool(); });

test('el secreto de la llave se muestra una sola vez', async () => {
  const { client } = await createWorkshop(server.url);
  const created = await client.post('/api/api-keys',
    { name: 'Integración de prueba', scopes: ['read', 'write'] });

  assert.equal(created.status, 201);
  assert.match(created.body.key, /^tm_[0-9a-f]{12}_/);

  const list = await client.get('/api/api-keys');
  assert.equal(list.body.data.length, 1);
  assert.equal(list.body.data[0].key, undefined, 'el listado nunca devuelve el secreto');
  assert.ok(list.body.data[0].prefix);
});

test('sólo el administrador administra las llaves', async () => {
  const { client } = await createWorkshop(server.url);
  const { client: reception } = await addUser(server.url, client, 'reception');
  assert.equal((await reception.get('/api/api-keys')).status, 403);
  assert.equal((await reception.post('/api/api-keys', { name: 'x' })).status, 403);
});

test('una llave inválida no entra', async () => {
  assert.equal((await anon.get('/api/integration/v1/workshop')).status, 401);
  assert.equal((await anon.get('/api/integration/v1/workshop',
    { 'X-Api-Key': 'tm_aaaaaaaaaaaa_secretoinventado' })).status, 401);
});

test('consulta el estado de una orden y el historial de una placa', async () => {
  const { client } = await createWorkshop(server.url);
  const key = (await client.post('/api/api-keys', { name: 'Lectura', scopes: ['read'] })).body.key;
  const headers = { 'X-Api-Key': key };

  const order = (await client.post('/api/work-orders', {
    plate: 'INT001', customer_name: 'Cliente Integrado', complaint: 'Ruido en el motor'
  })).body;

  const status = await anon.get(`/api/integration/v1/orders/${order.public_code}`, headers);
  assert.equal(status.status, 200);
  assert.equal(status.body.plate, 'INT001');
  assert.equal(status.body.status, 'received');
  assert.equal(status.body.workshop_id, undefined);

  const history = await anon.get('/api/integration/v1/motorcycles/INT001/history', headers);
  assert.equal(history.status, 200);
  assert.equal(history.body.history.length, 1);
});

test('una llave de sólo lectura no puede agendar', async () => {
  const { client } = await createWorkshop(server.url);
  const key = (await client.post('/api/api-keys', { name: 'Lectura', scopes: ['read'] })).body.key;

  const res = await anon.post('/api/integration/v1/appointments', {
    customer_name: 'Quien Sea', scheduled_at: new Date(Date.now() + 86400000).toISOString()
  }, { 'X-Api-Key': key });
  assert.equal(res.status, 403);
});

test('una plataforma externa puede agendar una cita', async () => {
  const { client } = await createWorkshop(server.url);
  const key = (await client.post('/api/api-keys',
    { name: 'Escritura', scopes: ['read', 'write'] })).body.key;

  const when = new Date(Date.now() + 86400000).toISOString();
  const res = await anon.post('/api/integration/v1/appointments', {
    customer_name: 'Pedro Externo',
    customer_phone: '3009998877',
    plate: 'EXT900',
    brand: 'Bajaj',
    reason: 'Mantenimiento de 10.000 km',
    scheduled_at: when,
    source: 'plataforma-externa'
  }, { 'X-Api-Key': key });

  assert.equal(res.status, 201);
  assert.equal(res.body.customer.name, 'Pedro Externo');
  assert.equal(res.body.motorcycle.plate, 'EXT900');

  // El taller la ve en su agenda como una cita más.
  const agenda = await client.get('/api/appointments');
  assert.equal(agenda.body.total, 1);
  assert.equal(agenda.body.data[0].reason, 'Mantenimiento de 10.000 km');
});

test('agendar dos veces con el mismo teléfono no duplica el cliente', async () => {
  const { client } = await createWorkshop(server.url);
  const key = (await client.post('/api/api-keys',
    { name: 'Escritura', scopes: ['read', 'write'] })).body.key;
  const headers = { 'X-Api-Key': key };
  const when = new Date(Date.now() + 86400000).toISOString();

  const first = await anon.post('/api/integration/v1/appointments',
    { customer_name: 'Repetido', customer_phone: '300 111 2233', scheduled_at: when }, headers);
  const second = await anon.post('/api/integration/v1/appointments',
    { customer_name: 'Repetido', customer_phone: '3001112233', scheduled_at: when }, headers);

  assert.equal(first.body.customer.id, second.body.customer.id,
    'reconoce el teléfono aunque venga con espacios');
  assert.equal((await client.get('/api/customers')).body.total, 1);
});

test('una llave sólo alcanza los datos de su taller', async () => {
  const a = await createWorkshop(server.url);
  const b = await createWorkshop(server.url);
  const keyB = (await b.client.post('/api/api-keys', { name: 'B', scopes: ['read'] })).body.key;

  const orderA = (await a.client.post('/api/work-orders',
    { plate: 'SEP001', customer_name: 'Cliente A', complaint: 'x' })).body;

  const res = await anon.get(`/api/integration/v1/orders/${orderA.public_code}`,
    { 'X-Api-Key': keyB });
  assert.equal(res.status, 404, 'la llave del taller B no ve órdenes del taller A');
});

test('una llave borrada deja de funcionar', async () => {
  const { client } = await createWorkshop(server.url);
  const created = (await client.post('/api/api-keys', { name: 'Temporal' })).body;
  const headers = { 'X-Api-Key': created.key };

  assert.equal((await anon.get('/api/integration/v1/workshop', headers)).status, 200);
  await client.delete(`/api/api-keys/${created.id}`);
  assert.equal((await anon.get('/api/integration/v1/workshop', headers)).status, 401);
});
