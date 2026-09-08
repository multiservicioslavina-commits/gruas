#!/usr/bin/env node
// Crea el par de llaves con el que emitirás los códigos de activación.
// Se ejecuta UNA sola vez, en tu máquina.
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync, existsSync, chmodSync } from 'node:fs';

const ARCHIVO = 'licencia-privada.pem';

if (existsSync(ARCHIVO)) {
  console.error(`
  Ya existe ${ARCHIVO}.

  Si lo reemplazas, TODOS los códigos que hayas entregado dejarán de servir.
  Si de verdad quieres empezar de cero, borra o renombra ese archivo primero.
`);
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const privada = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publica = publicKey.export({ type: 'spki', format: 'pem' });

writeFileSync(ARCHIVO, privada);
try { chmodSync(ARCHIVO, 0o600); } catch { /* en Windows no aplica */ }

console.log(`
  Listo. Se crearon tus llaves.

  ┌─ TU LLAVE PRIVADA ─────────────────────────────────────────────┐
  │  Quedó guardada en:  ${ARCHIVO}
  │
  │  Con ella emites códigos. Quien la tenga puede emitir códigos
  │  válidos para tu software, así que:
  │    · No la subas a GitHub (ya está en .gitignore).
  │    · No la mandes por WhatsApp ni por correo.
  │    · Guarda una copia en un lugar seguro: si la pierdes, no
  │      podrás emitir códigos nuevos.
  └────────────────────────────────────────────────────────────────┘

  Ahora configura la llave PÚBLICA en el servidor. Esta sí se puede
  compartir: sólo sirve para comprobar códigos, no para crearlos.

  Ponla en la variable de entorno LICENSE_PUBLIC_KEY, en una sola línea:

LICENSE_PUBLIC_KEY="${publica.trim().replace(/\n/g, '\\n')}"

  Y activa la exigencia de código con:

LICENSE_REQUIRED=true

  Después, para emitir un código:

  npm run licencia -- --taller "Motos del Sur" --dias 30
`);
