// Modo "almacén" (repuestos y accesorios): mismo motor que el taller, con
// tres cosas nuevas -- el tipo de negocio en sí, código de barras en los
// repuestos y compatibilidad por marca/modelo/año.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, closePool } from './helpers.js';

const server = await startServer();
test.after(async () => { await server.close(); await closePool(); });

test('el tipo de negocio por defecto es "taller"', async () => {
  const { client } = await createWorkshop(server.url);
  const res = await client.get('/api/workshop');
  assert.equal(res.status, 200);
  assert.equal(res.body.business_type, 'taller');
});

test('se puede registrar un taller como "almacen"', async () => {
  const { client } = await createWorkshop(server.url, { business_type: 'almacen' });
  const res = await client.get('/api/workshop');
  assert.equal(res.status, 200);
  assert.equal(res.body.business_type, 'almacen');
});

test('el administrador puede cambiar el tipo de negocio desde ajustes', async () => {
  const { client } = await createWorkshop(server.url);
  const res = await client.patch('/api/workshop', { business_type: 'almacen' });
  assert.equal(res.status, 200);
  assert.equal(res.body.business_type, 'almacen');

  const releido = await client.get('/api/workshop');
  assert.equal(releido.body.business_type, 'almacen');
});

test('un valor de tipo de negocio inválido se rechaza', async () => {
  const { client } = await createWorkshop(server.url);
  const res = await client.patch('/api/workshop', { business_type: 'otra-cosa' });
  assert.equal(res.status, 400);
});

test('dos repuestos del mismo taller no pueden repetir código de barras', async () => {
  const { client } = await createWorkshop(server.url);
  const primero = await client.post('/api/parts', { name: 'Pastillas de freno', barcode: '7701234567890' });
  assert.equal(primero.status, 201);

  const repetido = await client.post('/api/parts', { name: 'Otras pastillas', barcode: '7701234567890' });
  assert.equal(repetido.status, 409);
});

test('el mismo código de barras sí puede repetirse entre talleres distintos', async () => {
  const tallerA = await createWorkshop(server.url);
  const tallerB = await createWorkshop(server.url);

  const a = await tallerA.client.post('/api/parts', { name: 'Filtro de aceite', barcode: '7709876543210' });
  const b = await tallerB.client.post('/api/parts', { name: 'Filtro de aceite', barcode: '7709876543210' });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
});

test('un repuesto se puede buscar por código de barras', async () => {
  const { client } = await createWorkshop(server.url);
  await client.post('/api/parts', { name: 'Bujía NGK', sku: 'BJ-1', barcode: '7701112223334' });

  const res = await client.get('/api/parts?search=7701112223334');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].sku, 'BJ-1');
});

test('compatibilidad de un repuesto: crear, listar y quitar', async () => {
  const { client } = await createWorkshop(server.url);
  const part = (await client.post('/api/parts', { name: 'Kit de arrastre' })).body;

  const creado = await client.post('/api/part-fitments', {
    part_id: part.id, brand: 'Yamaha', model: 'FZ 2.0', year_from: 2018, year_to: 2023
  });
  assert.equal(creado.status, 201);
  assert.equal(creado.body.brand, 'Yamaha');

  const listado = await client.get(`/api/part-fitments?part_id=${part.id}`);
  assert.equal(listado.status, 200);
  assert.equal(listado.body.data.length, 1);
  assert.equal(listado.body.data[0].model, 'FZ 2.0');

  const borrado = await client.delete(`/api/part-fitments/${creado.body.id}`);
  assert.equal(borrado.status, 204);

  const vacio = await client.get(`/api/part-fitments?part_id=${part.id}`);
  assert.equal(vacio.body.data.length, 0);
});

test('un repuesto puede tener compatibilidad con varios modelos', async () => {
  const { client } = await createWorkshop(server.url);
  const part = (await client.post('/api/parts', { name: 'Cadena 428H' })).body;

  await client.post('/api/part-fitments', { part_id: part.id, brand: 'Yamaha', model: 'FZ 2.0' });
  await client.post('/api/part-fitments', { part_id: part.id, brand: 'Yamaha', model: 'FZ-S' });
  await client.post('/api/part-fitments', { part_id: part.id, brand: 'Honda', model: 'CB 190R' });

  const listado = await client.get(`/api/part-fitments?part_id=${part.id}`);
  assert.equal(listado.body.data.length, 3);
});

test('no se puede asociar compatibilidad al repuesto de otro taller', async () => {
  const tallerA = await createWorkshop(server.url);
  const tallerB = await createWorkshop(server.url);
  const partDeA = (await tallerA.client.post('/api/parts', { name: 'Amortiguador' })).body;

  const res = await tallerB.client.post('/api/part-fitments', {
    part_id: partDeA.id, brand: 'Suzuki', model: 'GSX 150'
  });
  assert.equal(res.status, 404);
});

test('la compatibilidad de un repuesto no aparece en el listado de otro taller', async () => {
  const tallerA = await createWorkshop(server.url);
  const tallerB = await createWorkshop(server.url);
  const partDeA = (await tallerA.client.post('/api/parts', { name: 'Disco de freno' })).body;
  await tallerA.client.post('/api/part-fitments', { part_id: partDeA.id, brand: 'KTM', model: 'Duke 200' });

  // tallerB no tiene ese part_id, así que su listado filtrado por ese id
  // (aunque exista) no debe traer nada -- el filtro también respeta el taller.
  const res = await tallerB.client.get(`/api/part-fitments?part_id=${partDeA.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 0);
});

test('el panel del modo almacén trae ventas de hoy y stock bajo', async () => {
  const { client } = await createWorkshop(server.url, { business_type: 'almacen' });
  await client.post('/api/parts', { name: 'Casco integral', stock: 1, min_stock: 5, price: 250000 });

  const dash = await client.get('/api/reports/dashboard');
  assert.equal(dash.status, 200);
  assert.ok(dash.body.sales_today);
  assert.equal(dash.body.sales_today.count, 0);
  assert.equal(dash.body.low_stock.length, 1);
  assert.equal(dash.body.low_stock[0].name, 'Casco integral');
});

test('una venta de mostrador cuenta en las ventas de hoy del panel', async () => {
  const { client } = await createWorkshop(server.url, { business_type: 'almacen' });
  const part = (await client.post('/api/parts', { name: 'Guantes', price: 40000, stock: 10 })).body;
  await client.post('/api/sales', { items: [{ part_id: part.id, quantity: 2 }] });

  const dash = await client.get('/api/reports/dashboard');
  assert.equal(dash.body.sales_today.count, 1);
  assert.equal(Number(dash.body.sales_today.total), 80000);
});
