import { timingSafeEqual } from 'node:crypto';
import { query } from '../db.js';
import { verifyToken, hashApiKey } from '../lib/auth.js';
import { unauthorized, forbidden, ApiError } from '../lib/errors.js';
import { config } from '../config.js';

function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

// Exige un usuario del taller. Deja en req.auth el contexto multi-tenant:
// a partir de aquí toda consulta filtra por req.auth.workshopId.
export async function requireAuth(req, _res, next) {
  try {
    const token = bearer(req);
    if (!token) throw unauthorized('Falta el token de acceso');

    let payload;
    try {
      payload = verifyToken(token);
    } catch (err) {
      throw unauthorized(err.name === 'TokenExpiredError'
        ? 'Tu sesión expiró, vuelve a entrar'
        : 'Token inválido');
    }

    // Se relee el usuario para que desactivarlo o cambiarle el rol tenga
    // efecto inmediato, sin esperar a que expire el token. De paso viene la
    // licencia del taller, para no hacer una segunda consulta por petición.
    const { rows } = await query(
      `SELECT u.id, u.workshop_id, u.email, u.name, u.role, u.active,
              w.license_expires_at, w.license_plan
       FROM users u JOIN workshops w ON w.id = u.workshop_id
       WHERE u.id = $1`,
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.active) throw unauthorized('Tu usuario ya no está activo');

    req.auth = {
      userId: user.id,
      workshopId: user.workshop_id,
      role: user.role,
      name: user.name,
      email: user.email,
      licenseExpiresAt: user.license_expires_at,
      licensePlan: user.license_plan,
      via: 'user'
    };
    next();
  } catch (err) {
    next(err);
  }
}

// Restringe una ruta a ciertos roles. `admin` siempre pasa.
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (req.auth.role === 'admin' || roles.includes(req.auth.role)) return next();
  next(forbidden(`Esta acción es sólo para: ${['admin', ...roles].join(', ')}`));
};

// Autenticación por llave de API, para integraciones externas.
// Header: X-Api-Key: tm_<prefijo>_<secreto>
export async function requireApiKey(req, _res, next) {
  try {
    const raw = String(req.headers['x-api-key'] || '').trim();
    const match = raw.match(/^tm_([0-9a-f]{12})_/);
    if (!match) throw unauthorized('Falta o es inválida la cabecera X-Api-Key');

    const { rows } = await query(
      'SELECT id, workshop_id, key_hash, scopes, active FROM api_keys WHERE prefix = $1',
      [match[1]]
    );
    const key = rows[0];
    const computedHash = hashApiKey(raw);
    const hashesMatch = key?.key_hash?.length === computedHash.length &&
      timingSafeEqual(Buffer.from(key.key_hash), Buffer.from(computedHash));
    if (!key || !key.active || !hashesMatch) {
      throw unauthorized('Llave de API inválida');
    }

    await query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [key.id]);

    req.auth = {
      workshopId: key.workshop_id,
      scopes: key.scopes,
      apiKeyId: key.id,
      role: 'integration',
      via: 'api_key'
    };
    next();
  } catch (err) {
    next(err);
  }
}

// Licencia vencida: el taller sigue viendo y exportando lo suyo, pero no
// puede seguir registrando trabajo. Quitarle el acceso a sus propios datos
// seria retenerlos como rehenes.
export function requireLicense(req, _res, next) {
  const vence = req.auth?.licenseExpiresAt;
  if (!vence || req.method === 'GET') return next();
  if (new Date(vence) > new Date()) return next();

  next(new ApiError(402,
    'Tu licencia venció. Puedes seguir consultando y exportando tu información, ' +
    'pero para registrar trabajo nuevo necesitas un código vigente.'));
}

export const requireScope = (scope) => (req, _res, next) => {
  if (req.auth?.via !== 'api_key') return next(forbidden('Requiere llave de API'));
  if (!req.auth.scopes?.includes(scope)) return next(forbidden(`La llave no tiene el permiso "${scope}"`));
  next();
};

// Módulos avanzados (inventario, reportes, integraciones...) que sólo
// vienen en los planes de pago. Instalaciones que no exigen código
// (LICENSE_REQUIRED=false) o talleres activados antes de que existiera el
// campo `license_plan` quedan con acceso completo: no hay por qué
// restringir a nadie a quien nunca se le vendió un plan.
const PLAN_RANK = { basico: 0, completo: 1, premium: 2 };
const NOMBRE_PLAN = { completo: 'Completo', premium: 'Premium' };

export const requirePlan = (minPlan) => (req, _res, next) => {
  if (!config.license.required) return next();
  const actual = PLAN_RANK[req.auth?.licensePlan] ?? PLAN_RANK.completo;
  if (actual >= PLAN_RANK[minPlan]) return next();
  next(new ApiError(402,
    `Esta función es parte del plan ${NOMBRE_PLAN[minPlan] || minPlan}. ` +
    'Pide un código de ese plan a quien te entregó el software.'));
};
