#!/usr/bin/env node
// Emite un código de activación corto para entregarle a un taller.
//
// Habla con el servidor (por eso hace falta internet), pero la llave
// privada nunca sale de este computador: lo que viaja es una solicitud
// FIRMADA ("quiero un código para tal taller"), y el servidor sólo la
// acepta si la firma comprueba contra la llave pública que ya tiene
// configurada. Ver docs/CODIGOS.md.
//
//   npm run licencia -- --taller "Motos del Sur" --dias 30
//   npm run licencia -- --taller "Motos del Sur" --plan basico
//   npm run licencia -- --taller "Motos del Sur"              (sin vencimiento)
//   npm run licencia -- --taller "Motos del Sur" --url https://taller.midominio.com
import { readFileSync, existsSync } from 'node:fs';
import { firmarSolicitud } from '../src/lib/licencia.js';

const ARCHIVO = process.env.LICENSE_PRIVATE_KEY_FILE || 'licencia-privada.pem';
const URL_POR_DEFECTO = process.env.LICENSE_API_URL || 'http://localhost:3000';

function argumento(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : null;
}

if (!existsSync(ARCHIVO)) {
  console.error(`
  No encuentro ${ARCHIVO}.

  Créalo una sola vez con:   npm run licencia:claves
`);
  process.exit(1);
}

const taller = argumento('taller');
const plan = argumento('plan') || 'completo';
const diasTexto = argumento('dias');
const dias = diasTexto ? Number(diasTexto) : null;
const url = (argumento('url') || URL_POR_DEFECTO).replace(/\/$/, '');

if (!['basico', 'completo', 'premium'].includes(plan)) {
  console.error('  --plan debe ser: basico, completo o premium.');
  process.exit(1);
}
if (diasTexto && (!Number.isFinite(dias) || dias <= 0)) {
  console.error('  --dias debe ser un número de días mayor que cero.');
  process.exit(1);
}

const solicitud = firmarSolicitud({
  privateKeyPem: readFileSync(ARCHIVO, 'utf8'),
  taller, plan, dias
});

let respuesta;
try {
  respuesta = await fetch(`${url}/api/license-admin/emit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(solicitud)
  });
} catch (err) {
  console.error(`
  No pude conectarme a ${url}.
  ¿Está encendido el servidor? Si es otra dirección, usa --url.

  ${err.message}
`);
  process.exit(1);
}

const cuerpo = await respuesta.json().catch(() => ({}));
if (!respuesta.ok) {
  console.error(`\n  El servidor rechazó la solicitud: ${cuerpo.error || respuesta.statusText}\n`);
  process.exit(1);
}

const vence = cuerpo.expires_at ? new Date(cuerpo.expires_at) : null;

console.log(`
  Código de activación${taller ? ` para ${taller}` : ''}
  ─────────────────────────────────────────────────────────────────

  ${cuerpo.code}

  ─────────────────────────────────────────────────────────────────
  Plan:   ${cuerpo.plan}
  Vence:  ${vence ? vence.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : 'nunca'}
  Sirve:  una sola vez, para registrar un taller

  Es corto a propósito: pásaselo por WhatsApp o díctalo por teléfono a
  quien va a usar el software. Lo escribe en la pantalla de registro y
  ya queda activado.
`);
