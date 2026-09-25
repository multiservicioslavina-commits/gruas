import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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

test('el login devuelve también el taller, no sólo el usuario', async () => {
  const { email, password, workshop } = await createWorkshop(server.url);

  const res = await makeClient(server.url).post('/api/auth/login', { email, password });
  assert.equal(res.status, 200);
  assert.ok(res.body.workshop, 'sin el taller, la interfaz no sabe su moneda ni su IVA');
  assert.equal(res.body.workshop.id, workshop.id);
  assert.equal(res.body.workshop.tax_rate, 19);
  assert.equal(res.body.user.password_hash, undefined);
});

// ── El mismo correo en las dos plataformas ────────────────────────────────
// Quien tiene taller Y almacén usa el mismo correo en los dos, que es lo
// natural. El índice único es (lower(email), business_type), así que la base
// lo permite -- pero el login buscaba por correo a secas y se quedaba con la
// primera fila que devolviera Postgres. Con el correo repetido ganaba una al
// azar y el dueño quedaba fuera de la otra, sin forma de entrar.
test('con el mismo correo en taller y almacén, cada dominio entra al suyo', async () => {
  const correo = `doble-${randomUUID()}@prueba.test`;
  const clave = 'clave-segura-123';

  await createWorkshop(server.url, { email: correo, password: clave, workshop_name: 'Mi Taller' });
  await createWorkshop(server.url,
    { email: correo, password: clave, workshop_name: 'Mi Almacén', business_type: 'almacen' });

  const porTaller = await makeClient(server.url).post('/api/auth/login',
    { email: correo, password: clave }, { Host: 'taller.ridera.com.co' });
  assert.equal(porTaller.status, 200, JSON.stringify(porTaller.body));
  assert.equal(porTaller.body.workshop.name, 'Mi Taller');

  const porAlmacen = await makeClient(server.url).post('/api/auth/login',
    { email: correo, password: clave }, { Host: 'almacen.ridera.com.co' });
  assert.equal(porAlmacen.status, 200, JSON.stringify(porAlmacen.body));
  assert.equal(porAlmacen.body.workshop.name, 'Mi Almacén');
});

test('un correo que sólo existe en almacén sigue diciendo por dónde entrar', async () => {
  // No puede degradarse a "correo o contraseña incorrectos": el mensaje que
  // nombra el dominio es lo único que saca a alguien del atolladero.
  const correo = `solo-almacen-${randomUUID()}@prueba.test`;
  const clave = 'clave-segura-123';
  await createWorkshop(server.url, { email: correo, password: clave, business_type: 'almacen' });

  const res = await makeClient(server.url).post('/api/auth/login',
    { email: correo, password: clave }, { Host: 'taller.ridera.com.co' });
  assert.equal(res.status, 401);
  assert.match(res.body.error, /almacen\.ridera\.com\.co/);
});

test('con el correo repetido, cada cuenta conserva su propia contraseña', async () => {
  const correo = `claves-${randomUUID()}@prueba.test`;
  await createWorkshop(server.url, { email: correo, password: 'clave-del-taller-1' });
  await createWorkshop(server.url,
    { email: correo, password: 'clave-del-almacen-2', business_type: 'almacen' });

  // La del almacén no abre el taller, aunque el correo sea el mismo.
  const cruzado = await makeClient(server.url).post('/api/auth/login',
    { email: correo, password: 'clave-del-almacen-2' }, { Host: 'taller.ridera.com.co' });
  assert.equal(cruzado.status, 401, 'la clave del almacén no puede abrir el taller');

  const propio = await makeClient(server.url).post('/api/auth/login',
    { email: correo, password: 'clave-del-taller-1' }, { Host: 'taller.ridera.com.co' });
  assert.equal(propio.status, 200, JSON.stringify(propio.body));
});

test('/auth/me avisa si el mismo correo tiene cuenta en la otra plataforma', async () => {
  const correo = `ambas-${randomUUID()}@prueba.test`;
  const clave = 'clave-segura-123';
  const taller = await createWorkshop(server.url,
    { email: correo, password: clave, workshop_name: 'Mi Taller' });
  await createWorkshop(server.url,
    { email: correo, password: clave, workshop_name: 'Mi Almacén', business_type: 'almacen' });

  const me = await taller.client.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.otra_plataforma.business_type, 'almacen');
  assert.equal(me.body.otra_plataforma.name, 'Mi Almacén');
});

test('con una sola cuenta, no se inventa la otra plataforma', async () => {
  const solo = await createWorkshop(server.url);
  const me = await solo.client.get('/api/auth/me');
  assert.equal(me.body.otra_plataforma, null);
});

test('el 401 por dominio equivocado dice a dónde ir, no sólo que no', async () => {
  const correo = `destino-${randomUUID()}@prueba.test`;
  const clave = 'clave-segura-123';
  await createWorkshop(server.url, { email: correo, password: clave, business_type: 'almacen' });

  const res = await makeClient(server.url).post('/api/auth/login',
    { email: correo, password: clave }, { Host: 'taller.ridera.com.co' });
  assert.equal(res.status, 401);
  // Sin esto la pantalla sólo puede escribir el dominio; con esto pone botón.
  assert.equal(res.body.details.ir_a, 'almacen');
});

test('el login también devuelve la otra plataforma, no sólo /auth/me', async () => {
  // La pantalla arranca con lo que devuelve el login: entrar por el
  // formulario no vuelve a pedir /auth/me, así que sin esto el botón para
  // saltar no aparecía hasta recargar la página.
  const correo = `login-otra-${randomUUID()}@prueba.test`;
  const clave = 'clave-segura-123';
  await createWorkshop(server.url, { email: correo, password: clave, workshop_name: 'Mi Taller' });
  await createWorkshop(server.url,
    { email: correo, password: clave, workshop_name: 'Mi Almacén', business_type: 'almacen' });

  const res = await makeClient(server.url).post('/api/auth/login',
    { email: correo, password: clave }, { Host: 'taller.ridera.com.co' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.otra_plataforma.business_type, 'almacen');
  assert.equal(res.body.otra_plataforma.name, 'Mi Almacén');
});
