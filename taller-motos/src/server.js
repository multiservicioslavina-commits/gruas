import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`taller-motos escuchando en http://localhost:${config.port} (${config.env})`);
});

// Cierre ordenado: deja terminar las peticiones en curso y suelta la base.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n${signal} recibido, cerrando...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });
}
