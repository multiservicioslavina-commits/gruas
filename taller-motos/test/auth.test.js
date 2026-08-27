import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, makeClient, closePool } from './helpers.js';

const server = await startServer();
test.after(async () => { await server.close(); await closePool(); });

test('alta de taller: devuelve token, usuario admin y taller', async () => {
  const { token, user, workshop } = await createWorkshop(server.url);
  assert.ok(token, 'debe devolver un token');
  assert.equal(user.role, 'admin');
  assert.equal(workshop.name, 'Taller de Pruebas');
  assert.equal(user.password_hash, undefined, 'nunca debe exponer el hash de la clave');
});

test('no permite dos cuentas con el mismo correo', async () => {
  const { email } = await createWorkshop(server.url);
  const res = await makeClient(server.url).post('/api/auth/register', {
    workshop_name: 'Otro', name: 'Otro', email, password: 'clave-segura-123'
  });
  assert.equal(res.status, 409);
});

test('login correcto e incorrecto', async () => {
  const { email, password } = await createWorkshop(server.url);
  const anon = makeClient(server.url);

  const ok = await anon.post('/api/auth/login', { email, password });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);

  const bad = await anon.post('/api/auth/login', { email, password: 'otra-clave-mala' });
  assert.equal(bad.status, 401);
  // El mensaje no distingue entre correo inexistente y clave errada.
  const missing = await anon.post('/api/auth/login',
    { email: 'nadie@prueba.test', password: 'otra-clave-mala' });
  assert.equal(missing.body.error, bad.body.error);
});

test('las rutas privadas exigen token válido', async () => {
  const anon = makeClient(server.url);
  assert.equal((await anon.get('/api/customers')).status, 401);
  assert.equal((await makeClient(server.url, 'token-falso').get('/api/customers')).status, 401);
});

test('/api/auth/me devuelve el usuario y su taller', async () => {
  const { client, workshop } = await createWorkshop(server.url);
  const res = await client.get('/api/auth/me');
  assert.equal(res.status, 200);
  assert.equal(res.body.workshop.id, workshop.id);
  assert.equal(res.body.user.password_hash, undefined);
});

test('cambio de contraseña: exige la actual y deja entrar con la nueva', async () => {
  const { client, email, password } = await createWorkshop(server.url);

  const wrong = await client.post('/api/auth/change-password',
    { current_password: 'no-es-esta-clave', new_password: 'clave-nueva-456' });
  assert.equal(wrong.status, 400);

  const ok = await client.post('/api/auth/change-password',
    { current_password: password, new_password: 'clave-nueva-456' });
  assert.equal(ok.status, 200);

  const login = await makeClient(server.url).post('/api/auth/login',
    { email, password: 'clave-nueva-456' });
  assert.equal(login.status, 200);
});

test('un usuario desactivado no puede seguir usando su token', async () => {
  const { client } = await createWorkshop(server.url);
  const { user, client: mechanic } = await (await import('./helpers.js'))
    .addUser(server.url, client, 'mechanic');

  assert.equal((await mechanic.get('/api/customers')).status, 200);
  await client.patch(`/api/users/${user.id}`, { active: false });
  assert.equal((await mechanic.get('/api/customers')).status, 401);
});
