// El taller debe poder llevarse su información, completa y sin la de nadie más.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, addUser, closePool } from './helpers.js';

const server = await startServer();
test.after(async () => { await server.close(); await closePool(); });

// Un taller con algo de historia: cliente, moto, orden, repuesto y pago.
async function tallerConDatos() {
  const w = await createWorkshop(server.url);
  const { client } = w;
  await client.post('/api/parts', { name: 'Bujía NGK', sku: 'BJ-1', price: 18000, stock: 10 });
  const orden = (await client.post('/api/work-orders', {
    plate: 'EXP001', customer_name: 'Cliente Exportado', customer_phone: '3001234567',
    brand: 'Yamaha', complaint: 'No enciende'
  })).body;
  await client.post(`/api/work-orders/${orden.id}/services`,
    { description: 'Revisión eléctrica', unit_price: 50000 });
  await client.post(`/api/work-orders/${orden.id}/diagnostics`,
    { findings: 'Batería sulfatada' });
  await client.post(`/api/work-orders/${orden.id}/payments`, { amount: 20000 });
  return w;
}

test('la exportación completa trae todo lo del taller', async () => {
  const { client, workshop } = await tallerConDatos();

  const res = await client.get('/api/export');
  assert.equal(res.status, 200);

  const datos = res.body;
  assert.equal(datos.taller.id, workshop.id);
  assert.equal(datos.clientes.length, 1);
  assert.equal(datos.clientes[0].name, 'Cliente Exportado');
  assert.equal(datos.motos[0].plate, 'EXP001');
  assert.equal(datos.repuestos[0].name, 'Bujía NGK');

  // Las órdenes van completas: con sus líneas, diagnósticos y pagos dentro.
  const [orden] = datos.ordenes;
  assert.equal(orden.mano_de_obra.length, 1);
  assert.equal(orden.diagnosticos[0].findings, 'Batería sulfatada');
  assert.equal(orden.pagos[0].amount, 20000);
  assert.equal(orden.historial.length >= 1, true);
});

test('la exportación no incluye contraseñas ni el código de licencia', async () => {
  const { client } = await tallerConDatos();
  const datos = (await client.get('/api/export')).body;

  assert.equal(datos.usuarios[0].password_hash, undefined);
  assert.equal(datos.taller.license_code, undefined);
  assert.ok(!JSON.stringify(datos).includes('password_hash'));
});

test('un taller no exporta la información de otro', async () => {
  const a = await tallerConDatos();
  const b = await createWorkshop(server.url);

  const deB = (await b.client.get('/api/export')).body;
  assert.equal(deB.clientes.length, 0, 'el taller B no tiene clientes');
  assert.equal(deB.ordenes.length, 0);
  assert.ok(!JSON.stringify(deB).includes('Cliente Exportado'));
});

test('los CSV salen con encabezados y contenido', async () => {
  const { client } = await tallerConDatos();

  const clientes = await client.get('/api/export/clientes.csv');
  assert.equal(clientes.status, 200);
  assert.match(clientes.body, /Nombre;Teléfono;Correo/);
  assert.match(clientes.body, /Cliente Exportado/);

  const ordenes = await client.get('/api/export/ordenes.csv');
  assert.match(ordenes.body, /EXP001/);
  assert.match(ordenes.body, /No enciende/);

  const inventario = await client.get('/api/export/inventario.csv');
  assert.match(inventario.body, /Bujía NGK/);
});

test('un CSV que no existe se rechaza con una lista de los que sí', async () => {
  const { client } = await createWorkshop(server.url);
  const res = await client.get('/api/export/inventado.csv');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /clientes, motos, ordenes/);
});

test('sólo el administrador puede exportar', async () => {
  const { client } = await createWorkshop(server.url);
  const { client: recepcion } = await addUser(server.url, client, 'reception');

  assert.equal((await recepcion.get('/api/export')).status, 403);
  assert.equal((await recepcion.get('/api/export/clientes.csv')).status, 403);
});

test('el CSV empieza con BOM, que es lo que hace que Excel respete los acentos', async () => {
  const { client, token } = await tallerConDatos();

  // Hay que mirar los bytes: al descodificar a texto, el BOM se pierde.
  const res = await fetch(`${server.url}/api/export/clientes.csv`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
});

test('un nombre que empieza como fórmula sale escapado en el CSV (CSV injection)', async () => {
  // Si el nombre queda tal cual, Excel/Sheets lo interpreta como fórmula al
  // abrir el archivo -- no hace falta que nadie del taller lo escriba mal:
  // un cliente que se agenda solo, o una integración externa, ya lo mandan así.
  const { client } = await createWorkshop(server.url);
  await client.post('/api/customers', { name: '=cmd|"/c calc"!A1' });
  await client.post('/api/customers', { name: '+1+1' });
  await client.post('/api/customers', { name: '@SUM(A1:A9)' });

  const csv = (await client.get('/api/export/clientes.csv')).body;
  // El valor con comillas internas queda además entrecomillado por el CSV
  // normal (","" -> comilla doblada): lo que importa es que, dentro de esa
  // celda, el contenido real siga empezando por ' seguida del = original.
  assert.match(csv, /"'=cmd\|""\/c calc""!A1"/, 'el = queda como texto, con comilla adelante');
  assert.match(csv, /^'\+1\+1;/m);
  assert.match(csv, /^'@SUM\(A1:A9\);/m);
  // Ninguna celda debe empezar directo por =, + o @ (sin la comilla que la neutraliza).
  assert.ok(!/(^|;)"?[=@]/m.test(csv), 'no debe quedar un = ni @ suelto al arranque de una celda');
});

test('un saldo negativo legítimo (orden pagada de más) no se convierte en texto', async () => {
  // El fix de CSV injection no debe tocar los números: llegan como `number`
  // de Postgres (ver el type parser de db.js), nunca como texto de usuario.
  // Una orden pagada de más dejaría "Saldo" en negativo, un caso real donde
  // el valor sí debe empezar por "-" y seguir siendo un número, no texto.
  const { client } = await createWorkshop(server.url);
  const orden = (await client.post('/api/work-orders', {
    plate: 'NEG001', customer_name: 'Cliente Sobrepago', complaint: 'x'
  })).body;
  await client.post(`/api/work-orders/${orden.id}/services`,
    { description: 'Revisión', unit_price: 1000 });
  await client.post(`/api/work-orders/${orden.id}/payments`, { amount: 1500 });

  const csv = (await client.get('/api/export/ordenes.csv')).body;
  const fila = csv.split('\r\n').find((l) => l.includes('NEG001'));
  const saldo = fila.split(';').at(-1);
  assert.match(saldo, /^-\d+$/, `saldo negativo sin comillas, salió "${saldo}"`);
});

test('el CSV de inventario trae el repuesto y su proveedor sin pisarse', async () => {
  // Repuesto y proveedor tienen ambos una columna "nombre": si la consulta no
  // las distingue, una borra a la otra y el repuesto sale en blanco.
  const { client } = await createWorkshop(server.url);
  const proveedor = (await client.post('/api/suppliers', { name: 'Distribuidora Andina' })).body;
  await client.post('/api/parts',
    { name: 'Kit de arrastre 428', sku: 'KIT-428', price: 165000, stock: 3,
      supplier_id: proveedor.id });

  const csv = (await client.get('/api/export/inventario.csv')).body;
  const fila = csv.split('\r\n')[1];

  assert.match(fila, /^Kit de arrastre 428;KIT-428/, 'el nombre del repuesto va primero');
  assert.match(fila, /Distribuidora Andina$/, 'y el del proveedor al final');
});
