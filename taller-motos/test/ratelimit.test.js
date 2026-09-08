// El limitador de intentos identifica al cliente por su IP. Si confía en
// cualquier valor de X-Forwarded-For que mande el propio cliente (como pasaba
// antes, leyendo esa cabecera a mano), cualquiera puede "cambiar de
// identidad" en cada petición y saltarse el límite sin esfuerzo. La prueba
// levanta el servidor real en un proceso aparte -- el limitador se apaga a
// propósito cuando NODE_ENV=test, que es como corre todo lo demás en
// helpers.js -- y confirma que un atacante que reescribe la parte de la
// cabecera que él controla en cada petición sigue cayendo en el mismo cupo,
// mientras que un cliente real distinto tiene el suyo aparte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:5433/taller_test';

async function withServer(fn) {
  const child = spawn('node', ['-e', `
    import('./src/app.js').then(({ createApp }) => {
      const app = createApp();
      const server = app.listen(0, '127.0.0.1', () => {
        console.log('LISTENING:' + server.address().port);
      });
    }).catch((err) => { console.error(err); process.exit(1); });
  `], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'development', // cualquier valor menos "test": ese es el que apaga el limitador
      DATABASE_URL,
      JWT_SECRET: 'secreto-de-pruebas-ratelimit',
      UPLOADS_DIR: '/tmp/taller-motos-test-uploads-ratelimit'
    }
  });

  let salida = '';
  const port = await new Promise((resolve, reject) => {
    const onData = (chunk) => {
      salida += chunk.toString();
      const m = salida.match(/LISTENING:(\d+)/);
      if (m) { child.stdout.off('data', onData); resolve(Number(m[1])); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk) => { salida += chunk.toString(); });
    child.on('exit', (code) => reject(new Error(`el servidor no arrancó (code ${code}): ${salida}`)));
    setTimeout(() => reject(new Error(`el servidor no arrancó a tiempo: ${salida}`)), 10_000);
  });

  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    child.kill('SIGTERM');
  }
}

test('el límite de intentos no se salta reescribiendo X-Forwarded-For', async () => {
  await withServer(async (baseUrl) => {
    // /api/license-admin/emit rechaza cualquier firma sin tocar la base de
    // datos (no hay LICENSE_PUBLIC_KEY configurada en esta prueba), así que
    // sirve para probar el limitador solo, sin depender de Postgres.
    const emit = (xff) => fetch(`${baseUrl}/api/license-admin/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': xff },
      body: JSON.stringify({ cuerpo: 'x', firma: 'y' })
    });

    // Mismo cliente real (el último salto, el que de verdad pone el proxy)
    // en las 21 peticiones; el atacante intenta camuflarse cambiando en cada
    // una el prefijo que él mismo controla.
    const estados = [];
    for (let i = 0; i < 21; i++) {
      const res = await emit(`10.0.0.${i}, 203.0.113.9`);
      estados.push(res.status);
    }

    assert.equal(estados.slice(0, 20).every((s) => s === 401), true,
      `las primeras 20 deberían pasar el limitador (firma inválida = 401); estados: ${estados.join(',')}`);
    assert.equal(estados[20], 429,
      `la petición 21 del mismo cliente real debe quedar bloqueada; estados: ${estados.join(',')}`);

    // Un cliente real distinto (otro último salto) no hereda el bloqueo.
    const otro = await emit('10.0.0.99, 203.0.113.55');
    assert.equal(otro.status, 401,
      'un cliente real distinto no debería estar bloqueado por el cupo de otro');
  });
});
