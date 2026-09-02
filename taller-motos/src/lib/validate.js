// Validación mínima de payloads, sin dependencias.
//
//   const data = validate(req.body, {
//     name:  { type: 'string', required: true, max: 120 },
//     price: { type: 'number', min: 0, default: 0 }
//   });
//
// Devuelve un objeto sólo con las claves declaradas: lo que el cliente mande
// de más se descarta, así ninguna ruta escribe columnas que no espera.
import { badRequest } from './errors.js';

const isBlank = (v) => v === undefined || v === null || v === '';

function coerce(field, rule, value) {
  switch (rule.type) {
    case 'number': {
      const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''));
      if (Number.isNaN(n)) throw badRequest(`"${field}" debe ser un número`);
      if (rule.min !== undefined && n < rule.min) throw badRequest(`"${field}" no puede ser menor que ${rule.min}`);
      if (rule.max !== undefined && n > rule.max) throw badRequest(`"${field}" no puede ser mayor que ${rule.max}`);
      return rule.integer ? Math.round(n) : n;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 1 || value === '1') return true;
      if (value === 'false' || value === 0 || value === '0') return false;
      throw badRequest(`"${field}" debe ser true o false`);
    case 'date': {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw badRequest(`"${field}" no es una fecha válida`);
      return d.toISOString();
    }
    case 'array':
      if (!Array.isArray(value)) throw badRequest(`"${field}" debe ser una lista`);
      return value;
    case 'object':
      if (typeof value !== 'object' || Array.isArray(value)) throw badRequest(`"${field}" debe ser un objeto`);
      return value;
    case 'email': {
      const s = String(value).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw badRequest(`"${field}" no es un correo válido`);
      return s;
    }
    default: {
      const s = String(value).trim();
      if (rule.max && s.length > rule.max) throw badRequest(`"${field}" supera los ${rule.max} caracteres`);
      if (rule.min && s.length < rule.min) throw badRequest(`"${field}" debe tener al menos ${rule.min} caracteres`);
      if (rule.enum && !rule.enum.includes(s)) {
        throw badRequest(`"${field}" debe ser uno de: ${rule.enum.join(', ')}`);
      }
      if (rule.uppercase) return s.toUpperCase();
      return s;
    }
  }
}

export function validate(payload, schema) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const out = {};

  for (const [field, rule] of Object.entries(schema)) {
    const value = source[field];

    if (isBlank(value)) {
      if (rule.required) throw badRequest(`Falta "${field}"`);
      if (rule.default !== undefined) out[field] = rule.default;
      else if (field in source) out[field] = null;   // permite borrar un valor
      continue;
    }
    out[field] = coerce(field, rule, value);
  }
  return out;
}

// Comprueba que un parámetro de ruta sea un UUID antes de tocar la base.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function assertUuid(value, name = 'id') {
  if (!UUID_RE.test(String(value || ''))) throw badRequest(`"${name}" no es un identificador válido`);
  return value;
}

// Construye "col1 = $1, col2 = $2" a partir de un objeto ya validado.
export function buildUpdate(data, startIndex = 1) {
  const keys = Object.keys(data);
  const sets = keys.map((k, i) => `${k} = $${i + startIndex}`);
  return { sets: sets.join(', '), values: keys.map((k) => data[k]), count: keys.length };
}
