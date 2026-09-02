// Ensamblado de la aplicación Express. `createApp()` no abre puertos: así los
// tests la levantan en memoria y el servidor real la reutiliza tal cual.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config, isProduction } from './config.js';
import { ApiError } from './lib/errors.js';
import { requireAuth, requireLicense, requirePlan } from './middleware/auth.js';

import { authRouter } from './routes/auth.routes.js';
import { licenseAdminRouter } from './routes/license-admin.routes.js';
import { customersRouter } from './routes/customers.routes.js';
import { motorcyclesRouter } from './routes/motorcycles.routes.js';
import { appointmentsRouter } from './routes/appointments.routes.js';
import { workOrdersRouter } from './routes/workorders.routes.js';
import { quotesRouter } from './routes/quotes.routes.js';
import {
  servicesRouter, partsRouter, suppliersRouter, purchasesRouter, maintenanceRouter
} from './routes/catalog.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { reportsRouter } from './routes/reports.routes.js';
import { publicRouter } from './routes/public.routes.js';
import { apiKeysRouter, integrationRouter } from './routes/integration.routes.js';
import { attachmentsRouter } from './routes/attachments.routes.js';
import { workshopRouter } from './routes/workshop.routes.js';
import { exportRouter } from './routes/export.routes.js';

const here = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Cabeceras de seguridad básicas, sin dependencias.
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  // CORS: sólo si se declaran orígenes permitidos. Por defecto el frontend se
  // sirve desde el mismo origen y no hace falta.
  const origins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origins.length) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && origins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      }
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    });
  }

  app.get('/api/health', (_req, res) =>
    res.json({
      ok: true, service: 'taller-motos', version: '0.1.0', env: config.env,
      // La pantalla de registro pregunta por el código sólo si hace falta.
      license_required: config.license.required
    }));

  // Públicas: el cliente del taller no tiene cuenta.
  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/license-admin', licenseAdminRouter);

  // Integraciones externas (llave de API).
  app.use('/api/integration/v1', integrationRouter);

  // Todo lo demás exige usuario del taller, y una licencia vigente para
  // escribir (leer se permite siempre: sus datos son suyos).
  app.use('/api', requireAuth, requireLicense);
  app.use('/api/workshop', workshopRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/motorcycles', motorcyclesRouter);
  app.use('/api/appointments', appointmentsRouter);
  app.use('/api/work-orders', workOrdersRouter);
  app.use('/api', quotesRouter);              // /work-orders/:id/quotes y /quotes/:id
  app.use('/api/services', servicesRouter);
  // Inventario (repuestos, proveedores, compras) es un módulo del plan
  // Completo en adelante.
  app.use('/api/parts', requirePlan('completo'), partsRouter);
  app.use('/api/suppliers', requirePlan('completo'), suppliersRouter);
  app.use('/api/purchases', requirePlan('completo'), purchasesRouter);
  app.use('/api/maintenance-rules', maintenanceRouter);
  app.use('/api/attachments', attachmentsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/api-keys', apiKeysRouter);
  app.use('/api/export', exportRouter);

  // Frontend estático.
  const publicDir = join(here, '..', 'public');
  app.use(express.static(publicDir));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

  // El resto de rutas las resuelve el frontend (una sola página).
  app.get('*', (_req, res) => res.sendFile(join(publicDir, 'index.html')));

  // Manejo de errores. Nunca se filtra el detalle interno en producción.
  app.use((err, _req, res, _next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'El archivo supera el tamaño máximo permitido' });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido' });
    }
    // Violación de llave foránea: el cliente mandó un id que no existe.
    if (err?.code === '23503') {
      return res.status(400).json({ error: 'Uno de los identificadores enviados no existe' });
    }
    console.error('[error]', err);
    return res.status(500).json({
      error: isProduction ? 'Error interno del servidor' : String(err.message || err)
    });
  });

  return app;
}
