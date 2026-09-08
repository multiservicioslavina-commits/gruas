import { randomBytes, randomUUID } from 'node:crypto';

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L): el cliente dicta este código
// por teléfono o lo copia de un papel.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function publicCode(length = 6) {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// Token largo para los enlaces de aprobación de cotizaciones.
export const publicToken = () => randomBytes(24).toString('base64url');

export { randomUUID };
