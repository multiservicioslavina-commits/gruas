// Utilidades para las pruebas funcionales.
//
// Las pruebas corren contra un PostgreSQL real (no un simulacro): es la única
// forma de comprobar de verdad las transacciones, el descuento de inventario y
// el aislamiento entre talleres.
//
// Cada archivo de prueba crea su propio taller con un correo único, así los
// archivos pueden correr en paralelo sin pisarse.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://postgres@127.0.0.1:5433/taller_test';
process.env.JWT_SECRET ||= 'secreto-de-pruebas';
process.env.UPLOADS_DIR ||= '/tmp/taller-motos-test-uploads';

import { randomUUID } from 'node:crypto';

const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');

// El esquema lo aplica `npm test` una sola vez antes de arrancar los archivos
// de prueba. No se reaplica aquí a propósito: el runner corre los archivos en
// paralelo, y un `ALTER TABLE … ADD CONSTRAINT` de un proceso choca con las
// escrituras de otro que ya está probando.
{
  const { rows } = await pool.query(
    `SELECT to_regclass('public.work_orders') IS NOT NULL AS ready`);
  if (!rows[0].ready) {
    throw new Error(
      'La base de pruebas no tiene el esquema. Corre "npm test", que lo aplica, ' +
      'o "npm run db:setup" apuntando a la base de pruebas.');
  }
}

export async function startServer() {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

// Cliente HTTP mínimo que arrastra el token y devuelve {status, body}.
export function makeClient(baseUrl, token = null) {
  const request = async (method, path, body, extraHeaders = {}) => {
    const headers = { ...extraHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: res.status, body: parsed };
  };

  return {
    get:    (path, headers)       => request('GET', path, undefined, headers),
    post:   (path, body, headers) => request('POST', path, body ?? {}, headers),
    patch:  (path, body, headers) => request('PATCH', path, body ?? {}, headers),
    delete: (path, headers)       => request('DELETE', path, undefined, headers),
    withToken: (newToken) => makeClient(baseUrl, newToken)
  };
}

// Da de alta un taller nuevo y devuelve un cliente ya autenticado.
export async function createWorkshop(baseUrl, overrides = {}) {
  const anon = makeClient(baseUrl);
  const email = `taller-${randomUUID()}@prueba.test`;
  const payload = {
    workshop_name: 'Taller de Pruebas',
    name: 'Dueño de Prueba',
    email,
    password: 'clave-segura-123',
    tax_rate: 19,
    ...overrides
  };
  const res = await anon.post('/api/auth/register', payload);
  if (res.status !== 201) {
    throw new Error(`No se pudo crear el taller de prueba: ${JSON.stringify(res.body)}`);
  }
  return {
    ...res.body,
    email,
    password: payload.password,
    client: makeClient(baseUrl, res.body.token)
  };
}

// Crea un usuario extra en el taller y devuelve su cliente autenticado.
export async function addUser(baseUrl, adminClient, role, overrides = {}) {
  const email = `${role}-${randomUUID()}@prueba.test`;
  const created = await adminClient.post('/api/users', {
    name: `Usuario ${role}`, email, password: 'clave-segura-123', role, ...overrides
  });
  if (created.status !== 201) {
    throw new Error(`No se pudo crear el usuario ${role}: ${JSON.stringify(created.body)}`);
  }
  const login = await makeClient(baseUrl).post('/api/auth/login',
    { email, password: 'clave-segura-123' });
  return { user: created.body, client: makeClient(baseUrl, login.body.token) };
}

export async function closePool() {
  await pool.end();
}
