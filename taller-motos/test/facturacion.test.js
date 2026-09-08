// Facturación electrónica DIAN: sin credenciales no arranca, sin rango de
// numeración tampoco, y con todo configurado arma y guarda la factura.
// Nunca llama a la Factus real: el fetch a su dominio se simula, y el fetch
// al servidor de pruebas (loopback) se deja pasar tal cual.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, addUser, closePool } from './helpers.js';
import { pool } from '../src/db.js';

const server = await startServer();
test.after(async () => { await server.close(); await closePool(); });

const realFetch = global.fetch;
function withFactusMock(handler) {
  global.fetch = async (url, options) => {
    if (String(url).startsWith('https://api-sandbox.factus.com.co')) return handler(String(url), options);
    return realFetch(url, options);
  };
}
test.afterEach(() => { global.fetch = realFetch; });

async function orderConServicio(client) {
  const order = await client.post('/api/work-orders', {
    plate: `FAC${Math.floor(Math.random() * 900 + 100)}`,
    customer_name: 'Cliente Facturable', customer_phone: '3001112233',
    brand: 'Yamaha', model: 'FZ', complaint: 'Cambio de aceite'
  });
  assert.equal(order.status, 201);
  const conServicio = await client.post(`/api/work-orders/${order.body.id}/services`, {
    description: 'Cambio de aceite', unit_price: 100000
  });
  assert.equal(conServicio.status, 201);
  return conServicio.body;
}

const datosDian = {
  identification_document_code: '13', identification: '123456789',
  legal_organization_code: '2', names: 'Cliente Facturable',
  municipality_code: '05001', payment_method_code: '10'
};

async function conectarFactus(client, overrides = {}) {
  await client.patch('/api/workshop', {
    factus_client_id: 'cid', factus_client_secret: 'csecret',
    factus_username: 'u@t.test', factus_password: 'clave', factus_numbering_range_id: 7,
    ...overrides
  });
}

function mockFactusOk(onBill) {
  let n = 0;
  withFactusMock(async (url, options) => {
    if (url.endsWith('/oauth/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'tok', refresh_token: 'r', expires_in: 3600 }) };
    }
    if (url.endsWith('/v2/bills/validate')) {
      if (onBill) onBill(JSON.parse(options.body));
      n += 1;
      return { ok: true, status: 200, json: async () => ({
        status: 'OK', data: { number: `SETP99000${n}`, cufe: `cufe-${n}` }
      }) };
    }
    throw new Error(`URL de Factus inesperada: ${url}`);
  });
}

test('sin credenciales de Factus, facturar responde con un mensaje claro', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await orderConServicio(client);

  const res = await client.post(`/api/work-orders/${order.id}/invoice`, datosDian);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /no tiene configurada su cuenta de Factus/);
});

test('con credenciales pero sin rango de numeración, pide configurarlo primero', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await orderConServicio(client);
  await client.patch('/api/workshop', {
    factus_client_id: 'cid', factus_client_secret: 'csecret',
    factus_username: 'u@t.test', factus_password: 'clave'
  });

  const res = await client.post(`/api/work-orders/${order.id}/invoice`, datosDian);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /rango de numeración/);
});

test('con todo configurado, arma la factura, la guarda y aparece en la orden', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await orderConServicio(client);
  await client.patch('/api/workshop', {
    factus_client_id: 'cid', factus_client_secret: 'csecret',
    factus_username: 'u@t.test', factus_password: 'clave', factus_numbering_range_id: 7
  });

  let cuerpoEnviado;
  withFactusMock(async (url, options) => {
    if (url.endsWith('/oauth/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'tok', refresh_token: 'r', expires_in: 3600 }) };
    }
    if (url.endsWith('/v2/bills/validate')) {
      cuerpoEnviado = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({
        status: 'OK', data: { number: 'SETP990000123', cufe: 'cufe-abc-123' }
      }) };
    }
    throw new Error(`URL de Factus inesperada: ${url}`);
  });

  const res = await client.post(`/api/work-orders/${order.id}/invoice`, datosDian);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.external_id, 'SETP990000123');
  assert.equal(res.body.cufe, 'cufe-abc-123');
  assert.equal(res.body.status, 'issued');
  assert.equal(Number(res.body.total), Number(order.total));

  assert.equal(cuerpoEnviado.numbering_range_id, 7);
  assert.equal(cuerpoEnviado.customer.identification, '123456789');
  assert.equal(cuerpoEnviado.items.length, 1);
  assert.equal(cuerpoEnviado.items[0].name, 'Cambio de aceite');

  const releida = await client.get(`/api/work-orders/${order.id}`);
  assert.equal(releida.body.invoices.length, 1);
  assert.equal(releida.body.invoices[0].external_id, 'SETP990000123');
});

test('un error de validación de la DIAN no crea ninguna factura', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await orderConServicio(client);
  await client.patch('/api/workshop', {
    factus_client_id: 'cid', factus_client_secret: 'csecret',
    factus_username: 'u@t.test', factus_password: 'clave', factus_numbering_range_id: 7
  });

  withFactusMock(async (url) => {
    if (url.endsWith('/oauth/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'tok', refresh_token: 'r', expires_in: 3600 }) };
    }
    return { ok: false, status: 422, json: async () => ({
      status: 'Validation error',
      data: { errors: { FAK24: 'Regla FAK24: no está informado el DV del NIT' } }
    }) };
  });

  const res = await client.post(`/api/work-orders/${order.id}/invoice`, datosDian);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /DV del NIT/);

  const releida = await client.get(`/api/work-orders/${order.id}`);
  assert.equal(releida.body.invoices.length, 0);
});

test('descargar el PDF de una factura de otro taller da 404, no la factura ajena', async () => {
  const { client: a } = await createWorkshop(server.url);
  const { client: b } = await createWorkshop(server.url);
  const order = await orderConServicio(a);
  await a.patch('/api/workshop', {
    factus_client_id: 'cid', factus_client_secret: 'csecret',
    factus_username: 'u@t.test', factus_password: 'clave', factus_numbering_range_id: 7
  });

  withFactusMock(async (url) => {
    if (url.endsWith('/oauth/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'tok', refresh_token: 'r', expires_in: 3600 }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: { number: 'SETP1', cufe: 'x' } }) };
  });
  const creada = await a.post(`/api/work-orders/${order.id}/invoice`, datosDian);
  assert.equal(creada.status, 201);

  const res = await b.get(`/api/invoices/${creada.body.id}/pdf`);
  assert.equal(res.status, 404);
});

test('un mecánico no puede facturar, sólo administradores y cajeros', async () => {
  const { client: admin } = await createWorkshop(server.url);
  const order = await orderConServicio(admin);
  await conectarFactus(admin);
  const { client: mecanico } = await addUser(server.url, admin, 'mechanic');

  mockFactusOk();
  const res = await mecanico.post(`/api/work-orders/${order.id}/invoice`, datosDian);
  assert.equal(res.status, 403);

  const releida = await admin.get(`/api/work-orders/${order.id}`);
  assert.equal(releida.body.invoices.length, 0);
});

test('una orden ya facturada no se puede volver a facturar', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await orderConServicio(client);
  await conectarFactus(client);

  mockFactusOk();
  const primera = await client.post(`/api/work-orders/${order.id}/invoice`, datosDian);
  assert.equal(primera.status, 201);

  const segunda = await client.post(`/api/work-orders/${order.id}/invoice`, datosDian);
  assert.equal(segunda.status, 409);
  assert.match(segunda.body.error, /ya tiene una factura.*nota crédito/);

  const releida = await client.get(`/api/work-orders/${order.id}`);
  assert.equal(releida.body.invoices.length, 1);
});

test('un taller no puede saber, ni siquiera por el mensaje de error, si la orden de otro ya tiene factura', async () => {
  const { client: a } = await createWorkshop(server.url);
  const { client: b } = await createWorkshop(server.url);
  const orderDeA = await orderConServicio(a);
  const facturaDeA = await a.post(`/api/work-orders/${orderDeA.id}/invoice-normal`, {});
  assert.equal(facturaDeA.status, 201);

  // B intenta facturar la orden de A: como no es suya, debe dar 404 (ni
  // rastro del código de la factura de A), nunca un 409 que la revele.
  const res = await b.post(`/api/work-orders/${orderDeA.id}/invoice-normal`, {});
  assert.equal(res.status, 404);
});

test('el descuento de la orden se reparte proporcionalmente entre los ítems', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await orderConServicio(client);
  await conectarFactus(client);

  const conDescuento = await client.patch(`/api/work-orders/${order.id}`, { discount: 25000 });
  assert.equal(conDescuento.status, 200);

  let cuerpoEnviado;
  mockFactusOk((body) => { cuerpoEnviado = body; });

  const res = await client.post(`/api/work-orders/${order.id}/invoice`, datosDian);
  assert.equal(res.status, 201, JSON.stringify(res.body));

  // 25000 de descuento sobre 100000 de mano de obra = 25%.
  assert.equal(cuerpoEnviado.items.length, 1);
  assert.equal(cuerpoEnviado.items[0].discount_rate, 25);
});

test('si la factura ya validada en la DIAN no se puede guardar localmente, el error lo dice claro y no la pierde', async () => {
  // Simula el peor caso: Factus ya aceptó y numeró el documento (algo real
  // e irreversible), pero guardarlo en este sistema falla. No debe verse
  // como un error cualquiera -- si lo fuera, alguien reintentaría
  // "Facturar" y generaría una SEGUNDA factura electrónica para la misma
  // orden, que sólo se corrige con una nota crédito en Factus.
  const { client, workshop } = await createWorkshop(server.url);
  const order = await orderConServicio(client);
  await conectarFactus(client);

  // Otra orden del mismo taller, con una factura ya guardada en el número 1:
  // fuerza a que la próxima (la de `order`, que usará el mismo consecutivo
  // por ser el primero para este taller) choque de verdad contra el índice
  // único (workshop_id, number) al intentar guardarse -- un fallo real de
  // Postgres, no uno simulado.
  const otraOrden = await orderConServicio(client);
  await pool.query(
    `INSERT INTO invoices (workshop_id, work_order_id, number, status, subtotal, tax_total, total, issued_at, external_id, payload)
     VALUES ($1, $2, 1, 'issued', 0, 0, 0, NOW(), 'YA-EXISTE', '{}')`,
    [workshop.id, otraOrden.id]);

  mockFactusOk();
  const res = await client.post(`/api/work-orders/${order.id}/invoice`, datosDian);

  assert.equal(res.status, 500, JSON.stringify(res.body));
  assert.match(res.body.error, /SÍ se creó ante la DIAN/i);
  assert.match(res.body.error, /no la vuelvas a generar/i);

  // Y de verdad no quedó guardada: no hay que fingir que sí.
  const releida = await client.get(`/api/work-orders/${order.id}`);
  assert.equal(releida.body.invoices.length, 0);
});

test('factura de venta normal: no necesita Factus ni datos de la DIAN', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await orderConServicio(client);

  const res = await client.post(`/api/work-orders/${order.id}/invoice-normal`, {});
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.kind, 'normal');
  assert.match(res.body.doc_code, /^10-\d{6}$/);
  assert.equal(Number(res.body.total), Number(order.total));

  const releida = await client.get(`/api/work-orders/${order.id}`);
  assert.equal(releida.body.invoices.length, 1);
  assert.equal(releida.body.invoices[0].doc_code, res.body.doc_code);
});

test('un mecánico no puede emitir una factura de venta normal', async () => {
  const { client: admin } = await createWorkshop(server.url);
  const order = await orderConServicio(admin);
  const { client: mecanico } = await addUser(server.url, admin, 'mechanic');

  const res = await mecanico.post(`/api/work-orders/${order.id}/invoice-normal`, {});
  assert.equal(res.status, 403);
});

test('una orden con factura normal no se puede volver a facturar, ni normal ni electrónicamente', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await orderConServicio(client);

  const normal = await client.post(`/api/work-orders/${order.id}/invoice-normal`, {});
  assert.equal(normal.status, 201);

  const otraNormal = await client.post(`/api/work-orders/${order.id}/invoice-normal`, {});
  assert.equal(otraNormal.status, 409);

  await conectarFactus(client);
  mockFactusOk();
  const electronica = await client.post(`/api/work-orders/${order.id}/invoice`, datosDian);
  assert.equal(electronica.status, 409);

  const releida = await client.get(`/api/work-orders/${order.id}`);
  assert.equal(releida.body.invoices.length, 1);
});
