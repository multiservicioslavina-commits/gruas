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
  usado:     'Ese código ya se usó para registrar un taller. Cada código sirve una sola vez.'
};

export const venceEl = (datos) => (datos?.e ? new Date(datos.e * 1000) : null);
