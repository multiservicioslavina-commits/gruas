// Lo que la instalación se niega a hacer. Un taller que copia la plantilla y
// no cambia la clave no puede quedar abierto sin enterarse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ejecutar = promisify(execFile);

// config.js falla al importarse, así que hay que arrancarlo aparte.
async function arrancarCon(entorno) {
  try {
    const { stdout } = await ejecutar('node',
      ['-e', "import('./src/config.js').then(() => console.log('OK'))"],
      { env: { ...process.env, DATABASE_URL: 'postgres://x@127.0.0.1:1/x', ...entorno } });
    return { arranco: stdout.includes('OK'), error: '' };
  } catch (err) {
    return { arranco: false, error: String(err.stderr || err.message) };
  }
}

test('en producción no arranca con la clave de ejemplo de la plantilla', async () => {
  for (const clave of ['cambia-esto-en-produccion', 'cambia-esto-por-uno-propio']) {
    const r = await arrancarCon({ NODE_ENV: 'production', JWT_SECRET: clave });
    assert.equal(r.arranco, false, `arrancó con "${clave}"`);
    assert.match(r.error, /valor de ejemplo/);
  }
});

test('en producción no arranca con una clave demasiado corta', async () => {
  const r = await arrancarCon({ NODE_ENV: 'production', JWT_SECRET: 'corto' });
  assert.equal(r.arranco, false);
  assert.match(r.error, /demasiado corto/);
});

test('con una clave propia sí arranca', async () => {
  const r = await arrancarCon({
    NODE_ENV: 'production', JWT_SECRET: 'K7x9Lm2Qp4Rt6Vw8Yz1Ab3Cd5Ef7Gh9Jk0' });
  assert.equal(r.arranco, true, r.error);
});

test('exigir código de activación sin llave pública no arranca', async () => {
  const r = await arrancarCon({
    JWT_SECRET: 'K7x9Lm2Qp4Rt6Vw8Yz1Ab3Cd5Ef7Gh9Jk0', LICENSE_REQUIRED: 'true' });
  assert.equal(r.arranco, false);
  assert.match(r.error, /LICENSE_PUBLIC_KEY/);
});

test('en desarrollo sí arranca con la clave de ejemplo, para no estorbar', async () => {
  const r = await arrancarCon({ NODE_ENV: 'development', JWT_SECRET: 'cambia-esto-en-produccion' });
  assert.equal(r.arranco, true, r.error);
});
