// Códigos de facturación: el catálogo del taller, y que el código y el
// número de la factura sean dos cosas separadas de verdad -- cada código con
// su propia numeración, no un consecutivo único para todo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, addUser, closePool } from './helpers.js';
import { pool } from '../src/db.js';

const server = await startServer();
test.after(async () => { await server.close(); await closePool(); });

async function ordenFacturable(client) {
  const order = await client.post('/api/work-orders', {
    plate: `DOC${Math.floor(Math.random() * 900 + 100)}`,
    customer_name: 'Cliente', customer_phone: '3001112233',
    complaint: 'Revisión'
  });
  await client.post(`/api/work-orders/${order.body.id}/services`, {
    description: 'Mano de obra', quantity: 1, unit_price: 50000
  });
  return (await client.get(`/api/work-orders/${order.body.id}`)).body;
}

test('todo taller arranca con los dos códigos de siempre', async () => {
  const { client } = await createWorkshop(server.url);

  const res = await client.get('/api/workshop/document-types');
  assert.equal(res.status, 200);

  const porCodigo = Object.fromEntries(res.body.map((t) => [t.code, t]));
  assert.equal(res.body.length, 2);
  assert.equal(porCodigo['10'].name, 'Factura de venta');
  assert.equal(porCodigo['10'].sends_to_dian, false);
  assert.equal(porCodigo['1030'].sends_to_dian, true);
});

test('el código de facturación y el número son campos distintos', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await ordenFacturable(client);

  const res = await client.post(`/api/work-orders/${order.id}/invoice-normal`, {});
  assert.equal(res.status, 201, JSON.stringify(res.body));

  // El código dice QUÉ documento es; el número, cuál de ellos. Antes venían
  // pegados en una sola cadena ("10-000001") y no se podían separar.
  assert.equal(res.body.document_type_code, '10');
  assert.equal(res.body.document_type_name, 'Factura de venta');
  assert.equal(res.body.number, 1);
  assert.equal(res.body.doc_number, '000001');
});

test('cada código lleva su propia numeración', async () => {
  const { client } = await createWorkshop(server.url);
  await client.post('/api/workshop/document-types',
    { code: '20', name: 'Factura de taller', sends_to_dian: false });

  // Dos con el código 10 y una con el 20: la del 20 empieza en 1, no sigue
  // la cuenta de la otra. Es lo que pide la contabilidad.
  const a = await client.post(`/api/work-orders/${(await ordenFacturable(client)).id}/invoice-normal`, {});
  const b = await client.post(`/api/work-orders/${(await ordenFacturable(client)).id}/invoice-normal`,
    { document_type_code: '10' });
  const c = await client.post(`/api/work-orders/${(await ordenFacturable(client)).id}/invoice-normal`,
    { document_type_code: '20' });

  assert.equal(a.body.number, 1);
  assert.equal(b.body.number, 2);
  assert.equal(c.body.number, 1, 'el código 20 arranca su propia cuenta');
  assert.equal(c.body.document_type_code, '20');
});

test('el prefijo de la resolución va en el número, no en el código', async () => {
  const { client } = await createWorkshop(server.url);
  const tipo = await client.post('/api/workshop/document-types',
    { code: '30', name: 'Factura con prefijo', prefix: 'FV', sends_to_dian: false });
  assert.equal(tipo.status, 201, JSON.stringify(tipo.body));

  const res = await client.post(`/api/work-orders/${(await ordenFacturable(client)).id}/invoice-normal`,
    { document_type_code: '30' });

  assert.equal(res.body.document_type_code, '30');
  assert.equal(res.body.doc_number, 'FV000001');
});

test('no se puede facturar normal con un código que va a la DIAN', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await ordenFacturable(client);

  const res = await client.post(`/api/work-orders/${order.id}/invoice-normal`,
    { document_type_code: '1030' });

  assert.equal(res.status, 400);
  // El mensaje tiene que decir por qué, no sólo que no: si no, el cajero
  // vuelve a elegir lo mismo pensando que se equivocó de tecla.
  assert.match(res.body.error, /electrónica/i);
  assert.match(res.body.error, /Facturar electrónicamente/i);
});

test('un código que no existe se rechaza con su número', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await ordenFacturable(client);

  const res = await client.post(`/api/work-orders/${order.id}/invoice-normal`,
    { document_type_code: '999' });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /999/);
});

test('dos códigos iguales no conviven en el mismo taller', async () => {
  const { client } = await createWorkshop(server.url);
  const res = await client.post('/api/workshop/document-types',
    { code: '10', name: 'Otra factura', sends_to_dian: false });
  assert.equal(res.status, 409);
});

test('el catálogo de un taller no se ve desde otro', async () => {
  const { client: uno } = await createWorkshop(server.url);
  const { client: otro } = await createWorkshop(server.url);
  await uno.post('/api/workshop/document-types',
    { code: '77', name: 'Sólo del primero', sends_to_dian: false });

  const res = await otro.get('/api/workshop/document-types');
  assert.ok(!res.body.some((t) => t.code === '77'), 'no debería ver el código del otro taller');
});

test('sólo el administrador toca el catálogo', async () => {
  const { client: admin } = await createWorkshop(server.url);
  const { client: cajero } = await addUser(server.url, admin, 'cashier');

  // Leerlo sí puede: la pantalla de facturar necesita las opciones.
  assert.equal((await cajero.get('/api/workshop/document-types')).status, 200);
  assert.equal((await cajero.post('/api/workshop/document-types',
    { code: '55', name: 'No', sends_to_dian: false })).status, 403);
});

test('desactivar un código no borra las facturas que ya lo usaron', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await ordenFacturable(client);
  const factura = await client.post(`/api/work-orders/${order.id}/invoice-normal`, {});

  const tipos = await client.get('/api/workshop/document-types');
  const diez = tipos.body.find((t) => t.code === '10');
  assert.equal((await client.delete(`/api/workshop/document-types/${diez.id}`)).status, 200);

  // La factura conserva su código y su nombre: se guardaron en la fila, no
  // se leen del catálogo, justamente para esto.
  const releida = await client.get(`/api/work-orders/${order.id}`);
  assert.equal(releida.body.invoices[0].document_type_code, '10');
  assert.equal(releida.body.invoices[0].document_type_name, 'Factura de venta');
  assert.equal(releida.body.invoices[0].doc_number, factura.body.doc_number);

  // Y deja de estar disponible para facturar de nuevo.
  const otra = await ordenFacturable(client);
  const res = await client.post(`/api/work-orders/${otra.id}/invoice-normal`, {});
  assert.notEqual(res.body.document_type_code, '10');
});

// ── Lo que necesita la factura impresa ────────────────────────────────────
// La plantilla de impresión (public/js/factura.js) arma el documento con lo
// que devuelve la API. Si un campo deja de venir, la factura no falla: sale
// mal -- sin la línea de IVA, o sin el descuento. Eso no lo nota nadie hasta
// que un cliente reclama, así que se fija aquí.

test('la orden devuelve todo lo que lleva la factura impresa', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await ordenFacturable(client);
  await client.post(`/api/work-orders/${order.id}/invoice-normal`, {});

  const [factura] = (await client.get(`/api/work-orders/${order.id}`)).body.invoices;

  for (const campo of ['document_type_code', 'document_type_name', 'doc_number',
                       'subtotal', 'tax_total', 'total', 'kind', 'issued_at']) {
    assert.ok(factura[campo] !== undefined, `falta ${campo} en la factura de la orden`);
  }
});

test('la venta devuelve todo lo que lleva la factura impresa', async () => {
  const { client } = await createWorkshop(server.url);
  const parte = (await client.post('/api/parts',
    { name: 'Filtro', sale_price: 30000, stock: 5 })).body;
  const venta = (await client.post('/api/sales',
    { items: [{ part_id: parte.id, quantity: 1 }] })).body;
  await client.post(`/api/sales/${venta.id}/invoice-normal`, {});

  const [factura] = (await client.get(`/api/sales/${venta.id}`)).body.invoices;

  for (const campo of ['document_type_code', 'document_type_name', 'doc_number',
                       'subtotal', 'tax_total', 'total', 'kind', 'issued_at']) {
    assert.ok(factura[campo] !== undefined, `falta ${campo} en la factura de la venta`);
  }
});

test('el descuento de la orden se puede deducir de lo que devuelve la API', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await ordenFacturable(client);
  await client.patch(`/api/work-orders/${order.id}`, { discount: 10000 });
  await client.post(`/api/work-orders/${order.id}/invoice-normal`, {});

  const releida = await client.get(`/api/work-orders/${order.id}`);
  const [factura] = releida.body.invoices;
  const bruto = releida.body.services.reduce(
    (suma, s) => suma + Number(s.total ?? s.quantity * s.unit_price), 0);

  // Es la cuenta exacta que hace la plantilla impresa: la tabla `invoices`
  // no guarda el descuento aparte, se deduce del subtotal.
  assert.equal(Math.max(0, Math.round(bruto - Number(factura.subtotal))), 10000);
});

// ── El camino de actualización ────────────────────────────────────────────
// Los tests de arriba corren sobre una base limpia. Producción no: ya tiene
// facturas numeradas con el consecutivo único de antes. Si las secuencias por
// tipo arrancaran en 1, la PRIMERA factura emitida tras actualizar pediría un
// número ya usado y chocaría contra invoices_type_number_key.
//
// Esto fija la sentencia de siembra del esquema (db/schema.sql). No se ve en
// una base limpia, que es justo por lo que casi se va sin arreglar.
test('al actualizar, cada consecutivo arranca donde quedó la numeración vieja', async () => {
  const { client } = await createWorkshop(server.url);
  const workshopId = (await client.get('/api/workshop')).body.id;

  // Tres facturas ya emitidas, como las que hay hoy en producción.
  for (const [n, code] of [[1, '10'], [2, '1030'], [3, '10']]) {
    const order = await ordenFacturable(client);
    await pool.query(
      `INSERT INTO invoices (workshop_id, work_order_id, number, kind, status,
                             subtotal, tax_total, total, issued_at, document_type_code)
       VALUES ($1,$2,$3,$4,'issued',0,0,0,NOW(),$5)`,
      [workshopId, order.id, n, code === '1030' ? 'electronic' : 'normal', code]);
  }
  // Y las secuencias por tipo sin sembrar, como quedarían sin la migración.
  await pool.query(
    `DELETE FROM sequences WHERE workshop_id = $1 AND name LIKE 'invoices:%'`, [workshopId]);

  // La sentencia de siembra, tal cual está en db/schema.sql.
  await pool.query(
    `INSERT INTO sequences (workshop_id, name, value)
     SELECT workshop_id, 'invoices:' || document_type_code, MAX(number)
       FROM invoices WHERE document_type_code IS NOT NULL
      GROUP BY workshop_id, document_type_code
     ON CONFLICT (workshop_id, name) DO UPDATE
        SET value = GREATEST(sequences.value, EXCLUDED.value)`);

  const { rows } = await pool.query(
    `SELECT name, value FROM sequences WHERE workshop_id = $1 AND name LIKE 'invoices:%' ORDER BY name`,
    [workshopId]);
  assert.deepEqual(rows, [{ name: 'invoices:10', value: 3 }, { name: 'invoices:1030', value: 2 }]);

  // Y la siguiente factura de verdad no choca.
  const otra = await ordenFacturable(client);
  const res = await client.post(`/api/work-orders/${otra.id}/invoice-normal`, {});
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.number, 4);
});
