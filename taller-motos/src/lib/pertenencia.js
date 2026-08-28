// Comprobar que una referencia es del mismo taller.
//
// El filtro `workshop_id` protege lo que se lee, pero no lo que se escribe:
// nada impedía que un taller guardara el id de un cliente, una moto, un
// proveedor o un mecánico de otro. La referencia quedaba grabada y algunos
// listados terminaban mostrando el nombre o el teléfono del taller vecino.
import { queryOne } from '../db.js';
import { assertUuid } from './validate.js';
import { notFound } from './errors.js';

// Lista cerrada: el nombre de la tabla se interpola en el SQL, así que nunca
// puede venir de fuera.
const TABLAS = {
  customers:   'Cliente',
  motorcycles: 'Moto',
  suppliers:   'Proveedor',
  parts:       'Repuesto',
  users:       'Usuario',
  quotes:      'Cotización',
  work_orders: 'Orden'
};

export async function assertDelTaller(tabla, id, workshopId, cliente = null) {
  if (id === null || id === undefined || id === '') return null;
  if (!Object.hasOwn(TABLAS, tabla)) {
    throw new Error(`Tabla no permitida en assertDelTaller: ${tabla}`);
  }
  assertUuid(id, tabla);

  const sql = `SELECT id FROM ${tabla} WHERE id = $1 AND workshop_id = $2`;
  const fila = cliente
    ? (await cliente.query(sql, [id, workshopId])).rows[0]
    : await queryOne(sql, [id, workshopId]);

  // El mismo "no encontrado" que si no existiera: quien sondea ids ajenos no
  // debe distinguir entre "no existe" y "es de otro taller".
  if (!fila) throw notFound(`${TABLAS[tabla]} no encontrado`);
  return fila.id;
}
