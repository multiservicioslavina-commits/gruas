// Configuración central. Todo se lee de variables de entorno para que el
// mismo build corra en local, staging y producción sin cambios de código.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Carga .env sin dependencias externas (formato KEY=valor, # comentarios).
function loadDotEnv(file = '.env') {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

const required = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Falta la variable de entorno ${name}. Copia .env.ejemplo a .env.`);
  }
  return value;
};

export const config = {
  env:        process.env.NODE_ENV || 'development',
  port:       Number(process.env.PORT || 3000),
  databaseUrl: required('DATABASE_URL', 'postgres://postgres@127.0.0.1:5432/taller_motos'),
  jwt: {
    secret:    required('JWT_SECRET', 'cambia-esto-en-produccion'),
    expiresIn: process.env.JWT_EXPIRES_IN || '12h'
  },
  uploads: {
    dir:      process.env.UPLOADS_DIR || 'uploads',
    maxBytes: Number(process.env.UPLOADS_MAX_BYTES || 8 * 1024 * 1024)
  },
  // URL pública del frontend, para armar los enlaces que recibe el cliente.
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:3000',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),

  // Códigos de activación. La llave pública sólo sirve para comprobar
  // códigos; la privada, con la que se emiten, nunca vive en el servidor.
  license: {
    required: process.env.LICENSE_REQUIRED === 'true',
    // Se admiten saltos de línea escapados, que es como se pega en un panel.
    publicKey: (process.env.LICENSE_PUBLIC_KEY || '').replace(/\\n/g, '\n').trim() || null
  },

  // Cuenta de WhatsApp Business compartida de Ridera (plan pago, modo
  // "ridera"). Un taller que prefiera su propia cuenta la guarda en su
  // registro y no depende de esto.
  whatsapp: {
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
    ridera: {
      phoneNumberId: process.env.RIDERA_WHATSAPP_PHONE_NUMBER_ID || null,
      accessToken:   process.env.RIDERA_WHATSAPP_ACCESS_TOKEN || null
    }
  }
};

export const isProduction = config.env === 'production';

// Los valores que vienen escritos en las plantillas del repositorio. Si alguno
// llega a producción es que nadie cambió la clave, y como están publicados
// cualquiera podría firmarse una sesión y entrar al taller.
const SECRETOS_DE_PLANTILLA = [
  'cambia-esto-en-produccion',
  'cambia-esto-por-uno-propio'
];

if (isProduction) {
  if (SECRETOS_DE_PLANTILLA.includes(config.jwt.secret)) {
    throw new Error(
      'JWT_SECRET sigue con el valor de ejemplo, que está publicado en el ' +
      'repositorio: cualquiera podría entrar a tu taller. Pon uno propio con ' +
      '"openssl rand -base64 48".');
  }
  if (config.jwt.secret.length < 16) {
    throw new Error(
      'JWT_SECRET es demasiado corto para firmar sesiones. Genera uno con ' +
      '"openssl rand -base64 48".');
  }
  if (config.jwt.secret.length < 32) {
    console.warn(
      'Aviso: el JWT_SECRET es corto. Conviene uno de 32 caracteres o más, ' +
      'generado con "openssl rand -base64 48".');
  }
}

// Exigir código sin llave con qué comprobarlo dejaría a todos fuera.
if (config.license.required && !config.license.publicKey) {
  throw new Error(
    'LICENSE_REQUIRED=true necesita LICENSE_PUBLIC_KEY. ' +
    'Genera las llaves con "npm run licencia:claves".');
}
