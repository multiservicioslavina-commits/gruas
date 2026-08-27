import { query } from '../db.js';
import { verifyToken, hashApiKey } from '../lib/auth.js';
import { unauthorized, forbidden } from '../lib/errors.js';

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
    // efecto inmediato, sin esperar a que expire el token.
    const { rows } = await query(
      'SELECT id, workshop_id, email, name, role, active FROM users WHERE id = $1',
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
    if (!key || !key.active || key.key_hash !== hashApiKey(raw)) {
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

export const requireScope = (scope) => (req, _res, next) => {
  if (req.auth?.via !== 'api_key') return next(forbidden('Requiere llave de API'));
  if (!req.auth.scopes?.includes(scope)) return next(forbidden(`La llave no tiene el permiso "${scope}"`));
  next();
};
