// Logo del taller: se sube una vez, se sirve sin autenticación (aparece en
// la factura impresa y en las páginas públicas del cliente).
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, closePool } from './helpers.js';

const server = await startServer();
test.after(async () => { await server.close(); await closePool(); });

// Un PNG de 1×1 y otro de 2×2, ambos de verdad: el servidor mira el tipo.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');
const PNG_2x2 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M9QDwAChwGAeu4roQAAAABJRU5ErkJggg==',
  'base64');

async function subirLogo(token, contenido = PNG_1x1, nombre = 'logo.png', tipo = 'image/png') {
  const datos = new FormData();
  datos.append('logo', new Blob([contenido], { type: tipo }), nombre);
  const res = await fetch(`${server.url}/api/workshop/logo`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: datos
  });
  const texto = await res.text();
  return { status: res.status, body: texto ? JSON.parse(texto) : null };
}

test('se sube el logo y queda disponible sin autenticación', async () => {
  const { client, token } = await createWorkshop(server.url);
  const subida = await subirLogo(token);
  assert.equal(subida.status, 200, JSON.stringify(subida.body));
  assert.ok(subida.body.logo_url);

  const taller = (await client.get('/api/workshop')).body;
  assert.equal(taller.logo_url, subida.body.logo_url);

  const publico = await fetch(`${server.url}/api/public/workshop/${taller.id}/logo`);
  assert.equal(publico.status, 200);
  assert.equal(publico.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await publico.arrayBuffer()), PNG_1x1);
});

test('subir un logo nuevo reemplaza al anterior', async () => {
  const { client, token } = await createWorkshop(server.url);
  await subirLogo(token, PNG_1x1);
  await subirLogo(token, PNG_2x2);

  const taller = (await client.get('/api/workshop')).body;
  const publico = await fetch(`${server.url}/api/public/workshop/${taller.id}/logo`);
  assert.deepEqual(Buffer.from(await publico.arrayBuffer()), PNG_2x2, 'debe servir el más reciente');
});

test('no se acepta un archivo que no sea imagen', async () => {
  const { token } = await createWorkshop(server.url);
  const res = await subirLogo(token, Buffer.from('MZ'), 'virus.exe', 'application/x-msdownload');
  assert.equal(res.status, 400);
});

test('un taller sin logo responde 404, no un archivo vacío', async () => {
  const { client } = await createWorkshop(server.url);
  const taller = (await client.get('/api/workshop')).body;

  const res = await fetch(`${server.url}/api/public/workshop/${taller.id}/logo`);
  assert.equal(res.status, 404);
});

test('un mecánico no puede cambiar el logo del taller', async () => {
  const { client } = await createWorkshop(server.url);
  const email = `mecanico-${Date.now()}@prueba.test`;
  await client.post('/api/users', { name: 'Mecánico', email, password: 'clave-segura-123', role: 'mechanic' });
  const login = await fetch(`${server.url}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'clave-segura-123' })
  });
  const { token: tokenMecanico } = await login.json();

  const res = await subirLogo(tokenMecanico);
  assert.equal(res.status, 403);
});
