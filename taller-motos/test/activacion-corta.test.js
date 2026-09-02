// Códigos de activación cortos: emisión por API, uso único y control de
// planes. Igual que activacion.test.js, levanta su propio servidor con
// LICENSE_REQUIRED=true, así que no usa helpers.js.
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
const { firmarSolicitud } = await import('../src/lib/licencia.js');

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
  workshop_name: 'Taller con Código Corto',
  name: 'Dueño',
  email: `taller-${randomUUID()}@prueba.test`,
  password: 'clave-segura-123',
  ...extra
});

const emitir = (opciones = {}) => pedir('POST', '/api/license-admin/emit',
  firmarSolicitud({ privateKeyPem: PRIV, ...opciones }));

test('emitir un código exige la firma de la llave privada', async () => {
  const otra = generateKeyPairSync('ed25519');
  const res = await pedir('POST', '/api/license-admin/emit',
    firmarSolicitud({ privateKeyPem: otra.privateKey.export({ type: 'pkcs8', format: 'pem' }) }));
  assert.equal(res.status, 401);
});

test('emitir un código con la firma correcta devuelve un código corto y pronunciable', async () => {
  const res = await emitir({ taller: 'Motos del Sur', plan: 'basico', dias: 30 });
  assert.equal(res.status, 201);
  assert.match(res.body.code, /^TM-[A-Z0-9]{4}-[A-Z0-9]{4}$/i);
  assert.equal(res.body.plan, 'basico');
  assert.ok(res.body.expires_at);
});

test('un código corto emitido activa un taller con el plan que le dieron', async () => {
  const emitido = await emitir({ taller: 'Motos del Norte', plan: 'premium', dias: 365 });
  const res = await pedir('POST', '/api/auth/register',
    datosTaller({ license_code: emitido.body.code }));

  assert.equal(res.status, 201);
  assert.equal(res.body.workshop.license_holder, 'Motos del Norte');
  assert.equal(res.body.workshop.license_plan, 'premium');
  assert.ok(res.body.workshop.license_expires_at);
});

test('el mismo código corto no sirve dos veces', async () => {
  const emitido = await emitir({ dias: 30 });

  const primero = await pedir('POST', '/api/auth/register',
    datosTaller({ license_code: emitido.body.code }));
  assert.equal(primero.status, 201);

  const segundo = await pedir('POST', '/api/auth/register',
    datosTaller({ license_code: emitido.body.code }));
  assert.equal(segundo.status, 409);
  assert.match(segundo.body.error, /una sola vez/i);
});

test('un código corto vencido no activa nada', async () => {
  const emitido = await emitir({ dias: 1 });
  await pool.query(`UPDATE license_codes SET expires_at = NOW() - INTERVAL '1 day' WHERE code = $1`,
    [emitido.body.code]);

  const res = await pedir('POST', '/api/auth/register', datosTaller({ license_code: emitido.body.code }));
  assert.equal(res.status, 400);
  assert.match(res.body.error, /venció/i);
});

test('un código corto que no existe se rechaza con el mismo mensaje que uno falso', async () => {
  const res = await pedir('POST', '/api/auth/register', datosTaller({ license_code: 'TM-ZZZZ-ZZZZ' }));
  assert.equal(res.status, 400);
});

test('el plan del taller limita los módulos avanzados: inventario es del plan Completo', async () => {
  const basico = await emitir({ plan: 'basico', dias: 30 });
  const altaBasica = await pedir('POST', '/api/auth/register',
    datosTaller({ license_code: basico.body.code }));

  const bloqueado = await pedir('POST', '/api/parts', { name: 'Bujía' }, altaBasica.body.token);
  assert.equal(bloqueado.status, 402);
  assert.match(bloqueado.body.error, /plan Completo/i);

  const completo = await emitir({ plan: 'completo', dias: 30 });
  const altaCompleta = await pedir('POST', '/api/auth/register',
    datosTaller({ license_code: completo.body.code }));

  const permitido = await pedir('POST', '/api/parts', { name: 'Bujía' }, altaCompleta.body.token);
  assert.equal(permitido.status, 201);
});

test('contabilidad es del plan Premium: Completo no basta, Premium sí', async () => {
  const completo = await emitir({ plan: 'completo', dias: 30 });
  const altaCompleta = await pedir('POST', '/api/auth/register',
    datosTaller({ license_code: completo.body.code }));

  const bloqueado = await pedir('POST', '/api/accounting/categories',
    { name: 'Arriendo', kind: 'expense' }, altaCompleta.body.token);
  assert.equal(bloqueado.status, 402);
  assert.match(bloqueado.body.error, /plan Premium/i);

  const premium = await emitir({ plan: 'premium', dias: 30 });
  const altaPremium = await pedir('POST', '/api/auth/register',
    datosTaller({ license_code: premium.body.code }));

  const permitido = await pedir('POST', '/api/accounting/categories',
    { name: 'Arriendo', kind: 'expense' }, altaPremium.body.token);
  assert.equal(permitido.status, 201);
});

test('CRM es del plan Premium: Completo no basta, Premium sí', async () => {
  const completo = await emitir({ plan: 'completo', dias: 30 });
  const altaCompleta = await pedir('POST', '/api/auth/register',
    datosTaller({ license_code: completo.body.code }));

  const bloqueado = await pedir('POST', '/api/crm/leads', { name: 'Prospecto' }, altaCompleta.body.token);
  assert.equal(bloqueado.status, 402);
  assert.match(bloqueado.body.error, /plan Premium/i);

  const premium = await emitir({ plan: 'premium', dias: 30 });
  const altaPremium = await pedir('POST', '/api/auth/register',
    datosTaller({ license_code: premium.body.code }));

  const permitido = await pedir('POST', '/api/crm/leads', { name: 'Prospecto' }, altaPremium.body.token);
  assert.equal(permitido.status, 201);
});

test('facturar electrónicamente es del plan Premium: Completo no basta', async () => {
  const completo = await emitir({ plan: 'completo', dias: 30 });
  const altaCompleta = await pedir('POST', '/api/auth/register',
    datosTaller({ license_code: completo.body.code }));

  const bloqueado = await pedir('POST', '/api/work-orders/00000000-0000-0000-0000-000000000000/invoice',
    {}, altaCompleta.body.token);
  assert.equal(bloqueado.status, 402);
  assert.match(bloqueado.body.error, /plan Premium/i);
});
