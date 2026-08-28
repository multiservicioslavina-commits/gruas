import { ApiError } from './errors.js';

// Limitador de intentos en memoria. Suficiente para una instancia: si escala
// a varias réplicas, se sustituye por Redis. No añade dependencias.
const buckets = new Map();

const CLEANUP_INTERVAL = 5 * 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (now - b.first > b.window) buckets.delete(key);
  }
}, CLEANUP_INTERVAL).unref();

export function rateLimit({ windowMs = 15 * 60_000, max = 10, keyFn, message } = {}) {
  return (req, _res, next) => {
    const key = keyFn
      ? keyFn(req)
      : (req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress);
    const now = Date.now();
    let b = buckets.get(key);

    if (!b || now - b.first > windowMs) {
      b = { first: now, count: 0, window: windowMs };
      buckets.set(key, b);
    }
    b.count++;

    if (b.count > max) {
      return next(new ApiError(429,
        message || 'Demasiados intentos. Espera unos minutos antes de volver a intentar.'));
    }
    next();
  };
}
