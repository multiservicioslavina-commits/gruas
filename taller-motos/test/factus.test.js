// Cliente de Factus: caché de token, reintento en 401 y mensajes de error
// legibles. Nunca llama a la API real: se simula `fetch`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { credentialsFor, createBill, listNumberingRanges } from '../src/lib/factus.js';

// El caché de token vive en el módulo, indexado por workshop.id: cada
// prueba usa un id distinto para no heredar el token de la anterior.
const talleres = { n: 0 };
const workshopConfigurado = () => ({
  id: `taller-${++talleres.n}`,
  factus_client_id: 'cid', factus_client_secret: 'csecret',
  factus_username: 'user@taller.test', factus_password: 'clave',
  factus_environment: 'sandbox'
});

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

test('credentialsFor: null si falta cualquiera de las cuatro credenciales', () => {
  assert.equal(credentialsFor({}), null);
  assert.equal(credentialsFor({ factus_client_id: 'x' }), null);
  assert.ok(credentialsFor(workshopConfigurado()));
});

test('createBill: pide token, llama a /v2/bills/validate y devuelve la respuesta', async () => {
  const llamadas = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    llamadas.push({ url: String(url), method: options.method });
    if (String(url).endsWith('/oauth/token')) {
      return jsonResponse(200, { access_token: 'tok123', refresh_token: 'ref123', expires_in: 3600 });
    }
    if (String(url).endsWith('/v2/bills/validate')) {
      assert.equal(options.headers.Authorization, 'Bearer tok123');
      return jsonResponse(200, { status: 'OK', data: { number: 'SETP990000001', cufe: 'abc123' } });
    }
    throw new Error(`URL inesperada: ${url}`);
  };

  try {
    const result = await createBill(workshopConfigurado(), { reference_code: 'REF-1' });
    assert.equal(result.data.number, 'SETP990000001');
    assert.equal(llamadas[0].url, 'https://api-sandbox.factus.com.co/oauth/token');
    assert.equal(llamadas[1].url, 'https://api-sandbox.factus.com.co/v2/bills/validate');
  } finally {
    global.fetch = originalFetch;
  }
});

test('createBill: reintenta una vez si el token expiró (401) y luego funciona', async () => {
  let bienIntentos = 0;
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).endsWith('/oauth/token')) {
      return jsonResponse(200, { access_token: `tok-${++bienIntentos}`, refresh_token: 'r', expires_in: 3600 });
    }
    if (String(url).endsWith('/v2/bills/validate')) {
      return bienIntentos === 1 ? jsonResponse(401, {}) : jsonResponse(200, { data: { number: 'X' } });
    }
    throw new Error('inesperado');
  };

  try {
    const result = await createBill(workshopConfigurado(), {});
    assert.equal(result.data.number, 'X');
    assert.equal(bienIntentos, 2, 'debió pedir un segundo token tras el 401');
  } finally {
    global.fetch = originalFetch;
  }
});

test('createBill: un error de validación de la DIAN llega como mensaje legible', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).endsWith('/oauth/token')) {
      return jsonResponse(200, { access_token: 't', refresh_token: 'r', expires_in: 3600 });
    }
    return jsonResponse(422, {
      status: 'Validation error',
      data: { errors: { FAK24: 'Regla FAK24: no está informado el DV del NIT' } }
    });
  };

  try {
    await assert.rejects(
      () => createBill(workshopConfigurado(), {}),
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /DV del NIT/);
        return true;
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('sin credenciales configuradas, la llamada falla con un mensaje claro antes de tocar la red', async () => {
  const originalFetch = global.fetch;
  let sePidioRed = false;
  global.fetch = async () => { sePidioRed = true; throw new Error('no debería llamarse'); };

  try {
    await assert.rejects(
      () => listNumberingRanges({ id: 'taller-2' }),
      (err) => { assert.match(err.message, /no tiene configurada su cuenta de Factus/); return true; }
    );
    assert.equal(sePidioRed, false);
  } finally {
    global.fetch = originalFetch;
  }
});
