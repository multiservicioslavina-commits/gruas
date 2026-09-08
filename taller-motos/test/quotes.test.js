import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, makeClient, closePool } from './helpers.js';

const server = await startServer();
const anon = makeClient(server.url);
test.after(async () => { await server.close(); await closePool(); });

// Orden con un trabajo autorizado y otro por autorizar.
async function orderWithLines(client, { taxRate = 0 } = {}) {
  const order = (await client.post('/api/work-orders', {
    plate: `QT${Math.floor(Math.random() * 9000 + 1000)}`,
    customer_name: 'Cliente Cotización',
    complaint: 'Revisión general'
  })).body;
  const first = await client.post(`/api/work-orders/${order.id}/services`,
    { description: 'Mantenimiento básico', unit_price: 60000, approved: true });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const second = await client.post(`/api/work-orders/${order.id}/services`,
    { description: 'Cambio de guayas', unit_price: 40000, approved: false });
  assert.equal(second.status, 201, JSON.stringify(second.body));
  return order;
}

test('la cotización recoge las líneas de la orden y calcula su total', async () => {
  const { client } = await createWorkshop(server.url, { tax_rate: 0 });
  const order = await orderWithLines(client);

  const res = await client.post(`/api/work-orders/${order.id}/quotes`, {});
  assert.equal(res.status, 201);
  assert.equal(res.body.items.length, 2);
  assert.equal(res.body.total, 100000, 'cotiza también lo que está por autorizar');
  assert.equal(res.body.status, 'draft');
  assert.ok(res.body.public_url.includes(res.body.public_token));

  // La línea no aprobada queda marcada como opcional: el cliente decide.
  const optional = res.body.items.find((i) => i.description === 'Cambio de guayas');
  assert.equal(optional.optional, true);
});

test('no se puede cotizar una orden sin líneas', async () => {
  const { client } = await createWorkshop(server.url);
  const order = (await client.post('/api/work-orders', {
    plate: 'VAC111', customer_name: 'Sin Líneas', complaint: 'Nada aún'
  })).body;

  const res = await client.post(`/api/work-orders/${order.id}/quotes`, {});
  assert.equal(res.status, 400);
});

test('una cotización en borrador no es visible para el cliente', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await orderWithLines(client);
  const quote = (await client.post(`/api/work-orders/${order.id}/quotes`, {})).body;

  const res = await anon.get(`/api/public/quotes/${quote.public_token}`);
  assert.equal(res.status, 404);
});

test('al enviarla, la orden queda esperando la aprobación del cliente', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await orderWithLines(client);
  const quote = (await client.post(`/api/work-orders/${order.id}/quotes`, {})).body;

  const sent = await client.post(`/api/quotes/${quote.id}/send`);
  assert.equal(sent.status, 200);
  assert.equal(sent.body.status, 'sent');
  assert.ok(sent.body.sent_at);

  const updated = (await client.get(`/api/work-orders/${order.id}`)).body;
  assert.equal(updated.status, 'pending_approval');
});

test('el cliente ve la cotización sin datos internos del taller', async () => {
  const { client } = await createWorkshop(server.url, { tax_rate: 0 });
  const order = await orderWithLines(client);
  const quote = (await client.post(`/api/work-orders/${order.id}/quotes`, {})).body;
  await client.post(`/api/quotes/${quote.id}/send`);

  const res = await anon.get(`/api/public/quotes/${quote.public_token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 100000);
  assert.equal(res.body.items.length, 2);
  assert.ok(res.body.workshop_name);
  assert.equal(res.body.workshop_id, undefined, 'no expone identificadores internos');
  assert.equal(res.body.created_by, undefined);
});

test('aprobación total: autoriza los trabajos y mueve la orden a aprobada', async () => {
  const { client } = await createWorkshop(server.url, { tax_rate: 0 });
  const order = await orderWithLines(client);
  const quote = (await client.post(`/api/work-orders/${order.id}/quotes`, {})).body;
  await client.post(`/api/quotes/${quote.id}/send`);

  const optional = quote.items.find((i) => i.optional);
  const res = await anon.post(`/api/public/quotes/${quote.public_token}/respond`, {
    decision: 'approved',
    customer_name: 'Juan Motero',
    items: [{ id: optional.id, approved: true }]
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'approved');

  const updated = (await client.get(`/api/work-orders/${order.id}`)).body;
  assert.equal(updated.status, 'approved');
  assert.equal(updated.labor_total, 100000, 'ahora se cobran ambos trabajos');
  assert.ok(updated.services.every((s) => s.approved));
});

test('aprobación parcial: lo que el cliente no autorizó no se cobra', async () => {
  const { client } = await createWorkshop(server.url, { tax_rate: 0 });
  const order = await orderWithLines(client);
  const quote = (await client.post(`/api/work-orders/${order.id}/quotes`, {})).body;
  await client.post(`/api/quotes/${quote.id}/send`);

  const optional = quote.items.find((i) => i.optional);
  const res = await anon.post(`/api/public/quotes/${quote.public_token}/respond`, {
    decision: 'approved',
    customer_name: 'Juan Motero',
    items: [{ id: optional.id, approved: false }]
  });
  assert.equal(res.body.status, 'partial');

  const updated = (await client.get(`/api/work-orders/${order.id}`)).body;
  assert.equal(updated.labor_total, 60000, 'sólo el trabajo autorizado');
  const rejected = updated.services.find((s) => s.description === 'Cambio de guayas');
  assert.equal(rejected.approved, false, 'el trabajo rechazado queda bloqueado');
});

test('rechazo total: la orden se anula y nada queda aprobado', async () => {
  const { client } = await createWorkshop(server.url, { tax_rate: 0 });
  const order = await orderWithLines(client);
  const quote = (await client.post(`/api/work-orders/${order.id}/quotes`, {})).body;
  await client.post(`/api/quotes/${quote.id}/send`);

  const res = await anon.post(`/api/public/quotes/${quote.public_token}/respond`,
    { decision: 'rejected', customer_name: 'Juan Motero', note: 'Muy caro' });
  assert.equal(res.body.status, 'rejected');

  const updated = (await client.get(`/api/work-orders/${order.id}`)).body;
  assert.equal(updated.status, 'cancelled');
  assert.equal(updated.total, 0);
});

test('el repuesto sólo sale de bodega cuando el cliente lo autoriza', async () => {
  const { client } = await createWorkshop(server.url, { tax_rate: 0 });
  const part = (await client.post('/api/parts',
    { name: 'Kit de arrastre', price: 180000, stock: 4 })).body;

  const order = (await client.post('/api/work-orders', {
    plate: 'STK777', customer_name: 'Cliente Stock', complaint: 'Cadena floja'
  })).body;

  // Se propone sin aprobar: la pieza sigue en el estante.
  await client.post(`/api/work-orders/${order.id}/parts`,
    { part_id: part.id, quantity: 1, approved: false });
  assert.equal((await client.get(`/api/parts/${part.id}`)).body.stock, 4);

  const quote = (await client.post(`/api/work-orders/${order.id}/quotes`, {})).body;
  await client.post(`/api/quotes/${quote.id}/send`);
  await anon.post(`/api/public/quotes/${quote.public_token}/respond`, {
    decision: 'approved',
    items: quote.items.map((i) => ({ id: i.id, approved: true }))
  });

  assert.equal((await client.get(`/api/parts/${part.id}`)).body.stock, 3,
    'al aprobar, se descuenta del inventario');
});

test('la decisión del cliente queda registrada con fecha y navegador', async () => {
  const { client } = await createWorkshop(server.url, { tax_rate: 0 });
  const order = await orderWithLines(client);
  const quote = (await client.post(`/api/work-orders/${order.id}/quotes`, {})).body;
  await client.post(`/api/quotes/${quote.id}/send`);

  await anon.post(`/api/public/quotes/${quote.public_token}/respond`,
    { decision: 'approved', customer_name: 'Ana Ruiz' },
    { 'User-Agent': 'Mozilla/5.0 Prueba' });

  const stored = (await client.get(`/api/quotes/${quote.id}`)).body;
  assert.equal(stored.approvals.length, 1);
  assert.equal(stored.approvals[0].customer_name, 'Ana Ruiz');
  assert.equal(stored.approvals[0].user_agent, 'Mozilla/5.0 Prueba');
  assert.ok(stored.approvals[0].decided_at);
  assert.equal(stored.approvals[0].items.length, 2, 'guarda qué se aprobó exactamente');
});

test('no se puede responder dos veces la misma cotización', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await orderWithLines(client);
  const quote = (await client.post(`/api/work-orders/${order.id}/quotes`, {})).body;
  await client.post(`/api/quotes/${quote.id}/send`);

  await anon.post(`/api/public/quotes/${quote.public_token}/respond`, { decision: 'approved' });
  const again = await anon.post(`/api/public/quotes/${quote.public_token}/respond`,
    { decision: 'rejected' });
  assert.equal(again.status, 409);
});

test('una cotización vencida ya no se puede aprobar', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await orderWithLines(client);
  const quote = (await client.post(`/api/work-orders/${order.id}/quotes`,
    { valid_until: '2020-01-01' })).body;
  await client.post(`/api/quotes/${quote.id}/send`);

  const res = await anon.post(`/api/public/quotes/${quote.public_token}/respond`,
    { decision: 'approved' });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /venció/);
});

test('un enlace inventado no revela nada', async () => {
  const res = await anon.get('/api/public/quotes/token-que-no-existe');
  assert.equal(res.status, 404);
});
