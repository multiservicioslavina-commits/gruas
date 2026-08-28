// Códigos de activación: sin uno válido no se abre un taller nuevo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { emitir, revisar } from '../src/lib/licencia.js';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUB = publicKey.export({ type: 'spki', format: 'pem' });
const PRIV = privateKey.export({ type: 'pkcs8', format: 'pem' });

test('un código recién emitido es válido y conserva sus datos', () => {
  const { codigo } = emitir({ privateKeyPem: PRIV, taller: 'Motos del Sur', dias: 30 });
  const r = revisar(codigo, PUB);
  assert.equal(r.valido, true);
  assert.equal(r.datos.t, 'Motos del Sur');
  assert.ok(r.datos.e > Math.floor(Date.now() / 1000), 'debe traer vencimiento futuro');
});

test('un código sin días no vence nunca', () => {
  const { codigo } = emitir({ privateKeyPem: PRIV });
  const r = revisar(codigo, PUB);
  assert.equal(r.valido, true);
  assert.equal(r.datos.e, null);
});

test('no se puede fabricar un código sin la llave privada', () => {
  const otra = generateKeyPairSync('ed25519');
  const { codigo } = emitir({
    privateKeyPem: otra.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    taller: 'Pirata', dias: 999
  });
  assert.equal(revisar(codigo, PUB).motivo, 'firma');
});

test('alterar un código lo invalida', () => {
  const { codigo } = emitir({ privateKeyPem: PRIV, taller: 'Uno', dias: 1 });
  const [pre, cuerpo, firma] = codigo.split('.');

  // Cambiar el contenido, conservando la firma.
  const otroCuerpo = Buffer.from(JSON.stringify(
    { ...JSON.parse(Buffer.from(cuerpo, 'base64url').toString()), e: null }
  )).toString('base64url');
  assert.equal(revisar(`${pre}.${otroCuerpo}.${firma}`, PUB).motivo, 'firma');

  // Cambiar la firma.
  assert.equal(revisar(`${pre}.${cuerpo}.${'A'.repeat(firma.length)}`, PUB).motivo, 'firma');
});

test('un código vencido se rechaza y se dice por qué', () => {
  const { codigo } = emitir({ privateKeyPem: PRIV, dias: -1 });
  const r = revisar(codigo, PUB);
  assert.equal(r.valido, false);
  assert.equal(r.motivo, 'vencido');
});

test('la basura no revienta la comprobación', () => {
  for (const basura of ['', 'hola', 'TM1.solo-dos', 'TM9.a.b', null, undefined, 42, {}]) {
    const r = revisar(basura, PUB);
    assert.equal(r.valido, false, `debería rechazar: ${JSON.stringify(basura)}`);
  }
  assert.equal(revisar('TM1.a.b', null).motivo, 'sin_llave');
});
