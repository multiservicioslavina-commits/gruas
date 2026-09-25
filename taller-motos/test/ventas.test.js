// Ventas de mostrador: vender un repuesto sin pasar por una orden de
// trabajo, cobrando al momento y descontando inventario.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, closePool } from './helpers.js';

const server = await startServer();
test.after(async () => { await server.close(); await closePool(); });

const hoy = () => new Date().toISOString().slice(0, 10);

async function repuesto(client, overrides = {}) {
  return (await client.post('/api/parts', {
    name: 'Bujía NGK', sku: `BJ-${Math.floor(Math.random() * 90000 + 10000)}`,
    price: 20000, cost: 12000, stock: 10, ...overrides
  })).body;
}

test('se registra una venta, descuenta inventario y queda el movimiento', async () => {
  const { client } = await createWorkshop(server.url);
  const parte = await repuesto(client);

  const venta = await client.post('/api/sales', {
    items: [{ part_id: parte.id, quantity: 3 }]
  });
  assert.equal(venta.status, 201, JSON.stringify(venta.body));
  assert.equal(venta.body.total, 60000);
  assert.equal(venta.body.items.length, 1);
  assert.equal(venta.body.items[0].unit_price, 20000);

  const parteActualizado = (await client.get(`/api/parts/${parte.id}`)).body;
  assert.equal(Number(parteActualizado.stock), 7);

  const movimientos = (await client.get(`/api/parts/${parte.id}/movements`)).body.data;
  assert.equal(movimientos.length, 1);
  assert.equal(movimientos[0].type, 'out');
  assert.equal(Number(movimientos[0].quantity), 3);
});

test('no deja vender más de lo que hay en existencia', async () => {
  const { client } = await createWorkshop(server.url);
  const parte = await repuesto(client, { stock: 2 });

  const res = await client.post('/api/sales', { items: [{ part_id: parte.id, quantity: 5 }] });
  assert.equal(res.status, 409);

  const parteSinCambios = (await client.get(`/api/parts/${parte.id}`)).body;
  assert.equal(Number(parteSinCambios.stock), 2, 'no debe descontar nada si falla');
});

test('descuento e IVA se calculan igual que en una orden', async () => {
  const { client } = await createWorkshop(server.url);
  const parte = await repuesto(client, { price: 100000 });

  const venta = await client.post('/api/sales', {
    items: [{ part_id: parte.id, quantity: 1 }], discount: 10000, tax_rate: 19
  });
  assert.equal(venta.status, 201);
  assert.equal(venta.body.subtotal, 100000);
  // (100000 - 10000) * 19% = 17100
  assert.equal(venta.body.tax_total, 17100);
  assert.equal(venta.body.total, 90000 + 17100);
});

test('un mecánico no puede registrar una venta', async () => {
  const { client } = await createWorkshop(server.url);
  const parte = await repuesto(client);
  const email = `mecanico-${Date.now()}@prueba.test`;
  await client.post('/api/users', { name: 'Mecánico', email, password: 'clave-segura-123', role: 'mechanic' });
  const login = await fetch(`${server.url}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'clave-segura-123' })
  });
  const { token } = await login.json();

  const res = await fetch(`${server.url}/api/sales`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ items: [{ part_id: parte.id, quantity: 1 }] })
  });
  assert.equal(res.status, 403);
});

test('una venta se puede facturar como factura de venta normal', async () => {
  const { client } = await createWorkshop(server.url);
  const parte = await repuesto(client);
  const venta = (await client.post('/api/sales', { items: [{ part_id: parte.id, quantity: 2 }] })).body;

  const factura = await client.post(`/api/sales/${venta.id}/invoice-normal`, {});
  assert.equal(factura.status, 201, JSON.stringify(factura.body));
  assert.equal(factura.body.kind, 'normal');
  assert.equal(factura.body.document_type_code, '10');
  assert.match(factura.body.doc_number, /^\d{6}$/);
  assert.equal(Number(factura.body.total), Number(venta.total));

  const releida = await client.get(`/api/sales/${venta.id}`);
  assert.equal(releida.body.invoices.length, 1);
  assert.equal(releida.body.invoices[0].status, 'issued');
});

test('una venta no se puede facturar dos veces', async () => {
  const { client } = await createWorkshop(server.url);
  const parte = await repuesto(client);
  const venta = (await client.post('/api/sales', { items: [{ part_id: parte.id, quantity: 1 }] })).body;

  const primera = await client.post(`/api/sales/${venta.id}/invoice-normal`, {});
  assert.equal(primera.status, 201);
  const segunda = await client.post(`/api/sales/${venta.id}/invoice-normal`, {});
  assert.equal(segunda.status, 409);
  assert.match(segunda.body.error, /ya tiene una factura/);
});

test('un taller no puede facturar ni ver la venta de otro', async () => {
  const { client: a } = await createWorkshop(server.url);
  const { client: b } = await createWorkshop(server.url);
  const parte = await repuesto(a);
  const venta = (await a.post('/api/sales', { items: [{ part_id: parte.id, quantity: 1 }] })).body;

  assert.equal((await b.get(`/api/sales/${venta.id}`)).status, 404);
  assert.equal((await b.post(`/api/sales/${venta.id}/invoice-normal`, {})).status, 404);
});

test('una venta facturada aparece en el balance de caja y en Operaciones', async () => {
  const { client } = await createWorkshop(server.url);
  const parte = await repuesto(client, { price: 50000 });
  const venta = (await client.post('/api/sales', { items: [{ part_id: parte.id, quantity: 2 }] })).body;

  const resumenSinFacturar = await client.get(`/api/accounting/summary?from=${hoy()}&to=${hoy()}`);
  const ventasSinFacturar = resumenSinFacturar.body.income.by_category
    .find((r) => r.category === 'Ventas de mostrador');
  assert.equal(ventasSinFacturar.total, 100000, 'el ingreso ya cuenta aunque no esté facturada');

  await client.post(`/api/sales/${venta.id}/invoice-normal`, {});
  const ops = await client.get(`/api/accounting/operations?from=${hoy()}&to=${hoy()}`);
  const fila = ops.body.data.find((o) => o.source === 'invoice' && o.detail.includes(`#${venta.number}`));
  assert.ok(fila, 'la factura de la venta debe aparecer en Operaciones');
  assert.equal(fila.direction, 'income');
  assert.equal(Number(fila.amount), 100000);
});

// ── Un mismo repuesto en varias líneas de la misma venta ──────────────────
// Pasa solo en el mostrador: se agrega el artículo y luego se vuelve a
// agregar en vez de subir la cantidad. La comprobación de existencias era
// línea a línea contra el mismo stock sin descontar, así que 6 + 6 unidades
// con 10 en inventario pasaban las dos y la venta se aceptaba dejando el
// stock en -2.
test('el mismo repuesto repetido en varias líneas no puede pasarse del stock', async () => {
  const w = await createWorkshop(server.url);
  const parte = await repuesto(w.client, { stock: 10 });

  const venta = await w.client.post('/api/sales', {
    items: [
      { part_id: parte.id, quantity: 6, unit_price: 10000 },
      { part_id: parte.id, quantity: 6, unit_price: 10000 }
    ]
  });
  assert.equal(venta.status, 409);
  assert.match(venta.body.error, /quedan 10/i);

  const despues = await w.client.get(`/api/parts/${parte.id}`);
  assert.equal(Number(despues.body.stock), 10, 'no se debió descontar nada');
});

test('un mismo repuesto en varias líneas sí se vende si la suma cabe en el stock', async () => {
  const w = await createWorkshop(server.url);
  const parte = await repuesto(w.client, { stock: 10 });

  const venta = await w.client.post('/api/sales', {
    items: [
      { part_id: parte.id, quantity: 4, unit_price: 10000 },
      { part_id: parte.id, quantity: 6, unit_price: 10000 }
    ]
  });
  assert.equal(venta.status, 201, JSON.stringify(venta.body));

  const despues = await w.client.get(`/api/parts/${parte.id}`);
  assert.equal(Number(despues.body.stock), 0);
});

// ── Vender sin existencias ────────────────────────────────────────────────
// El repuesto llegó al mostrador pero todavía no se registró la entrada: la
// venta no puede parar por eso. Con allow_negative_stock el stock queda en
// negativo a propósito, y el inventario lo muestra en rojo.
test('con allow_negative_stock se puede vender un repuesto en cero', async () => {
  const w = await createWorkshop(server.url);
  const parte = await repuesto(w.client, { stock: 0 });

  const venta = await w.client.post('/api/sales', {
    allow_negative_stock: true,
    items: [{ part_id: parte.id, quantity: 1, unit_price: 10000 }]
  });
  assert.equal(venta.status, 201, JSON.stringify(venta.body));

  const despues = await w.client.get(`/api/parts/${parte.id}`);
  assert.equal(Number(despues.body.stock), -1);
});

test('sin la bandera, vender un repuesto en cero sigue rechazándose', async () => {
  const w = await createWorkshop(server.url);
  const parte = await repuesto(w.client, { stock: 0 });

  const venta = await w.client.post('/api/sales', {
    items: [{ part_id: parte.id, quantity: 1, unit_price: 10000 }]
  });
  assert.equal(venta.status, 409);

  const despues = await w.client.get(`/api/parts/${parte.id}`);
  assert.equal(Number(despues.body.stock), 0, 'no se debió tocar el stock');
});
