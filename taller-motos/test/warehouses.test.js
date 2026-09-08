// Inventario multi-sucursal: cada taller arranca con una sola bodega
// (Principal) y nada cambia hasta que agrega una segunda -- ahí entran en
// juego la existencia por sucursal y los traslados entre ellas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, closePool } from './helpers.js';

const server = await startServer();
test.after(async () => { await server.close(); await closePool(); });

test('todo taller nuevo arranca con una sucursal Principal', async () => {
  const { client } = await createWorkshop(server.url);
  const res = await client.get('/api/warehouses');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].name, 'Principal');
  assert.equal(res.body.data[0].is_default, true);
});

test('un repuesto nuevo, sin sucursales adicionales, se ve igual que siempre', async () => {
  const { client } = await createWorkshop(server.url);
  const part = (await client.post('/api/parts', { name: 'Bujía NGK', stock: 10, min_stock: 2 })).body;
  assert.equal(Number(part.stock), 10);

  const stock = await client.get(`/api/parts/${part.id}/stock`);
  assert.equal(stock.status, 200);
  assert.equal(stock.body.data.length, 1);
  assert.equal(stock.body.data[0].warehouse_name, 'Principal');
  assert.equal(Number(stock.body.data[0].stock), 10);
});

test('editar la existencia con una sola sucursal sigue funcionando como antes', async () => {
  const { client } = await createWorkshop(server.url);
  const part = (await client.post('/api/parts', { name: 'Casco', stock: 5 })).body;

  const res = await client.patch(`/api/parts/${part.id}`, { stock: 8 });
  assert.equal(res.status, 200);
  assert.equal(Number(res.body.stock), 8);

  const stock = await client.get(`/api/parts/${part.id}/stock`);
  assert.equal(Number(stock.body.data[0].stock), 8);
});

test('no se puede eliminar ni desactivar la sucursal Principal', async () => {
  const { client } = await createWorkshop(server.url);
  const { body: principal } = await client.get('/api/warehouses');
  const id = principal.data[0].id;

  const borrado = await client.delete(`/api/warehouses/${id}`);
  assert.equal(borrado.status, 409);

  const desactivado = await client.patch(`/api/warehouses/${id}`, { active: false });
  assert.equal(desactivado.status, 409);
});

test('agregar una segunda sucursal y elegirla al crear un repuesto', async () => {
  const { client } = await createWorkshop(server.url);
  const bodega2 = (await client.post('/api/warehouses', { name: 'Sucursal Norte' })).body;
  assert.equal(bodega2.name, 'Sucursal Norte');

  const part = (await client.post('/api/parts',
    { name: 'Kit de arrastre', stock: 6, warehouse_id: bodega2.id })).body;
  assert.equal(Number(part.stock), 6); // el total sigue viéndose igual

  const stock = await client.get(`/api/parts/${part.id}/stock`);
  const porSucursal = Object.fromEntries(stock.body.data.map((s) => [s.warehouse_name, Number(s.stock)]));
  assert.equal(porSucursal['Sucursal Norte'], 6);
  assert.equal(porSucursal['Principal'], 0);
});

test('con dos sucursales activas, editar la existencia del repuesto directamente se rechaza', async () => {
  const { client } = await createWorkshop(server.url);
  await client.post('/api/warehouses', { name: 'Sucursal Norte' });
  const part = (await client.post('/api/parts', { name: 'Filtro de aceite', stock: 5 })).body;

  const res = await client.patch(`/api/parts/${part.id}`, { stock: 20 });
  assert.equal(res.status, 400);
});

test('movimiento en una sucursal puntual actualiza esa sucursal y el total', async () => {
  const { client } = await createWorkshop(server.url);
  const norte = (await client.post('/api/warehouses', { name: 'Sucursal Norte' })).body;
  const part = (await client.post('/api/parts', { name: 'Cadena 428H', stock: 3, warehouse_id: norte.id })).body;

  const mov = await client.post(`/api/parts/${part.id}/movements`,
    { type: 'in', quantity: 4, warehouse_id: norte.id });
  assert.equal(mov.status, 201);
  assert.equal(Number(mov.body.stock), 7); // 3 + 4, total

  const stock = await client.get(`/api/parts/${part.id}/stock`);
  const norteRow = stock.body.data.find((s) => s.warehouse_name === 'Sucursal Norte');
  assert.equal(Number(norteRow.stock), 7);
});

test('traslado entre sucursales mueve existencia sin cambiar el total', async () => {
  const { client } = await createWorkshop(server.url);
  const norte = (await client.post('/api/warehouses', { name: 'Sucursal Norte' })).body;
  const part = (await client.post('/api/parts', { name: 'Disco de freno', stock: 10, warehouse_id: norte.id })).body;
  const { body: bodegas } = await client.get('/api/warehouses');
  const principal = bodegas.data.find((w) => w.is_default);

  const traslado = await client.post(`/api/parts/${part.id}/transfer`, {
    from_warehouse_id: norte.id, to_warehouse_id: principal.id, quantity: 4
  });
  assert.equal(traslado.status, 201);

  const releido = await client.get(`/api/parts/${part.id}`);
  assert.equal(Number(releido.body.stock), 10); // el total no cambia con un traslado

  const stock = await client.get(`/api/parts/${part.id}/stock`);
  const porSucursal = Object.fromEntries(stock.body.data.map((s) => [s.warehouse_name, Number(s.stock)]));
  assert.equal(porSucursal['Sucursal Norte'], 6);
  assert.equal(porSucursal['Principal'], 4);
});

test('no se puede trasladar más de lo que hay en la sucursal de origen', async () => {
  const { client } = await createWorkshop(server.url);
  const norte = (await client.post('/api/warehouses', { name: 'Sucursal Norte' })).body;
  const part = (await client.post('/api/parts', { name: 'Amortiguador', stock: 2, warehouse_id: norte.id })).body;
  const { body: bodegas } = await client.get('/api/warehouses');
  const principal = bodegas.data.find((w) => w.is_default);

  const res = await client.post(`/api/parts/${part.id}/transfer`,
    { from_warehouse_id: norte.id, to_warehouse_id: principal.id, quantity: 5 });
  assert.equal(res.status, 409);
});

test('una venta puede descontar de una sucursal puntual', async () => {
  const { client } = await createWorkshop(server.url);
  const norte = (await client.post('/api/warehouses', { name: 'Sucursal Norte' })).body;
  const part = (await client.post('/api/parts',
    { name: 'Guantes', price: 40000, stock: 5, warehouse_id: norte.id })).body;

  // La Principal no tiene nada de este repuesto: vender desde ahí falla.
  const falla = await client.post('/api/sales',
    { warehouse_id: (await client.get('/api/warehouses')).body.data.find((w) => w.is_default).id,
      items: [{ part_id: part.id, quantity: 1 }] });
  assert.equal(falla.status, 409);

  const ok = await client.post('/api/sales', { warehouse_id: norte.id, items: [{ part_id: part.id, quantity: 2 }] });
  assert.equal(ok.status, 201);

  const stock = await client.get(`/api/parts/${part.id}/stock`);
  const norteRow = stock.body.data.find((s) => s.warehouse_name === 'Sucursal Norte');
  assert.equal(Number(norteRow.stock), 3);
});

test('una sucursal con existencia no se puede eliminar', async () => {
  const { client } = await createWorkshop(server.url);
  const norte = (await client.post('/api/warehouses', { name: 'Sucursal Norte' })).body;
  await client.post('/api/parts', { name: 'Espejo', stock: 1, warehouse_id: norte.id });

  const res = await client.delete(`/api/warehouses/${norte.id}`);
  assert.equal(res.status, 409);
});

test('una sucursal sin existencia sí se puede eliminar', async () => {
  const { client } = await createWorkshop(server.url);
  const norte = (await client.post('/api/warehouses', { name: 'Sucursal Norte' })).body;

  const res = await client.delete(`/api/warehouses/${norte.id}`);
  assert.equal(res.status, 204);
});

test('no se puede trasladar ni ver sucursales de otro taller', async () => {
  const tallerA = await createWorkshop(server.url);
  const tallerB = await createWorkshop(server.url);
  const norteDeA = (await tallerA.client.post('/api/warehouses', { name: 'Sucursal Norte' })).body;
  const partDeB = (await tallerB.client.post('/api/parts', { name: 'Kit de frenos', stock: 5 })).body;
  const { body: bodegasDeB } = await tallerB.client.get('/api/warehouses');

  const res = await tallerB.client.post(`/api/parts/${partDeB.id}/transfer`, {
    from_warehouse_id: bodegasDeB.data[0].id, to_warehouse_id: norteDeA.id, quantity: 1
  });
  assert.equal(res.status, 404);
});

test('ajuste de inventario en una sucursal puntual calcula el delta contra esa sucursal', async () => {
  const { client } = await createWorkshop(server.url);
  const norte = (await client.post('/api/warehouses', { name: 'Sucursal Norte' })).body;
  const part = (await client.post('/api/parts', { name: 'Batería', stock: 3, warehouse_id: norte.id })).body;

  const ajuste = await client.post('/api/inventory-adjustments', {
    warehouse_id: norte.id, items: [{ part_id: part.id, counted_stock: 5 }]
  });
  assert.equal(ajuste.status, 201);
  assert.equal(Number(ajuste.body.items[0].previous_stock), 3);
  assert.equal(Number(ajuste.body.items[0].delta), 2);

  const releido = await client.get(`/api/parts/${part.id}`);
  assert.equal(Number(releido.body.stock), 5);
});
