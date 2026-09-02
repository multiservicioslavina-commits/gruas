// Exportar la información del taller.
//
// El taller debe poder llevarse lo suyo cuando quiera, sin pedirle permiso a
// nadie y sin depender de esta instalación. Por eso:
//   · el archivo lo genera él mismo, no hay que solicitarlo;
//   · sale en formatos que se abren en cualquier parte (JSON y CSV);
//   · funciona aunque su licencia haya vencido — son sus datos, no los nuestros.
import { Router } from 'express';
import { query } from '../db.js';
import { wrap, notFound, badRequest } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';

export const exportRouter = Router();

// Es la operación de la empresa entera: sólo el administrador del taller.
exportRouter.use(requireRole());

const filas = async (sql, params) => (await query(sql, params)).rows;

const nombreArchivo = (taller, extension) => {
  const base = String(taller?.name || 'taller')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'taller';
  return `${base}-${new Date().toISOString().slice(0, 10)}.${extension}`;
};

// ── Todo, en un solo archivo ──────────────────────────────────────────────
exportRouter.get('/', wrap(async (req, res) => {
  const w = [req.auth.workshopId];

  const [taller] = await filas(
    `SELECT id, name, legal_name, tax_id, phone, email, address, city, country,
            currency, tax_rate, timezone, settings, created_at
     FROM workshops WHERE id = $1`, w);
  if (!taller) throw notFound('Taller no encontrado');

  // Cada consulta lleva su filtro por taller: nunca sale información ajena.
  const datos = {
    exportado_el: new Date().toISOString(),
    formato: 'taller-motos/1',
    taller,
    usuarios: await filas(
      `SELECT id, name, email, role, phone, specialty, active, created_at
       FROM users WHERE workshop_id = $1 ORDER BY name`, w),
    clientes: await filas(
      'SELECT * FROM customers WHERE workshop_id = $1 ORDER BY name', w),
    motos: await filas(
      'SELECT * FROM motorcycles WHERE workshop_id = $1 ORDER BY plate', w),
    citas: await filas(
      'SELECT * FROM appointments WHERE workshop_id = $1 ORDER BY scheduled_at', w),
    servicios: await filas(
      'SELECT * FROM services WHERE workshop_id = $1 ORDER BY name', w),
    repuestos: await filas(
      'SELECT * FROM parts WHERE workshop_id = $1 ORDER BY name', w),
    proveedores: await filas(
      'SELECT * FROM suppliers WHERE workshop_id = $1 ORDER BY name', w),
    compras: await filas(
      `SELECT c.*, COALESCE((SELECT json_agg(i ORDER BY i.id) FROM purchase_items i
                             WHERE i.purchase_id = c.id), '[]'::json) AS items
       FROM purchases c WHERE c.workshop_id = $1 ORDER BY c.purchased_at`, w),
    movimientos_inventario: await filas(
      'SELECT * FROM inventory_movements WHERE workshop_id = $1 ORDER BY created_at', w),
    ordenes: await filas(
      `SELECT o.*,
              COALESCE((SELECT json_agg(s ORDER BY s.created_at) FROM work_order_services s
                        WHERE s.work_order_id = o.id), '[]'::json) AS mano_de_obra,
              COALESCE((SELECT json_agg(p ORDER BY p.created_at) FROM work_order_parts p
                        WHERE p.work_order_id = o.id), '[]'::json) AS repuestos,
              COALESCE((SELECT json_agg(d ORDER BY d.created_at) FROM diagnostics d
                        WHERE d.work_order_id = o.id), '[]'::json) AS diagnosticos,
              COALESCE((SELECT json_agg(g ORDER BY g.created_at) FROM payments g
                        WHERE g.work_order_id = o.id), '[]'::json) AS pagos,
              COALESCE((SELECT json_agg(h ORDER BY h.created_at)
                        FROM work_order_status_history h
                        WHERE h.work_order_id = o.id), '[]'::json) AS historial
       FROM work_orders o WHERE o.workshop_id = $1 ORDER BY o.number`, w),
    cotizaciones: await filas(
      `SELECT q.*,
              COALESCE((SELECT json_agg(i ORDER BY i.created_at) FROM quote_items i
                        WHERE i.quote_id = q.id), '[]'::json) AS items,
              COALESCE((SELECT json_agg(a ORDER BY a.decided_at) FROM approvals a
                        WHERE a.quote_id = q.id), '[]'::json) AS respuestas
       FROM quotes q WHERE q.workshop_id = $1 ORDER BY q.number`, w),
    facturas: await filas(
      'SELECT * FROM invoices WHERE workshop_id = $1 ORDER BY number', w),
    reglas_mantenimiento: await filas(
      'SELECT * FROM maintenance_rules WHERE workshop_id = $1 ORDER BY name', w),
    categorias_contables: await filas(
      'SELECT * FROM accounting_categories WHERE workshop_id = $1 ORDER BY name', w),
    movimientos_caja: await filas(
      'SELECT * FROM cash_entries WHERE workshop_id = $1 ORDER BY entry_date', w),
    prospectos: await filas(
      `SELECT l.*,
              COALESCE((SELECT json_agg(c ORDER BY c.created_at) FROM contact_log c
                        WHERE c.lead_id = l.id), '[]'::json) AS contactos,
              COALESCE((SELECT json_agg(f ORDER BY f.due_at) FROM follow_ups f
                        WHERE f.lead_id = l.id), '[]'::json) AS seguimientos
       FROM leads l WHERE l.workshop_id = $1 ORDER BY l.created_at`, w),
    // De los archivos va la ficha, no el contenido: se descargan aparte.
    archivos: await filas(
      `SELECT id, entity_type, entity_id, kind, stage, filename, mime_type,
              size_bytes, caption, created_at
       FROM attachments WHERE workshop_id = $1 ORDER BY created_at`, w)
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition',
    `attachment; filename="${nombreArchivo(taller, 'json')}"`);
  res.send(JSON.stringify(datos, null, 2));
}));

// ── Tablas sueltas, para abrir en Excel ───────────────────────────────────
//
// Cada columna lleva su título y su alias en la consulta. Se leen por alias,
// no por posición: si dos tablas traen una columna con el mismo nombre (por
// ejemplo el `name` del repuesto y el del proveedor), una pisaría a la otra.
const TABLAS = {
  clientes: {
    columnas: [
      ['Nombre', 'nombre'], ['Teléfono', 'telefono'], ['Correo', 'correo'],
      ['Documento', 'documento'], ['Ciudad', 'ciudad'], ['Dirección', 'direccion'],
      ['Notas', 'notas'], ['Registrado', 'registrado']
    ],
    sql: `SELECT name AS nombre, phone AS telefono, email AS correo,
                 document_number AS documento, city AS ciudad, address AS direccion,
                 notes AS notas, created_at AS registrado
          FROM customers WHERE workshop_id = $1 ORDER BY name`
  },
  motos: {
    columnas: [
      ['Placa', 'placa'], ['Marca', 'marca'], ['Línea', 'linea'], ['Modelo', 'modelo'],
      ['Cilindraje', 'cilindraje'], ['Color', 'color'], ['VIN', 'vin'],
      ['Kilometraje', 'kilometraje'], ['Dueño', 'dueno']
    ],
    sql: `SELECT m.plate AS placa, m.brand AS marca, m.model AS linea, m.year AS modelo,
                 m.engine_size AS cilindraje, m.color, m.vin, m.mileage AS kilometraje,
                 c.name AS dueno
          FROM motorcycles m LEFT JOIN customers c ON c.id = m.customer_id
          WHERE m.workshop_id = $1 ORDER BY m.plate`
  },
  ordenes: {
    columnas: [
      ['N°', 'numero'], ['Código', 'codigo'], ['Estado', 'estado'], ['Placa', 'placa'],
      ['Cliente', 'cliente'], ['Ingreso', 'ingreso'], ['Entrega', 'entrega'],
      ['Kilometraje', 'kilometraje'], ['Motivo', 'motivo'], ['Trabajo realizado', 'trabajo'],
      ['Mano de obra', 'mano_obra'], ['Repuestos', 'repuestos'], ['Descuento', 'descuento'],
      ['IVA', 'iva'], ['Total', 'total'], ['Pagado', 'pagado'], ['Saldo', 'saldo']
    ],
    sql: `SELECT o.number AS numero, o.public_code AS codigo, o.status AS estado,
                 m.plate AS placa, c.name AS cliente,
                 o.received_at AS ingreso, o.delivered_at AS entrega,
                 o.mileage_in AS kilometraje, o.complaint AS motivo,
                 o.work_performed AS trabajo, o.labor_total AS mano_obra,
                 o.parts_total AS repuestos, o.discount AS descuento,
                 o.tax_total AS iva, o.total, o.paid_total AS pagado,
                 (o.total - o.paid_total) AS saldo
          FROM work_orders o
          LEFT JOIN motorcycles m ON m.id = o.motorcycle_id
          LEFT JOIN customers   c ON c.id = o.customer_id
          WHERE o.workshop_id = $1 ORDER BY o.number`
  },
  inventario: {
    columnas: [
      ['Nombre', 'nombre'], ['SKU', 'sku'], ['Categoría', 'categoria'], ['Marca', 'marca'],
      ['Costo', 'costo'], ['Precio', 'precio'], ['Existencia', 'existencia'],
      ['Mínimo', 'minimo'], ['Ubicación', 'ubicacion'], ['Proveedor', 'proveedor']
    ],
    sql: `SELECT p.name AS nombre, p.sku, p.category AS categoria, p.brand AS marca,
                 p.cost AS costo, p.price AS precio, p.stock AS existencia,
                 p.min_stock AS minimo, p.location AS ubicacion,
                 s.name AS proveedor
          FROM parts p LEFT JOIN suppliers s ON s.id = p.supplier_id
          WHERE p.workshop_id = $1 ORDER BY p.name`
  },
  pagos: {
    columnas: [
      ['Fecha', 'fecha'], ['Orden', 'orden'], ['Placa', 'placa'], ['Cliente', 'cliente'],
      ['Monto', 'monto'], ['Método', 'metodo'], ['Referencia', 'referencia']
    ],
    sql: `SELECT g.created_at AS fecha, o.number AS orden, m.plate AS placa,
                 c.name AS cliente, g.amount AS monto, g.method AS metodo,
                 g.reference AS referencia
          FROM payments g
          JOIN work_orders o      ON o.id = g.work_order_id
          LEFT JOIN motorcycles m ON m.id = o.motorcycle_id
          LEFT JOIN customers   c ON c.id = o.customer_id
          WHERE g.workshop_id = $1 ORDER BY g.created_at`
  },
  contabilidad: {
    columnas: [
      ['Fecha', 'fecha'], ['Tipo', 'tipo'], ['Categoría', 'categoria'],
      ['Descripción', 'descripcion'], ['Monto', 'monto'], ['Método', 'metodo'], ['Notas', 'notas']
    ],
    sql: `SELECT e.entry_date AS fecha,
                 CASE e.kind WHEN 'income' THEN 'Ingreso' ELSE 'Gasto' END AS tipo,
                 COALESCE(c.name, 'Sin categoría') AS categoria,
                 e.description AS descripcion, e.amount AS monto, e.method AS metodo, e.notes AS notas
          FROM cash_entries e LEFT JOIN accounting_categories c ON c.id = e.category_id
          WHERE e.workshop_id = $1 ORDER BY e.entry_date`
  },
  prospectos: {
    columnas: [
      ['Nombre', 'nombre'], ['Teléfono', 'telefono'], ['Correo', 'correo'],
      ['Origen', 'origen'], ['Interés', 'interes'], ['Etapa', 'etapa'], ['Registrado', 'registrado']
    ],
    sql: `SELECT name AS nombre, phone AS telefono, email AS correo, source AS origen,
                 interest AS interes, stage AS etapa, created_at AS registrado
          FROM leads WHERE workshop_id = $1 ORDER BY created_at`
  }
};

// Escapa un valor para CSV. Excel en español espera punto y coma.
function celda(valor) {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return valor.toISOString().slice(0, 19).replace('T', ' ');
  const texto = String(valor);
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

exportRouter.get('/:tabla.csv', wrap(async (req, res) => {
  const definicion = TABLAS[req.params.tabla];
  if (!definicion) {
    throw badRequest(`No se puede exportar "${req.params.tabla}". Disponibles: ${Object.keys(TABLAS).join(', ')}.`);
  }

  const rows = await filas(definicion.sql, [req.auth.workshopId]);
  const lineas = [definicion.columnas.map(([titulo]) => titulo).join(';')];
  for (const fila of rows) {
    lineas.push(definicion.columnas.map(([, alias]) => celda(fila[alias])).join(';'));
  }

  const [taller] = await filas('SELECT name FROM workshops WHERE id = $1', [req.auth.workshopId]);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',
    `attachment; filename="${req.params.tabla}-${nombreArchivo(taller, 'csv')}"`);
  // El BOM hace que Excel reconozca los acentos.
  res.send('\ufeff' + lineas.join('\r\n'));
}));
