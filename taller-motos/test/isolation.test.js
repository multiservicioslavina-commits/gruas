// El aislamiento entre talleres es la garantía más importante del producto:
// un taller no puede ver ni tocar los datos de otro por ninguna vía.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, addUser, closePool } from './helpers.js';

const server = await startServer();
test.after(async () => { await server.close(); await closePool(); });

test('un taller no ve los clientes de otro', async () => {
  const a = await createWorkshop(server.url);
  const b = await createWorkshop(server.url);

  const customer = (await a.client.post('/api/customers', { name: 'Cliente del taller A' })).body;

  const listB = await b.client.get('/api/customers');
  assert.equal(listB.body.total, 0);

  assert.equal((await b.client.get(`/api/customers/${customer.id}`)).status, 404);
  assert.equal((await b.client.patch(`/api/customers/${customer.id}`, { name: 'Robado' })).status, 404);
  assert.equal((await b.client.delete(`/api/customers/${customer.id}`)).status, 404);

  const stillThere = await a.client.get(`/api/customers/${customer.id}`);
  assert.equal(stillThere.body.name, 'Cliente del taller A');
});

test('un taller no puede abrir ni modificar la orden de otro', async () => {
  const a = await createWorkshop(server.url);
  const b = await createWorkshop(server.url);

  const order = (await a.client.post('/api/work-orders', {
    plate: 'AIS001', customer_name: 'Cliente A', complaint: 'Frenos'
  })).body;

  assert.equal((await b.client.get(`/api/work-orders/${order.id}`)).status, 404);
  assert.equal((await b.client.post(`/api/work-orders/${order.id}/status`,
    { status: 'diagnosing' })).status, 404);
  assert.equal((await b.client.post(`/api/work-orders/${order.id}/services`,
    { description: 'Trabajo ajeno', unit_price: 1 })).status, 404);
  assert.equal((await b.client.post(`/api/work-orders/${order.id}/payments`,
    { amount: 100 })).status, 404);
});

test('cada taller lleva su propio consecutivo de órdenes', async () => {
  const a = await createWorkshop(server.url);
  const b = await createWorkshop(server.url);

  const first = (await a.client.post('/api/work-orders',
    { plate: 'SEQ001', customer_name: 'A', complaint: 'x' })).body;
  const other = (await b.client.post('/api/work-orders',
    { plate: 'SEQ002', customer_name: 'B', complaint: 'y' })).body;

  assert.equal(first.number, 1);
  assert.equal(other.number, 1, 'el número no se comparte entre talleres');
});

test('la misma placa puede existir en dos talleres distintos', async () => {
  const a = await createWorkshop(server.url);
  const b = await createWorkshop(server.url);

  assert.equal((await a.client.post('/api/motorcycles', { plate: 'MIS123' })).status, 201);
  assert.equal((await b.client.post('/api/motorcycles', { plate: 'MIS123' })).status, 201);
  // Pero no dos veces en el mismo taller.
  assert.equal((await a.client.post('/api/motorcycles', { plate: 'MIS123' })).status, 409);
});

test('el inventario de un taller es invisible para el otro', async () => {
  const a = await createWorkshop(server.url);
  const b = await createWorkshop(server.url);

  const part = (await a.client.post('/api/parts', { name: 'Repuesto A', price: 1000, stock: 5 })).body;
  assert.equal((await b.client.get(`/api/parts/${part.id}`)).status, 404);
  assert.equal((await b.client.post(`/api/parts/${part.id}/movements`,
    { type: 'out', quantity: 5 })).status, 404);
  assert.equal((await a.client.get(`/api/parts/${part.id}`)).body.stock, 5);
});

test('un taller no puede cargar un repuesto ajeno a su orden', async () => {
  const a = await createWorkshop(server.url);
  const b = await createWorkshop(server.url);

  const partA = (await a.client.post('/api/parts', { name: 'Pieza A', price: 5000, stock: 9 })).body;
  const orderB = (await b.client.post('/api/work-orders',
    { plate: 'XPT001', customer_name: 'Cliente B', complaint: 'z' })).body;

  const res = await b.client.post(`/api/work-orders/${orderB.id}/parts`,
    { part_id: partA.id, quantity: 1 });
  assert.equal(res.status, 404);
  assert.equal((await a.client.get(`/api/parts/${partA.id}`)).body.stock, 9);
});

test('el panel de un taller sólo cuenta lo suyo', async () => {
  const a = await createWorkshop(server.url);
  const b = await createWorkshop(server.url);

  await a.client.post('/api/work-orders', { plate: 'DSH001', customer_name: 'A', complaint: 'x' });
  await a.client.post('/api/work-orders', { plate: 'DSH002', customer_name: 'A', complaint: 'y' });

  assert.equal((await a.client.get('/api/reports/dashboard')).body.counters.open_orders, 2);
  assert.equal((await b.client.get('/api/reports/dashboard')).body.counters.open_orders, 0);
});

// El filtro por taller protege lo que se lee. Estas pruebas cubren lo que se
// escribe: apuntar a un registro ajeno dejaba la referencia guardada, y por ahí
// se colaban nombres y teléfonos del taller vecino en los listados.
test('un taller no puede apuntar a registros de otro', async () => {
  const a = await createWorkshop(server.url);
  const b = await createWorkshop(server.url);

  const provB = (await b.client.post('/api/suppliers', { name: 'Proveedor de B' })).body;
  const cliB  = (await b.client.post('/api/customers', { name: 'Cliente de B' })).body;
  const motoB = (await b.client.post('/api/motorcycles',
    { plate: 'BBB111', customer_id: cliB.id })).body;
  const mecB  = (await addUser(server.url, b.client, 'mechanic')).user;
  const ordenA = (await a.client.post('/api/work-orders',
    { plate: 'AAA666', customer_name: 'D', complaint: 'w' })).body;

  const manana = new Date(Date.now() + 86400000).toISOString();
  const intentos = [
    ['repuesto con proveedor ajeno',
      a.client.post('/api/parts', { name: 'Filtro', supplier_id: provB.id, price: 100 })],
    ['compra con proveedor ajeno',
      a.client.post('/api/purchases', { supplier_id: provB.id,
        items: [{ description: 'algo', quantity: 1, unit_cost: 10 }] })],
    ['moto con cliente ajeno',
      a.client.post('/api/motorcycles', { plate: 'AAA111', customer_id: cliB.id })],
    ['cita con cliente ajeno',
      a.client.post('/api/appointments', { customer_id: cliB.id, scheduled_at: manana })],
    ['cita con moto ajena',
      a.client.post('/api/appointments', { motorcycle_id: motoB.id, scheduled_at: manana })],
    ['orden con mecánico ajeno',
      a.client.post('/api/work-orders', { plate: 'AAA222', customer_name: 'C',
        complaint: 'x', mechanic_id: mecB.id })],
    ['mano de obra con mecánico ajeno',
      a.client.post(`/api/work-orders/${ordenA.id}/services`,
        { description: 'Cambio de aceite', unit_price: 1, mechanic_id: mecB.id })],
    ['diagnóstico con mecánico ajeno',
      a.client.post(`/api/work-orders/${ordenA.id}/diagnostics`,
        { findings: 'Frenos gastados', mechanic_id: mecB.id })]
  ];

  for (const [etiqueta, promesa] of intentos) {
    assert.equal((await promesa).status, 404, etiqueta);
  }
});

test('el historial de una moto no filtra el cliente de otro taller', async () => {
  const a = await createWorkshop(server.url);
  const b = await createWorkshop(server.url);

  const cliB = (await b.client.post('/api/customers',
    { name: 'Cliente de B', phone: '3009998888' })).body;
  // Ni siquiera se puede crear la moto con ese cliente; si algún día se
  // pudiera, el historial tampoco debe devolverlo.
  const creada = await a.client.post('/api/motorcycles',
    { plate: 'AAA333', customer_id: cliB.id });
  assert.equal(creada.status, 404);

  const propia = (await a.client.post('/api/motorcycles', { plate: 'AAA444' })).body;
  const hist = await a.client.get(`/api/motorcycles/${propia.id}/history`);
  assert.equal(hist.status, 200);
  assert.equal(hist.body.customer, null);
  assert.ok(!JSON.stringify(hist.body).includes('3009998888'));
});

test('reasignar una orden a un mecánico de otro taller no se permite', async () => {
  const a = await createWorkshop(server.url);
  const b = await createWorkshop(server.url);
  const mecB = (await addUser(server.url, b.client, 'mechanic')).user;

  const orden = (await a.client.post('/api/work-orders',
    { plate: 'AAA555', customer_name: 'C', complaint: 'x' })).body;

  assert.equal((await a.client.patch(`/api/work-orders/${orden.id}`,
    { mechanic_id: mecB.id })).status, 404);
});
