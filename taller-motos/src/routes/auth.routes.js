import { Router } from 'express';
import { query, queryOne, transaction } from '../db.js';
import { hashPassword, verifyPassword, signToken } from '../lib/auth.js';
import { validate } from '../lib/validate.js';
import { wrap, unauthorized, conflict, badRequest } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

// Alta de un taller nuevo con su primer usuario administrador.
// Es el único punto público que crea datos: si el despliegue es de un solo
// taller, se deshabilita con ALLOW_SIGNUP=false.
authRouter.post('/register', wrap(async (req, res) => {
  if (process.env.ALLOW_SIGNUP === 'false') {
    throw conflict('El registro público está deshabilitado en esta instalación');
  }
  const data = validate(req.body, {
    workshop_name: { type: 'string', required: true, max: 160 },
    name:          { type: 'string', required: true, max: 120 },
    email:         { type: 'email',  required: true },
    password:      { type: 'string', required: true, min: 8, max: 100 },
    phone:         { type: 'string', max: 40 },
    city:          { type: 'string', max: 80 },
    tax_rate:      { type: 'number', min: 0, max: 100, default: 0 }
  });

  const exists = await queryOne('SELECT id FROM users WHERE lower(email) = lower($1)', [data.email]);
  if (exists) throw conflict('Ese correo ya tiene una cuenta');

  const result = await transaction(async (client) => {
    const { rows: [workshop] } = await client.query(
      `INSERT INTO workshops (name, phone, city, email, tax_rate)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.workshop_name, data.phone || null, data.city || null, data.email, data.tax_rate]
    );
    const { rows: [user] } = await client.query(
      `INSERT INTO users (workshop_id, email, name, password_hash, role, phone)
       VALUES ($1, $2, $3, $4, 'admin', $5) RETURNING *`,
      [workshop.id, data.email, data.name, await hashPassword(data.password), data.phone || null]
    );
    return { workshop, user };
  });

  res.status(201).json({
    token: signToken(result.user),
    user: publicUser(result.user),
    workshop: result.workshop
  });
}));

authRouter.post('/login', wrap(async (req, res) => {
  const data = validate(req.body, {
    email:    { type: 'email',  required: true },
    password: { type: 'string', required: true }
  });

  const user = await queryOne(
    `SELECT u.*, w.name AS workshop_name FROM users u
     JOIN workshops w ON w.id = u.workshop_id
     WHERE lower(u.email) = lower($1)`,
    [data.email]
  );
  // Mismo mensaje para usuario inexistente y clave errada: no revelamos
  // qué correos están registrados.
  if (!user || !(await verifyPassword(data.password, user.password_hash))) {
    throw unauthorized('Correo o contraseña incorrectos');
  }
  if (!user.active) throw unauthorized('Tu usuario está desactivado. Habla con el administrador del taller.');

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  res.json({ token: signToken(user), user: publicUser(user) });
}));

authRouter.get('/me', requireAuth, wrap(async (req, res) => {
  const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.auth.userId]);
  const workshop = await queryOne('SELECT * FROM workshops WHERE id = $1', [req.auth.workshopId]);
  res.json({ user: publicUser(user), workshop });
}));

authRouter.post('/change-password', requireAuth, wrap(async (req, res) => {
  const data = validate(req.body, {
    current_password: { type: 'string', required: true },
    new_password:     { type: 'string', required: true, min: 8, max: 100 }
  });
  const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.auth.userId]);
  if (!(await verifyPassword(data.current_password, user.password_hash))) {
    throw badRequest('La contraseña actual no coincide');
  }
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [await hashPassword(data.new_password), user.id]);
  res.json({ ok: true });
}));

export function publicUser(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}
