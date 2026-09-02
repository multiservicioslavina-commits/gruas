// Ajuste de inventario en lote: un solo documento con el conteo físico de
// varios repuestos a la vez, en vez de entrar repuesto por repuesto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, closePool } from './helpers.js';

const server = await startServer();
test.after(async () => { await server.close(); await closePool(); });

async function repuesto(client, overrides = {}) {
  return (await client.post('/api/parts', {
    name: 'Filtro de aceite', sku: `FA-${Math.floor(Math.random() * 90000 + 10000)}`,
    price: 25000, cost: 15000, stock: 10, ...overrides
  })).body;
}

test('un ajuste en lote corrige varios repuestos a la vez y deja el rastro', async () => {
  const { client } = await createWorkshop(server.url);
  const a = await repuesto(client, { stock: 10 });
  const b = await repuesto(client, { stock: 5 });

  const ajuste = await client.post('/api/inventory-adjustments', {
    reason: 'Conteo físico de fin de mes',
    items: [{ part_id: a.id, counted_stock: 8 }, { part_id: b.id, counted_stock: 5 }]
  });
  assert.equal(ajuste.status, 201, JSON.stringify(ajuste.body));
  assert.equal(ajuste.body.items.length, 2);

  const itemA = ajuste.body.items.find((i) => i.part_id === a.id);
  assert.equal(Number(itemA.previous_stock), 10);
  assert.equal(Number(itemA.counted_stock), 8);
  assert.equal(Number(itemA.delta), -2);

  const parteA = (await client.get(`/api/parts/${a.id}`)).body;
  assert.equal(Number(parteA.stock), 8);
  const parteB = (await client.get(`/api/parts/${b.id}`)).body;
  assert.equal(Number(parteB.stock), 5, 'sin diferencia, no debe moverse ni dejar movimiento');

  const movimientosA = (await client.get(`/api/parts/${a.id}/movements`)).body.data;
  assert.equal(movimientosA.length, 1);
  assert.equal(movimientosA[0].type, 'out');
  assert.equal(Number(movimientosA[0].quantity), 2);
  assert.match(movimientosA[0].reason, /Conteo físico de fin de mes/);

  const movimientosB = (await client.get(`/api/parts/${b.id}/movements`)).body.data;
  assert.equal(movimientosB.length, 0, 'sin diferencia, no debe generar movimiento');
});

test('el listado y el detalle del ajuste se pueden consultar después', async () => {
  const { client } = await createWorkshop(server.url);
  const a = await repuesto(client, { stock: 3 });

  const creado = (await client.post('/api/inventory-adjustments', {
    items: [{ part_id: a.id, counted_stock: 6 }]
  })).body;

  const listado = (await client.get('/api/inventory-adjustments')).body.data;
  assert.equal(listado.length, 1);
  assert.equal(listado[0].item_count, 1);

  const detalle = await client.get(`/api/inventory-adjustments/${creado.id}`);
  assert.equal(detalle.status, 200);
  assert.equal(detalle.body.items[0].part_name, 'Filtro de aceite');
});

test('un ajuste sin ítems se rechaza', async () => {
  const { client } = await createWorkshop(server.url);
  const res = await client.post('/api/inventory-adjustments', { items: [] });
  assert.equal(res.status, 400);
});

test('un mecánico no puede registrar un ajuste de inventario', async () => {
  const { client } = await createWorkshop(server.url);
  const a = await repuesto(client);
  const email = `mecanico-${Date.now()}@prueba.test`;
  await client.post('/api/users', { name: 'Mecánico', email, password: 'clave-segura-123', role: 'mechanic' });
  const login = await fetch(`${server.url}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'clave-segura-123' })
  });
  const { token } = await login.json();

  const res = await fetch(`${server.url}/api/inventory-adjustments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ items: [{ part_id: a.id, counted_stock: 1 }] })
  });
  assert.equal(res.status, 403);
});

test('un taller no puede ver el ajuste de otro', async () => {
  const { client: a } = await createWorkshop(server.url);
  const { client: b } = await createWorkshop(server.url);
  const parte = await repuesto(a);
  const ajuste = (await a.post('/api/inventory-adjustments', {
    items: [{ part_id: parte.id, counted_stock: 1 }]
  })).body;

  assert.equal((await b.get(`/api/inventory-adjustments/${ajuste.id}`)).status, 404);
});
