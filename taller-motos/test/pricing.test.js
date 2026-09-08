// Precio de mostrador vs. mayorista: un cliente marcado como mayorista paga
// el precio mayorista del repuesto (si el repuesto tiene uno); todos los
// demás casos siguen pagando el precio de siempre.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, closePool } from './helpers.js';

const server = await startServer();
test.after(async () => { await server.close(); await closePool(); });

test('un cliente nuevo es de tipo "retail" por defecto', async () => {
  const { client } = await createWorkshop(server.url);
  const c = (await client.post('/api/customers', { name: 'Juan Pérez' })).body;
  assert.equal(c.price_tier, 'retail');
});

test('se puede registrar un cliente como mayorista', async () => {
  const { client } = await createWorkshop(server.url);
  const c = (await client.post('/api/customers', { name: 'Taller El Motero', price_tier: 'wholesale' })).body;
  assert.equal(c.price_tier, 'wholesale');
});

test('un valor de tipo de precio inválido se rechaza', async () => {
  const { client } = await createWorkshop(server.url);
  const res = await client.post('/api/customers', { name: 'X', price_tier: 'otra-cosa' });
  assert.equal(res.status, 400);
});

test('una venta sin cliente cobra el precio de mostrador', async () => {
  const { client } = await createWorkshop(server.url);
  const part = (await client.post('/api/parts',
    { name: 'Filtro de aceite', price: 20000, wholesale_price: 15000, stock: 10 })).body;

  const venta = await client.post('/api/sales', { items: [{ part_id: part.id, quantity: 1 }] });
  assert.equal(venta.status, 201);
  assert.equal(Number(venta.body.items[0].unit_price), 20000);
});

test('una venta a un cliente mayorista cobra el precio mayorista del repuesto', async () => {
  const { client } = await createWorkshop(server.url);
  const mayorista = (await client.post('/api/customers', { name: 'Taller El Motero', price_tier: 'wholesale' })).body;
  const part = (await client.post('/api/parts',
    { name: 'Filtro de aceite', price: 20000, wholesale_price: 15000, stock: 10 })).body;

  const venta = await client.post('/api/sales',
    { customer_id: mayorista.id, items: [{ part_id: part.id, quantity: 2 }] });
  assert.equal(venta.status, 201);
  assert.equal(Number(venta.body.items[0].unit_price), 15000);
  assert.equal(Number(venta.body.total), 30000);
});

test('un cliente mayorista paga el precio de siempre si el repuesto no tiene precio mayorista', async () => {
  const { client } = await createWorkshop(server.url);
  const mayorista = (await client.post('/api/customers', { name: 'Taller El Motero', price_tier: 'wholesale' })).body;
  const part = (await client.post('/api/parts', { name: 'Bujía NGK', price: 8000, stock: 10 })).body;

  const venta = await client.post('/api/sales',
    { customer_id: mayorista.id, items: [{ part_id: part.id, quantity: 1 }] });
  assert.equal(Number(venta.body.items[0].unit_price), 8000);
});

test('un cliente minorista paga el precio de mostrador aunque el repuesto tenga precio mayorista', async () => {
  const { client } = await createWorkshop(server.url);
  const minorista = (await client.post('/api/customers', { name: 'Juan Pérez' })).body;
  const part = (await client.post('/api/parts',
    { name: 'Cadena 428H', price: 90000, wholesale_price: 70000, stock: 5 })).body;

  const venta = await client.post('/api/sales',
    { customer_id: minorista.id, items: [{ part_id: part.id, quantity: 1 }] });
  assert.equal(Number(venta.body.items[0].unit_price), 90000);
});

test('el precio escrito a mano en la línea gana sobre cualquier precio automático', async () => {
  const { client } = await createWorkshop(server.url);
  const mayorista = (await client.post('/api/customers', { name: 'Taller El Motero', price_tier: 'wholesale' })).body;
  const part = (await client.post('/api/parts',
    { name: 'Disco de freno', price: 50000, wholesale_price: 40000, stock: 5 })).body;

  const venta = await client.post('/api/sales', {
    customer_id: mayorista.id,
    items: [{ part_id: part.id, quantity: 1, unit_price: 35000 }]
  });
  assert.equal(Number(venta.body.items[0].unit_price), 35000);
});
