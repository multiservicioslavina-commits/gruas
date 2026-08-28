// El registro con código exigido, de extremo a extremo.
//
// Este archivo levanta su propio servidor con LICENSE_REQUIRED=true, así que
// no usa helpers.js: ese fija el entorno para el resto de la suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://postgres@127.0.0.1:5433/taller_test';
process.env.JWT_SECRET ||= 'secreto-de-pruebas';
process.env.LICENSE_REQUIRED = 'true';
process.env.LICENSE_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
const PRIV = privateKey.export({ type: 'pkcs8', format: 'pem' });

const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');
const { emitir } = await import('../src/lib/licencia.js');

const server = await new Promise((r) => { const s = createApp().listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

const pedir = async (metodo, ruta, cuerpo, token) => {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: {
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  const texto = await res.text();
  return { status: res.status, body: texto ? JSON.parse(texto) : null };
};

const datosTaller = (extra = {}) => ({
  workshop_name: 'Taller con Código',
  name: 'Dueño',
  email: `taller-${randomUUID()}@prueba.test`,
  password: 'clave-segura-123',
  ...extra
});

const codigoNuevo = (opciones = {}) => emitir({ privateKeyPem: PRIV, ...opciones }).codigo;

test('sin código no se puede registrar un taller', async () => {
  const res = await pedir('POST', '/api/auth/register', datosTaller());
  assert.equal(res.status, 400);
  assert.match(res.body.error, /código de activación/i);
});

test('con un código inventado tampoco', async () => {
  const res = await pedir('POST', '/api/auth/register',
    datosTaller({ license_code: 'TM1.cualquier.cosa' }));
  assert.equal(res.status, 400);
});

test('un código firmado con otra llave se rechaza', async () => {
  const otra = generateKeyPairSync('ed25519');
  const ajeno = emitir({
    privateKeyPem: otra.privateKey.export({ type: 'pkcs8', format: 'pem' }), dias: 365
  }).codigo;

  const res = await pedir('POST', '/api/auth/register', datosTaller({ license_code: ajeno }));
  assert.equal(res.status, 400);
  assert.match(res.body.error, /no es válido/i);
});

test('con un código válido el taller se crea y queda registrado a su nombre', async () => {
  const codigo = codigoNuevo({ taller: 'Motos del Sur', dias: 30 });
  const res = await pedir('POST', '/api/auth/register',
    datosTaller({ license_code: codigo }));

  assert.equal(res.status, 201);
  assert.equal(res.body.workshop.license_holder, 'Motos del Sur');
  assert.ok(res.body.workshop.license_expires_at, 'debe guardar cuándo vence');
});

test('el mismo código no sirve dos veces', async () => {
  const codigo = codigoNuevo({ dias: 30 });

  const primero = await pedir('POST', '/api/auth/register', datosTaller({ license_code: codigo }));
  assert.equal(primero.status, 201);

  const segundo = await pedir('POST', '/api/auth/register', datosTaller({ license_code: codigo }));
  assert.equal(segundo.status, 409);
  assert.match(segundo.body.error, /una sola vez/i);
});

test('un código vencido no activa nada', async () => {
  const res = await pedir('POST', '/api/auth/register',
    datosTaller({ license_code: codigoNuevo({ dias: -1 }) }));
  assert.equal(res.status, 400);
  assert.match(res.body.error, /venció/i);
});

test('con la licencia vencida se puede consultar pero no registrar trabajo', async () => {
  // Se crea con licencia vigente y se la vence a mano, que es lo que pasa
  // cuando llega la fecha.
  const alta = await pedir('POST', '/api/auth/register',
    datosTaller({ license_code: codigoNuevo({ dias: 30 }) }));
  const token = alta.body.token;

  await pool.query(
    `UPDATE workshops SET license_expires_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
    [alta.body.workshop.id]);

  const leer = await pedir('GET', '/api/customers', null, token);
  assert.equal(leer.status, 200, 'sus datos siguen siendo suyos');

  const escribir = await pedir('POST', '/api/customers', { name: 'Nuevo Cliente' }, token);
  assert.equal(escribir.status, 402);
  assert.match(escribir.body.error, /licencia venció/i);

  const orden = await pedir('POST', '/api/work-orders',
    { plate: 'VEN001', customer_name: 'X', complaint: 'y' }, token);
  assert.equal(orden.status, 402);
});

test('la salud del servicio avisa que esta instalación exige código', async () => {
  const res = await pedir('GET', '/api/health');
  assert.equal(res.body.license_required, true);
});
