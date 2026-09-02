// Emisión de códigos de activación cortos.
//
// No hay usuario de por medio: quien llama a este endpoint es el script
// `npm run licencia` corriendo en la máquina de quien tiene la llave
// privada de la licencia (ver src/lib/licencia.js). La protección no es un
// login, es la firma: sin la llave privada, es imposible producir una
// solicitud que la verificación acepte, así que el endpoint puede quedar
// público y sólo limitado por el contador de intentos.
import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { validate } from '../lib/validate.js';
import { wrap, badRequest, unauthorized } from '../lib/errors.js';
import { rateLimit } from '../lib/ratelimit.js';
import { config } from '../config.js';
import { verificarSolicitud, generarCodigoCorto, MOTIVOS } from '../lib/licencia.js';

export const licenseAdminRouter = Router();

const emitLimiter = rateLimit({
  windowMs: 60_000, max: 20,
  message: 'Demasiadas solicitudes de emisión. Espera un minuto.'
});

const PLANES = ['basico', 'completo', 'premium'];

licenseAdminRouter.post('/emit', emitLimiter, wrap(async (req, res) => {
  const data = validate(req.body, {
    cuerpo: { type: 'string', required: true, max: 2000 },
    firma:  { type: 'string', required: true, max: 2000 }
  });

  const revision = verificarSolicitud(data, config.license.publicKey);
  if (!revision.valido) {
    throw unauthorized(MOTIVOS[revision.motivo] ||
      'Firma inválida. Sólo quien tiene la llave privada puede emitir códigos.');
  }

  const { taller, plan, dias } = revision.payload;
  const planFinal = plan && PLANES.includes(plan) ? plan : 'completo';
  if (plan && !PLANES.includes(plan)) {
    throw badRequest(`Plan desconocido: "${plan}". Usa uno de: ${PLANES.join(', ')}`);
  }
  if (dias !== null && dias !== undefined && (typeof dias !== 'number' || dias <= 0)) {
    throw badRequest('"dias" debe ser un número mayor que cero, u omitirse para que no venza');
  }

  // Colisión de un código al azar: prácticamente imposible (1 en miles de
  // millones), pero se reintenta igual en vez de confiar ciegamente.
  let code;
  for (let intentos = 0; intentos < 5; intentos++) {
    const candidato = generarCodigoCorto();
    const existe = await queryOne('SELECT 1 FROM license_codes WHERE upper(code) = upper($1)', [candidato]);
    if (!existe) { code = candidato; break; }
  }
  if (!code) throw badRequest('No se pudo generar un código único, intenta de nuevo');

  const expiresAt = dias ? new Date(Date.now() + dias * 86400_000) : null;

  await query(
    `INSERT INTO license_codes (code, plan, holder, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [code, planFinal, taller || null, expiresAt]
  );

  res.status(201).json({ code, plan: planFinal, holder: taller || null, expires_at: expiresAt });
}));
