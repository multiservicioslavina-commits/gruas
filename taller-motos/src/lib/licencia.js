// Códigos de activación.
//
// Un código es un texto firmado con Ed25519. Lleva dentro a quién se le dio y
// hasta cuándo vale, y la firma impide fabricar uno sin la llave privada del
// dueño del producto.
//
// La llave privada NUNCA está en el código ni en el servidor: vive sólo en la
// máquina de quien emite los códigos. El servidor únicamente tiene la llave
// pública, con la que puede comprobar firmas pero no crearlas.
import { createPublicKey, createPrivateKey, sign, verify } from 'node:crypto';
import { randomUUID } from 'node:crypto';

const PREFIJO = 'TM1';

const aB64 = (buf) => Buffer.from(buf).toString('base64url');
const deB64 = (txt) => Buffer.from(txt, 'base64url');

// Firma un código. Sólo se usa desde el script de emisión.
export function emitir({ privateKeyPem, taller = null, dias = null, plan = 'completo' }) {
  const payload = {
    id: randomUUID().slice(0, 8),
    t: taller,
    p: plan,
    d: new Date().toISOString().slice(0, 10),
    // Sin días, el código no vence.
    e: dias ? Math.floor(Date.now() / 1000) + Math.round(dias * 86400) : null
  };

  const cuerpo = aB64(JSON.stringify(payload));
  const firma = aB64(sign(null, Buffer.from(cuerpo), createPrivateKey(privateKeyPem)));
  return { codigo: `${PREFIJO}.${cuerpo}.${firma}`, payload };
}

// Comprueba un código contra la llave pública.
// Devuelve { valido, motivo, datos } — nunca lanza por un código mal formado.
export function revisar(codigo, publicKeyPem) {
  if (!publicKeyPem) return { valido: false, motivo: 'sin_llave' };
  if (typeof codigo !== 'string') return { valido: false, motivo: 'formato' };

  const partes = codigo.trim().split('.');
  if (partes.length !== 3 || partes[0] !== PREFIJO) return { valido: false, motivo: 'formato' };

  const [, cuerpo, firma] = partes;

  let ok = false;
  try {
    ok = verify(null, Buffer.from(cuerpo), createPublicKey(publicKeyPem), deB64(firma));
  } catch {
    return { valido: false, motivo: 'formato' };
  }
  if (!ok) return { valido: false, motivo: 'firma' };

  let datos;
  try {
    datos = JSON.parse(deB64(cuerpo).toString('utf8'));
  } catch {
    return { valido: false, motivo: 'formato' };
  }

  if (datos.e && datos.e * 1000 < Date.now()) {
    return { valido: false, motivo: 'vencido', datos };
  }
  return { valido: true, datos };
}

// Mensajes para el usuario final, no para el registro técnico.
export const MOTIVOS = {
  sin_llave: 'Esta instalación no tiene configurada la llave de activación. Avisa a quien te entregó el software.',
  formato:   'Ese código no tiene el formato correcto. Cópialo completo, sin espacios ni saltos de línea.',
  firma:     'Ese código no es válido. Pídele uno a quien te entregó el software.',
  vencido:   'Ese código ya venció. Pide uno nuevo para seguir usando el software.',
  usado:     'Ese código ya se usó para registrar un taller. Cada código sirve una sola vez.',
  expirada:  'Esa solicitud de emisión ya expiró (vale 5 minutos). Vuelve a intentarlo.'
};

export const venceEl = (datos) => (datos?.e ? new Date(datos.e * 1000) : null);

// ─────────────────────────────────────────────────────────────────────────
// Códigos cortos (TM-XXXX-XXXX)
//
// El formato TM1.… de arriba es autocontenido (lleva la firma dentro), lo
// que lo hace larguísimo: no se puede dictar por teléfono ni escribir a
// mano. Para un código corto no hay atajo criptográfico —una firma Ed25519
// no se puede truncar—, así que el código pasa a ser sólo una llave de
// consulta al azar: el servidor guarda en `license_codes` a qué plan y
// hasta cuándo corresponde, y el código en sí no significa nada por fuera
// de esa tabla.
//
// Para que emitirlo siga sin requerir la llave privada en el servidor, la
// emisión se pide con una SOLICITUD firmada (firmarSolicitud/verificarSolicitud):
// quien tiene la llave privada firma "quiero un código para tal taller, tal
// plan, tantos días" y se la manda a POST /api/license-admin/emit. El
// servidor comprueba la firma con la llave pública (igual que con los
// códigos largos) y, sólo si es válida, genera el código corto y lo guarda.
// La llave privada nunca sale de la máquina de quien la tiene.
const ALFABETO_CORTO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I/L: no se confunden al dictar
const VENTANA_SOLICITUD_MS = 5 * 60_000;

function azar(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += ALFABETO_CORTO[Math.floor(Math.random() * ALFABETO_CORTO.length)];
  return s;
}

// TM-XXXX-XXXX: 8 símbolos al azar de un alfabeto de 32 ≈ 40 bits, más de
// mil millones de combinaciones. Suficiente contra adivinanza, sobre todo
// con el límite de intentos de registro ya existente.
export function generarCodigoCorto() {
  return `TM-${azar(4)}-${azar(4)}`;
}

const RE_CORTO = /^TM-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

// De qué tipo es un código, para saber cómo comprobarlo. `null` si no
// coincide con ningún formato conocido.
export function tipoCodigo(codigo) {
  if (typeof codigo !== 'string') return null;
  const c = codigo.trim();
  if (RE_CORTO.test(c)) return 'corto';
  if (c.startsWith(`${PREFIJO}.`)) return 'largo';
  return null;
}

// Firma una solicitud de emisión. Sólo se usa desde el script de emisión,
// en la máquina de quien tiene la llave privada.
export function firmarSolicitud({ privateKeyPem, taller = null, plan = 'completo', dias = null }) {
  const payload = { taller, plan, dias, ts: Date.now() };
  const cuerpo = aB64(JSON.stringify(payload));
  const firma = aB64(sign(null, Buffer.from(cuerpo), createPrivateKey(privateKeyPem)));
  return { cuerpo, firma };
}

// Comprueba esa solicitud en el servidor, antes de generar el código.
// Igual que `revisar`, nunca lanza: devuelve { valido, motivo, payload }.
export function verificarSolicitud({ cuerpo, firma }, publicKeyPem) {
  if (!publicKeyPem) return { valido: false, motivo: 'sin_llave' };
  if (typeof cuerpo !== 'string' || typeof firma !== 'string') return { valido: false, motivo: 'formato' };

  let ok = false;
  try {
    ok = verify(null, Buffer.from(cuerpo), createPublicKey(publicKeyPem), deB64(firma));
  } catch {
    return { valido: false, motivo: 'formato' };
  }
  if (!ok) return { valido: false, motivo: 'firma' };

  let payload;
  try {
    payload = JSON.parse(deB64(cuerpo).toString('utf8'));
  } catch {
    return { valido: false, motivo: 'formato' };
  }

  // La ventana corta evita que una solicitud capturada se pueda reenviar
  // más tarde. No es un problema grave si pasa —sólo generaría un código
  // de más—, pero cuesta poco cerrarlo.
  if (typeof payload.ts !== 'number' || Math.abs(Date.now() - payload.ts) > VENTANA_SOLICITUD_MS) {
    return { valido: false, motivo: 'expirada' };
  }
  return { valido: true, payload };
}
