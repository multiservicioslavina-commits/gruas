import { Router } from 'express';
import { query, queryOne, transaction } from '../db.js';
import { hashPassword, verifyPassword, signToken } from '../lib/auth.js';
import { validate } from '../lib/validate.js';
import { wrap, unauthorized, conflict, badRequest } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { revisar, tipoCodigo, MOTIVOS, venceEl } from '../lib/licencia.js';
import { rateLimit } from '../lib/ratelimit.js';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10,
  message: 'Demasiados intentos de inicio de sesión. Espera 15 minutos.' });
const registerLimiter = rateLimit({ windowMs: 60 * 60_000, max: 5,
  message: 'Demasiados registros desde esta dirección. Espera una hora.' });

// Almacén y taller son, de cara al usuario, dos productos aparte que sólo
// comparten motor por dentro: una cuenta de taller no debe poder entrar ni
// registrarse en el dominio de almacén, y viceversa. El dominio por el que
// entra decide el tipo -- no un selector que alguien pueda marcar mal.
// Devuelve 'almacen', 'taller', o null si el host no identifica ninguna de
// las dos plataformas.
//
// El null importa: antes esta funcion devolvia 'taller' para CUALQUIER host
// que no empezara por "almacen.", y eso rompia dos casos reales:
//
//   - www.almacen.ridera.com.co, la URL de Railway, un preview de PR o
//     localhost -> un duenio de almacen con un codigo de almacen recibia
//     "este codigo es de almacen" y no podia registrarse.
//   - el mismo caso con un codigo emitido SIN tipo (que sirve para las dos
//     plataformas) -> se le creaba un TALLER en silencio, sin un solo aviso.
//     Producto equivocado y sin vuelta atras salvo borrar la cuenta.
//
// Reconoce el subdominio en cualquier posicion (almacen.x, www.almacen.x).
function businessTypeForHost(req) {
  const host = String(req.hostname || '').toLowerCase();
  if (/(^|\.)almacen\./.test(host)) return 'almacen';
  if (/(^|\.)taller\./.test(host))  return 'taller';
  return null;
}

authRouter.post('/register', registerLimiter, wrap(async (req, res) => {
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
    tax_rate:      { type: 'number', min: 0, max: 100, default: 0 },
    license_code:  { type: 'string', max: 600 }
  });
  // El dominio decide, no lo que mande el cliente: así no hay forma de que
  // un registro por almacen.ridera.com.co cree un taller, ni al revés.
  //
  // Si el host no identifica plataforma (Railway, preview, localhost), se
  // resuelve más abajo con el tipo que traiga el código de activación —que
  // también es dato del servidor, no del cliente, así que la garantía se
  // mantiene—. Sólo si tampoco lo trae se queda en 'taller'.
  const tipoPorDominio = businessTypeForHost(req);
  data.business_type = tipoPorDominio ?? 'taller';

  // Código de activación: sin él no se abre un taller nuevo en esta
  // instalación. Se comprueba antes de tocar nada.
  //
  // Hay dos formatos posibles (ver src/lib/licencia.js): el largo TM1.…,
  // autocontenido y comprobable sin tocar la base de datos, y el corto
  // TM-XXXX-XXXX, que es sólo una llave de consulta contra `license_codes`
  // —lo que se emite ahora, porque se puede dictar por teléfono—.
  let licencia = null;
  let codigoCorto = null;
  if (config.license.required) {
    if (!data.license_code) {
      throw badRequest('Necesitas un código de activación para registrar tu taller.');
    }
    const tipo = tipoCodigo(data.license_code);

    if (tipo === 'corto') {
      codigoCorto = await queryOne(
        'SELECT * FROM license_codes WHERE upper(code) = upper($1)', [data.license_code.trim()]);
      if (!codigoCorto) throw badRequest(MOTIVOS.firma);
      if (codigoCorto.used_by_workshop_id) throw conflict(MOTIVOS.usado);
      if (codigoCorto.expires_at && new Date(codigoCorto.expires_at) < new Date()) {
        throw badRequest(MOTIVOS.vencido);
      }
      // Un código puede quedar amarrado a taller o almacén al emitirlo; si
      // lo está, tiene que coincidir con el dominio por el que entraron.
      if (codigoCorto.business_type) {
        if (tipoPorDominio === null) {
          data.business_type = codigoCorto.business_type;   // el host no decide; el código sí
        } else if (codigoCorto.business_type !== tipoPorDominio) {
          throw badRequest(MOTIVOS[`tipo_${codigoCorto.business_type}`]);
        }
      }
      licencia = {
        t: codigoCorto.holder,
        p: codigoCorto.plan,
        e: codigoCorto.expires_at ? Math.floor(new Date(codigoCorto.expires_at).getTime() / 1000) : null
      };
    } else if (tipo === 'largo') {
      const revision = revisar(data.license_code, config.license.publicKey);
      if (!revision.valido) throw badRequest(MOTIVOS[revision.motivo] || MOTIVOS.firma);
      licencia = revision.datos;

      if (licencia.bt) {
        if (tipoPorDominio === null) {
          data.business_type = licencia.bt;                 // el host no decide; el código sí
        } else if (licencia.bt !== tipoPorDominio) {
          throw badRequest(MOTIVOS[`tipo_${licencia.bt}`]);
        }
      }

      const yaUsado = await queryOne('SELECT id FROM workshops WHERE license_id = $1', [licencia.id]);
      if (yaUsado) throw conflict(MOTIVOS.usado);
    } else {
      throw badRequest(MOTIVOS.formato);
    }
  }

  // Taller y almacén son dos plataformas aparte: el mismo correo puede
  // tener una cuenta en cada una (no es "la misma cuenta" repetida), así
  // que el choque sólo importa dentro de la plataforma que se está
  // registrando.
  const exists = await queryOne(
    'SELECT id FROM users WHERE lower(email) = lower($1) AND business_type = $2',
    [data.email, data.business_type]);
  if (exists) throw conflict('Ese correo ya tiene una cuenta');

  let result;
  try {
    result = await transaction(async (client) => {
      const { rows: [workshop] } = await client.query(
        `INSERT INTO workshops (name, phone, city, email, tax_rate, business_type,
                                license_code, license_id, license_holder, license_plan,
                                license_expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [data.workshop_name, data.phone || null, data.city || null, data.email, data.tax_rate,
         data.business_type,
         licencia ? data.license_code : null, licencia?.id || codigoCorto?.id || null, licencia?.t || null,
         licencia?.p || null, licencia ? venceEl(licencia) : null]
      );

      // Toda cuenta arranca con una sucursal Principal: el resto del sistema
      // (moveStock) asume que siempre hay una bodega por defecto.
      await client.query(
        `INSERT INTO warehouses (workshop_id, name, is_default) VALUES ($1, 'Principal', TRUE)`,
        [workshop.id]);

      // Y con los dos tipos de documento de siempre. Son filas suyas, no
      // constantes del software: puede cambiarles el código, el nombre y el
      // prefijo en Ajustes, porque los números exactos dependen de su
      // resolución de la DIAN y de cómo los tenga en su contabilidad.
      await client.query(
        `INSERT INTO document_types (workshop_id, code, name, sends_to_dian, sort_order)
         VALUES ($1,'10','Factura de venta',FALSE,1),
                ($1,'1030','Factura electrónica de venta',TRUE,2)`,
        [workshop.id]);

      // El código corto se marca usado dentro de la misma transacción, con
      // una condición en el UPDATE (no un SELECT previo) para que dos
      // registros a la vez con el mismo código no se lo lleven ambos.
      if (codigoCorto) {
        const { rowCount } = await client.query(
          `UPDATE license_codes SET used_by_workshop_id = $1, used_at = NOW()
           WHERE id = $2 AND used_by_workshop_id IS NULL`,
          [workshop.id, codigoCorto.id]
        );
        if (rowCount === 0) throw conflict(MOTIVOS.usado);
      }

      const { rows: [user] } = await client.query(
        `INSERT INTO users (workshop_id, email, name, password_hash, role, phone, business_type)
         VALUES ($1, $2, $3, $4, 'admin', $5, $6) RETURNING *`,
        [workshop.id, data.email, data.name, await hashPassword(data.password), data.phone || null,
         data.business_type]
      );
      return { workshop, user };
    });
  } catch (err) {
    // El código largo (TM1....) no tiene un UPDATE condicional como el
    // corto: su "no usado" se comprueba con un SELECT antes de la
    // transacción (yaUsado, arriba), que dos registros a la vez con el
    // mismo código pueden pasar ambos. El índice único de abajo evita que
    // los dos lleguen a activarse -- lo que faltaba era traducir ese
    // choque en el mensaje de siempre, en vez de un error genérico.
    // El correo tiene el mismo hueco (exists, arriba) y el mismo índice.
    if (err?.code === '23505' && err?.constraint === 'workshops_license_id_key') {
      throw conflict(MOTIVOS.usado);
    }
    if (err?.code === '23505' && err?.constraint === 'users_email_business_type_key') {
      throw conflict('Ese correo ya tiene una cuenta');
    }
    throw err;
  }

  res.status(201).json({
    token: signToken(result.user),
    user: publicUser(result.user),
    workshop: result.workshop
  });
}));

authRouter.post('/login', loginLimiter, wrap(async (req, res) => {
  const data = validate(req.body, {
    email:    { type: 'email',  required: true },
    password: { type: 'string', required: true }
  });

  const tipoPorDominio = businessTypeForHost(req);

  // El mismo correo puede existir en las DOS plataformas: el índice único es
  // (lower(email), business_type), no el correo a secas. Alguien con taller y
  // almacén usa el mismo de los dos lados, que es lo natural.
  //
  // Por eso hay que traerlas todas y elegir según el dominio. Antes esto era
  // un queryOne sin filtrar, o sea "la primera fila que devuelva Postgres":
  // con el correo repetido, ganaba una al azar y el control de más abajo
  // rebotaba al dueño de su propia cuenta -- sin forma de entrar a la otra.
  const { rows: cuentas } = await query(
    `SELECT u.*, w.name AS workshop_name, w.business_type FROM users u
     JOIN workshops w ON w.id = u.workshop_id
     WHERE lower(u.email) = lower($1)`,
    [data.email]
  );

  // Con dominio, manda el dominio. Si no hay cuenta de ese tipo se deja la
  // que haya: el control de abajo dará el mensaje que explica por dónde
  // entrar, que es más útil que un "correo o contraseña incorrectos".
  const user = (tipoPorDominio && cuentas.find((c) => c.business_type === tipoPorDominio))
    || cuentas[0];

  // Mismo mensaje para usuario inexistente y clave errada: no revelamos
  // qué correos están registrados.
  if (!user || !(await verifyPassword(data.password, user.password_hash))) {
    throw unauthorized('Correo o contraseña incorrectos');
  }
  if (!user.active) throw unauthorized('Tu usuario está desactivado. Habla con el administrador del taller.');
  // Almacén y taller son dominios aparte: una cuenta de taller no entra por
  // el dominio de almacén, ni al revés, aunque la contraseña sea correcta.
  //
  // Sólo se exige cuando el host identifica una plataforma. Si no la
  // identifica (URL de Railway, preview de un PR, localhost), no hay nada
  // que separar y la cuenta entra con el tipo que tenga: antes ese caso
  // resolvía a 'taller' por defecto, así que NINGÚN usuario de almacén podía
  // iniciar sesión fuera de almacen.ridera.com.co -- ni siquiera para probar.
  if (tipoPorDominio !== null && user.business_type !== tipoPorDominio) {
    // `ir_a` es para que la pantalla pueda poner un botón en vez de dejar al
    // usuario leyendo un dominio para escribirlo a mano.
    // El dominio se queda en el texto además de en `ir_a`: el botón es una
    // comodidad de esta pantalla, pero el mensaje tiene que valerse solo
    // para quien llame la API, o si el botón no se llega a pintar.
    const err = unauthorized(user.business_type === 'almacen'
      ? 'Esta cuenta es de un almacén de repuestos. Entra por almacen.ridera.com.co'
      : 'Esta cuenta es de un taller. Entra por el dominio de tu taller.');
    err.details = { ir_a: user.business_type };
    throw err;
  }

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  // Devolver también el taller evita que el frontend arranque sin saber su
  // moneda, su IVA ni su nombre hasta la siguiente recarga.
  const workshop = await queryOne('SELECT * FROM workshops WHERE id = $1', [user.workshop_id]);
  res.json({ token: signToken(user), user: publicUser(user), workshop });
}));

authRouter.get('/me', requireAuth, wrap(async (req, res) => {
  const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.auth.userId]);
  const workshop = await queryOne('SELECT * FROM workshops WHERE id = $1', [req.auth.workshopId]);

  // ¿El mismo correo tiene cuenta en la otra plataforma? Con eso la interfaz
  // pone un botón para saltar, en vez de obligar a recordar el otro dominio.
  // Es dato del propio usuario sobre sí mismo, no se filtra nada de nadie.
  const otra = await queryOne(
    `SELECT w.name FROM users u JOIN workshops w ON w.id = u.workshop_id
      WHERE lower(u.email) = lower($1) AND u.business_type <> $2 AND u.active`,
    [user.email, user.business_type]);

  res.json({
    user: publicUser(user),
    workshop,
    otra_plataforma: otra
      ? { business_type: user.business_type === 'taller' ? 'almacen' : 'taller', name: otra.name }
      : null
  });
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
