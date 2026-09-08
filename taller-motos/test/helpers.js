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
import { request as httpRequest } from 'node:http';

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

// El fetch global (undici) no deja mandar un Host distinto -- lo ignora en
// silencio y manda el real. Para las pruebas que simulan entrar por
// almacen.ridera.com.co (el tipo de negocio ahora lo decide el dominio, no
// el body) hace falta el módulo http de más abajo, que sí lo respeta.
function requestWithHost(baseUrl, method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl);
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = httpRequest({
      host: url.hostname,
      port: url.port,
      path,
      method,
      headers: { ...headers, ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) }
    }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Cliente HTTP mínimo que arrastra el token y devuelve {status, body}.
export function makeClient(baseUrl, token = null) {
  const request = async (method, path, body, extraHeaders = {}) => {
    const headers = { ...extraHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    if (headers.Host) return requestWithHost(baseUrl, method, path, body, headers);

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
//
// El tipo de negocio ya no lo decide el body del registro -- lo decide el
// dominio (Host) por el que entra la petición, para que un almacén y un
// taller no puedan mezclarse ni por accidente. Aquí se simula con la
// cabecera Host: pasar `business_type: 'almacen'` hace la petición como si
// viniera de almacen.ridera.com.co.
export async function createWorkshop(baseUrl, overrides = {}) {
  const anon = makeClient(baseUrl);
  const email = `taller-${randomUUID()}@prueba.test`;
  const { business_type, ...rest } = overrides;
  const payload = {
    workshop_name: 'Taller de Pruebas',
    name: 'Dueño de Prueba',
    email,
    password: 'clave-segura-123',
    tax_rate: 19,
    ...rest
  };
  const headers = business_type === 'almacen' ? { Host: 'almacen.ridera.com.co' } : {};
  const res = await anon.post('/api/auth/register', payload, headers);
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
