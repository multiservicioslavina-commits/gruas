// Códigos de activación: sin uno válido no se abre un taller nuevo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign, createPrivateKey } from 'node:crypto';
import {
  emitir, revisar, tipoCodigo, generarCodigoCorto, firmarSolicitud, verificarSolicitud
} from '../src/lib/licencia.js';

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

// ── Códigos cortos (TM-XXXX-XXXX) ───────────────────────────────────────

test('un código corto tiene el formato esperado y usa un alfabeto sin ambigüedades', () => {
  for (let i = 0; i < 50; i++) {
    const c = generarCodigoCorto();
    assert.match(c, /^TM-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.doesNotMatch(c, /[0O1IL]/, 'no debe usar caracteres que se confunden al dictar');
  }
});

test('tipoCodigo distingue el formato corto del largo, y rechaza lo demás', () => {
  assert.equal(tipoCodigo(generarCodigoCorto()), 'corto');
  assert.equal(tipoCodigo('tm-a2b3-c4d5'), 'corto', 'no debe importar mayúsculas/minúsculas');
  assert.equal(tipoCodigo(emitir({ privateKeyPem: PRIV }).codigo), 'largo');
  assert.equal(tipoCodigo('cualquier-cosa'), null);
  assert.equal(tipoCodigo(''), null);
  assert.equal(tipoCodigo(null), null);
});

test('una solicitud de emisión firmada se verifica con la llave pública', () => {
  const solicitud = firmarSolicitud({ privateKeyPem: PRIV, taller: 'Motos del Sur', plan: 'basico', dias: 30 });
  const r = verificarSolicitud(solicitud, PUB);
  assert.equal(r.valido, true);
  assert.equal(r.payload.taller, 'Motos del Sur');
  assert.equal(r.payload.plan, 'basico');
  assert.equal(r.payload.dias, 30);
});

test('una solicitud firmada con otra llave se rechaza', () => {
  const otra = generateKeyPairSync('ed25519');
  const solicitud = firmarSolicitud({
    privateKeyPem: otra.privateKey.export({ type: 'pkcs8', format: 'pem' }), taller: 'Pirata'
  });
  assert.equal(verificarSolicitud(solicitud, PUB).motivo, 'firma');
});

test('una solicitud alterada, aunque conserve la firma, se rechaza', () => {
  const { cuerpo, firma } = firmarSolicitud({ privateKeyPem: PRIV, taller: 'Uno', plan: 'basico' });
  const alterado = Buffer.from(JSON.stringify(
    { ...JSON.parse(Buffer.from(cuerpo, 'base64url').toString()), plan: 'premium' }
  )).toString('base64url');
  assert.equal(verificarSolicitud({ cuerpo: alterado, firma }, PUB).motivo, 'firma');
});

test('una solicitud vieja expira, así se haya capturado con una firma válida', () => {
  const payload = { taller: null, plan: 'completo', dias: null, ts: Date.now() - 10 * 60_000 };
  const cuerpo = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const firma = Buffer.from(sign(null, Buffer.from(cuerpo), createPrivateKey(PRIV))).toString('base64url');
  assert.equal(verificarSolicitud({ cuerpo, firma }, PUB).motivo, 'expirada');
});
