#!/usr/bin/env node
// Emite un código de activación para entregarle a un taller.
//
//   npm run licencia -- --taller "Motos del Sur" --dias 30
//   npm run licencia -- --taller "Motos del Sur"            (sin vencimiento)
import { readFileSync, existsSync } from 'node:fs';
import { emitir, venceEl } from '../src/lib/licencia.js';

const ARCHIVO = process.env.LICENSE_PRIVATE_KEY_FILE || 'licencia-privada.pem';

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
const diasTexto = argumento('dias');
const dias = diasTexto ? Number(diasTexto) : null;

if (diasTexto && (!Number.isFinite(dias) || dias <= 0)) {
  console.error('  --dias debe ser un número de días mayor que cero.');
  process.exit(1);
}

const { codigo, payload } = emitir({
  privateKeyPem: readFileSync(ARCHIVO, 'utf8'),
  taller,
  dias
});

const vence = venceEl(payload);

console.log(`
  Código de activación${taller ? ` para ${taller}` : ''}
  ─────────────────────────────────────────────────────────────────

${codigo}

  ─────────────────────────────────────────────────────────────────
  Vence:  ${vence ? vence.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : 'nunca'}
  Sirve:  una sola vez, para registrar un taller

  Cópialo completo y pásaselo a quien va a usar el software. Lo pega
  en la pantalla de registro y ya queda activado.
`);
