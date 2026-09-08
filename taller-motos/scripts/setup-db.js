#!/usr/bin/env node
// Crea o actualiza el esquema en la base indicada por DATABASE_URL.
// Es idempotente: se puede correr las veces que haga falta.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';

const here = dirname(fileURLToPath(import.meta.url));

const sql = readFileSync(join(here, '..', 'db', 'schema.sql'), 'utf8');
const safeUrl = config.databaseUrl.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@');

try {
  console.log(`Aplicando esquema en ${safeUrl} ...`);
  await pool.query(sql);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS tables FROM information_schema.tables WHERE table_schema = 'public'`);
  console.log(`Listo. ${rows[0].tables} tablas y vistas en la base.`);
} catch (err) {
  console.error('No se pudo aplicar el esquema:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
