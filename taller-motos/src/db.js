// Acceso a PostgreSQL. Un solo pool para todo el proceso.
import pg from 'pg';
import { config } from './config.js';

// Los NUMERIC de Postgres llegan como string para no perder precisión;
// en este dominio (dinero con 2 decimales) el Number de JS es suficiente y
// hace el resto del código mucho más simple.
pg.types.setTypeParser(1700, (value) => (value === null ? null : Number(value)));
pg.types.setTypeParser(20, (value) => (value === null ? null : Number(value))); // int8

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export function query(text, params) {
  return pool.query(text, params);
}

// Devuelve la primera fila o null.
export async function queryOne(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] ?? null;
}

// Ejecuta `fn` dentro de una transacción; hace rollback ante cualquier error.
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Consecutivo atómico por taller (órdenes, cotizaciones, facturas).
export async function nextSequence(client, workshopId, name) {
  const { rows } = await client.query(
    `INSERT INTO sequences (workshop_id, name, value) VALUES ($1, $2, 1)
     ON CONFLICT (workshop_id, name) DO UPDATE SET value = sequences.value + 1
     RETURNING value`,
    [workshopId, name]
  );
  return Number(rows[0].value);
}

export async function closePool() {
  await pool.end();
}
