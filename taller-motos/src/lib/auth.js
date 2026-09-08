import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';

export const hashPassword = (plain) => bcrypt.hash(plain, config.bcryptRounds);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, workshop_id: user.workshop_id, role: user.role, name: user.name },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

// Llaves de API: se muestran una sola vez y en la base queda sólo el hash.
// Formato: tm_<prefijo>_<secreto>
export function generateApiKey() {
  const prefix = randomBytes(6).toString('hex');
  const secret = randomBytes(24).toString('base64url');
  const full = `tm_${prefix}_${secret}`;
  return { full, prefix, hash: hashApiKey(full) };
}

export const hashApiKey = (full) => createHash('sha256').update(full).digest('hex');
