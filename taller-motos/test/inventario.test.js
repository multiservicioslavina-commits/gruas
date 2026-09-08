// Carga masiva de inventario desde un CSV (mismo formato que exporta
// GET /export/inventario.csv), y su combinación con ajuste manual y
// descarga, que ya existían.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, closePool } from './helpers.js';

const server = await startServer();
test.after(async () => { await server.close(); await closePool(); });

async function subirCsv(token, texto) {
  const datos = new FormData();
  datos.append('file', new Blob([texto], { type: 'text/csv' }), 'inventario.csv');
  const res = await fetch(`${server.url}/api/parts/import`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: datos
  });
  const cuerpo = await res.text();
  return { status: res.status, body: cuerpo ? JSON.parse(cuerpo) : null };
}

test('importa repuestos nuevos desde un CSV', async () => {
  const { client, token } = await createWorkshop(server.url);
  const csv = 'Nombre;SKU;Categoría;Marca;Costo;Precio;Existencia;Mínimo;Ubicación;Proveedor\n' +
    'Filtro de aceite;FA-100;Filtros;Bosch;15000;25000;10;2;Estante A;\n' +
    'Pastillas de freno;PF-200;Frenos;Brembo;40000;65000;5;1;Estante B;';

  const res = await subirCsv(token, csv);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.creados, 2);
  assert.equal(res.body.actualizados, 0);
  assert.equal(res.body.errores.length, 0);

  const listado = (await client.get('/api/parts?limit=300')).body.data;
  assert.equal(listado.length, 2);
  const filtro = listado.find((p) => p.sku === 'FA-100');
  assert.equal(filtro.name, 'Filtro de aceite');
  assert.equal(Number(filtro.cost), 15000);
  assert.equal(Number(filtro.stock), 10);
});

test('una segunda carga con el mismo SKU actualiza en vez de duplicar', async () => {
  const { client, token } = await createWorkshop(server.url);
  await subirCsv(token, 'Nombre;SKU;Existencia\nFiltro;FA-100;10');

  const res = await subirCsv(token, 'Nombre;SKU;Precio;Existencia\nFiltro de aceite;FA-100;30000;15');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.creados, 0);
  assert.equal(res.body.actualizados, 1);

  const listado = (await client.get('/api/parts?limit=300')).body.data;
  assert.equal(listado.length, 1, 'no debe duplicar el repuesto');
  assert.equal(listado[0].name, 'Filtro de aceite');
  assert.equal(Number(listado[0].price), 30000);
  assert.equal(Number(listado[0].stock), 15);
});

test('el cambio de existencia queda registrado como movimiento', async () => {
  const { client, token } = await createWorkshop(server.url);
  const primero = await subirCsv(token, 'Nombre;SKU;Existencia\nCadena;CAD-1;20');
  const parteId = (await client.get('/api/parts?limit=300')).body.data[0].id;

  await subirCsv(token, 'Nombre;SKU;Existencia\nCadena;CAD-1;12');
  const movimientos = (await client.get(`/api/parts/${parteId}/movements`)).body.data;
  // La primera carga (creación con existencia 20) ya deja un movimiento de
  // entrada; el más reciente (orden DESC) es el de esta segunda carga.
  assert.equal(movimientos.length, 2);
  assert.equal(movimientos[0].type, 'out');
  assert.equal(Number(movimientos[0].quantity), 8);
  assert.match(movimientos[0].reason, /Carga masiva/);
  void primero;
});

test('dos filas del mismo archivo con el mismo SKU se combinan, no chocan', async () => {
  const { client, token } = await createWorkshop(server.url);
  const csv = 'Nombre;SKU;Existencia\n' +
    'Bujía;BJ-1;5\n' +
    'Bujía NGK;BJ-1;8';

  const res = await subirCsv(token, csv);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.creados, 1);
  assert.equal(res.body.actualizados, 1);

  const listado = (await client.get('/api/parts?limit=300')).body.data;
  assert.equal(listado.length, 1);
  assert.equal(listado[0].name, 'Bujía NGK');
  assert.equal(Number(listado[0].stock), 8);
});

test('sin la columna Nombre, responde con un error claro', async () => {
  const { token } = await createWorkshop(server.url);
  const res = await subirCsv(token, 'SKU;Costo\nFA-100;15000');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Nombre/);
});

test('una fila sin nombre se reporta como error, sin tumbar el resto', async () => {
  const { client, token } = await createWorkshop(server.url);
  const csv = 'Nombre;SKU\nFiltro;FA-1\n;FA-2';
  const res = await subirCsv(token, csv);
  assert.equal(res.status, 200);
  assert.equal(res.body.creados, 1);
  assert.equal(res.body.errores.length, 1);

  const listado = (await client.get('/api/parts?limit=300')).body.data;
  assert.equal(listado.length, 1);
});

test('un mecánico no puede cargar inventario', async () => {
  const { client } = await createWorkshop(server.url);
  const email = `mecanico-${Date.now()}@prueba.test`;
  await client.post('/api/users', { name: 'Mecánico', email, password: 'clave-segura-123', role: 'mechanic' });
  const login = await fetch(`${server.url}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'clave-segura-123' })
  });
  const { token: tokenMecanico } = await login.json();

  const res = await subirCsv(tokenMecanico, 'Nombre\nFiltro');
  assert.equal(res.status, 403);
});
