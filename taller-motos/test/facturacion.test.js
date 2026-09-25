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
      if (onBill) await onBill(JSON.parse(options.body));
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

test('si la factura ya validada en la DIAN no se puede guardar localmente, el error lo dice claro', async () => {
  // El peor caso: Factus ya aceptó y numeró el documento (algo real e
  // irreversible) pero confirmarlo aquí falla. No debe verse como un error
  // cualquiera -- si lo fuera, alguien reintentaría "Facturar" y generaría
  // una SEGUNDA factura electrónica, que sólo se corrige con nota crédito.
  const { client } = await createWorkshop(server.url);
  const order = await orderConServicio(client);
  await conectarFactus(client);

  // Se borra la reserva justo cuando Factus responde: es exactamente el
  // hueco entre "el documento ya existe ante la DIAN" y "quedó guardado".
  mockFactusOk(async () => {
    await pool.query(
      `DELETE FROM invoices WHERE work_order_id = $1 AND status = 'draft'`, [order.id]);
  });

  const res = await client.post(`/api/work-orders/${order.id}/invoice`, datosDian);

  assert.equal(res.status, 500, JSON.stringify(res.body));
  assert.match(res.body.error, /SÍ se creó ante la DIAN/i);
  assert.match(res.body.error, /no la vuelvas a generar/i);
});

test('la reserva se toma ANTES de llamar a Factus', async () => {
  // Es el orden lo que evita el duplicado: si la fila se creara después, dos
  // peticiones simultáneas llamarían las dos a la DIAN antes de que ninguna
  // hubiera dejado rastro.
  const { client } = await createWorkshop(server.url);
  const order = await orderConServicio(client);
  await conectarFactus(client);

  let habiaReserva = null;
  mockFactusOk(async () => {
    const { rows } = await pool.query(
      `SELECT status FROM invoices WHERE work_order_id = $1`, [order.id]);
    habiaReserva = rows.map((r) => r.status);
  });

  const res = await client.post(`/api/work-orders/${order.id}/invoice`, datosDian);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual(habiaReserva, ['draft'],
    'cuando Factus responde ya tiene que existir la reserva en borrador');
});

test('dos "Facturar" a la vez crean UN solo documento ante la DIAN', async () => {
  // El fallo que esto cierra: `assertSinFacturar` era una lectura, así que
  // dos clics simultáneos pasaban los dos (todavía no había fila), los dos
  // llamaban a Factus, y quedaban DOS facturas reales ante la DIAN. Sólo la
  // segunda fallaba al guardarse -- el documento duplicado ya existía.
  const { client } = await createWorkshop(server.url);
  const order = await orderConServicio(client);
  await conectarFactus(client);

  let llamadasAFactus = 0;
  mockFactusOk(() => { llamadasAFactus += 1; });

  const [a, b] = await Promise.all([
    client.post(`/api/work-orders/${order.id}/invoice`, datosDian),
    client.post(`/api/work-orders/${order.id}/invoice`, datosDian)
  ]);

  const estados = [a.status, b.status].sort();
  assert.deepEqual(estados, [201, 409], `${a.status}/${b.status}: ${JSON.stringify([a.body, b.body])}`);

  // Lo que de verdad importa: la DIAN recibió una sola petición.
  assert.equal(llamadasAFactus, 1, 'Factus no puede haberse llamado dos veces');

  const releida = await client.get(`/api/work-orders/${order.id}`);
  assert.equal(releida.body.invoices.length, 1);
  assert.equal(releida.body.invoices[0].status, 'issued');
});

test('si Factus rechaza, la reserva se suelta y se puede volver a intentar', async () => {
  // La reserva no puede dejar la orden bloqueada para siempre por un intento
  // que no llegó a crear ningún documento.
  const { client } = await createWorkshop(server.url);
  const order = await orderConServicio(client);
  await conectarFactus(client);

  withFactusMock(async (url) => {
    if (url.endsWith('/oauth/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'tok', refresh_token: 'r', expires_in: 3600 }) };
    }
    return { ok: false, status: 422, text: async () => '{"message":"municipio invalido"}',
             json: async () => ({ message: 'municipio invalido' }) };
  });

  const fallido = await client.post(`/api/work-orders/${order.id}/invoice`, datosDian);
  assert.ok(fallido.status >= 400, JSON.stringify(fallido.body));

  const { rows } = await pool.query(
    `SELECT status FROM invoices WHERE work_order_id = $1`, [order.id]);
  assert.equal(rows.length, 0, 'la reserva tiene que haberse soltado');

  // Y ahora sí se puede facturar.
  mockFactusOk();
  const segundo = await client.post(`/api/work-orders/${order.id}/invoice`, datosDian);
  assert.equal(segundo.status, 201, JSON.stringify(segundo.body));
});

test('factura de venta normal: no necesita Factus ni datos de la DIAN', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await orderConServicio(client);

  const res = await client.post(`/api/work-orders/${order.id}/invoice-normal`, {});
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.kind, 'normal');
  // El código de facturación y el número son dos campos distintos, no una
  // cadena pegada: el código dice qué documento es, el número es su
  // consecutivo.
  assert.equal(res.body.document_type_code, '10');
  assert.equal(res.body.document_type_name, 'Factura de venta');
  assert.match(res.body.doc_number, /^\d{6}$/);
  assert.equal(Number(res.body.total), Number(order.total));

  const releida = await client.get(`/api/work-orders/${order.id}`);
  assert.equal(releida.body.invoices.length, 1);
  assert.equal(releida.body.invoices[0].document_type_code, '10');
  assert.equal(releida.body.invoices[0].doc_number, res.body.doc_number);
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
