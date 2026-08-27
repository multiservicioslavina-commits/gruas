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
    throw new Error(`Falta la variable de entorno ${name}. Copia .env.example a .env.`);
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
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10)
};

export const isProduction = config.env === 'production';

if (isProduction && config.jwt.secret === 'cambia-esto-en-produccion') {
  throw new Error('JWT_SECRET debe configurarse con un valor propio en producción.');
}
