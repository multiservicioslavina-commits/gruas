// Enviar la orden de servicio al cliente, por correo o por WhatsApp.
//
// Ninguna prueba llama a Resend ni a Meta: se intercepta el fetch a sus
// dominios y se deja pasar el del servidor de pruebas (loopback), igual que
// hace la suite de Factus.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, closePool } from './helpers.js';
import { ordenDeServicioHtml, ordenDeServicioTexto } from '../src/lib/plantillas.js';

const server = await startServer();
test.after(async () => { await server.close(); await closePool(); });

const realFetch = global.fetch;
const enviados = [];
function conCorreoSimulado(responder = () => new Response('{"id":"re_1"}', { status: 200 })) {
  global.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.resend.com')) {
      enviados.push(JSON.parse(options.body));
      return responder();
    }
    return realFetch(url, options);
  };
}
test.afterEach(() => { global.fetch = realFetch; enviados.length = 0; });

// La orden no crea el correo del cliente: lo toma de su ficha. Así que
// cuando la prueba necesita uno, el cliente se crea aparte.
async function ordenConCliente(client, { email, ...extra } = {}) {
  let customer_id;
  if (email) {
    customer_id = (await client.post('/api/customers',
      { name: 'Ana Pérez', phone: '3001112233', email })).body.id;
  }
  const res = await client.post('/api/work-orders', {
    plate: `ENV${Math.floor(Math.random() * 900 + 100)}`,
    ...(customer_id ? { customer_id } : { customer_name: 'Ana Pérez', customer_phone: '3001112233' }),
    complaint: 'Cambio de aceite', ...extra
  });
  await client.post(`/api/work-orders/${res.body.id}/services`, {
    description: 'Cambio de aceite', quantity: 1, unit_price: 45000
  });
  return (await client.get(`/api/work-orders/${res.body.id}`)).body;
}

test('sin correo configurado, el envío lo dice en vez de callarse', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await ordenConCliente(client, { email: 'ana@ejemplo.com' });

  // El taller de pruebas no tiene RESEND_API_KEY. Un envío que falla en
  // silencio es peor que no tener el botón: el taller creería que el
  // cliente ya recibió su orden.
  const res = await client.post(`/api/work-orders/${order.id}/send`, { canal: 'email' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /no tiene configurado el envío de correos/i);
});

test('un cliente sin correo no es un error: es que no hay a dónde mandarlo', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await ordenConCliente(client);

  const res = await client.post(`/api/work-orders/${order.id}/send`, { canal: 'email' });
  assert.equal(res.status, 200);
  assert.equal(res.body.sent, false);
  assert.equal(res.body.reason, 'sin_correo');
});

test('sin WhatsApp configurado, el envío lo reporta y no lanza', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await ordenConCliente(client);

  const res = await client.post(`/api/work-orders/${order.id}/send`, { canal: 'whatsapp' });
  assert.equal(res.status, 200);
  assert.equal(res.body.sent, false);
  assert.equal(res.body.reason, 'sin_configurar');

  // Y devuelve el mensaje ya armado, para que la pantalla ofrezca el enlace
  // de wa.me sin escribir su propia versión del texto.
  assert.match(res.body.texto, /#\d+/);
  assert.match(res.body.texto, /orden\//);
});

test('el canal tiene que ser uno de los dos', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await ordenConCliente(client);

  const res = await client.post(`/api/work-orders/${order.id}/send`, { canal: 'paloma' });
  assert.equal(res.status, 400);
});

test('una orden de otro taller no se puede enviar', async () => {
  const { client: uno } = await createWorkshop(server.url);
  const { client: otro } = await createWorkshop(server.url);
  const order = await ordenConCliente(uno);

  const res = await otro.post(`/api/work-orders/${order.id}/send`, { canal: 'email' });
  assert.equal(res.status, 404);
});

// ── La plantilla ──────────────────────────────────────────────────────────
// Se prueba directamente porque es lo que ve el cliente, y porque un fallo
// aquí (un total mal, un dato interno colado) no lo atrapa ninguna otra
// prueba: el correo sale y nadie lo vuelve a mirar.

const tallerDemo = { name: 'Taller Demo', legal_name: 'Taller Demo S.A.S.',
  tax_id: '900123456', city: 'Medellín', phone: '3009998877', currency: 'COP' };

test('la plantilla lleva el total, la placa y el enlace de seguimiento', () => {
  const html = ordenDeServicioHtml(tallerDemo, {
    number: 42, status: 'closed', public_code: 'ABC123',
    customer: { name: 'Ana Pérez' },
    motorcycle: { plate: 'XYZ99A', brand: 'Bajaj', model: 'Pulsar' },
    received_at: '2026-09-01', labor_total: 45000, parts_total: 0,
    discount: 0, tax_total: 0, total: 45000,
    services: [{ description: 'Cambio de aceite', quantity: 1, unit_price: 45000, total: 45000 }],
    parts: []
  });

  assert.match(html, /Orden de servicio #42/);
  assert.match(html, /XYZ99A/);
  assert.match(html, /Ana Pérez/);
  assert.match(html, /orden\/ABC123/);
  assert.match(html, /Cambio de aceite/);
  assert.match(html, /Taller Demo S\.A\.S\./);
  assert.match(html, /NIT 900123456/);
});

test('la plantilla no muestra lo que el cliente no aprobó', () => {
  const html = ordenDeServicioHtml(tallerDemo, {
    number: 7, status: 'closed', public_code: 'DEF456',
    customer: { name: 'Luis' }, motorcycle: { plate: 'AAA11A' },
    received_at: '2026-09-01', labor_total: 20000, parts_total: 0,
    discount: 0, tax_total: 0, total: 20000,
    services: [
      { description: 'Ajuste de frenos', quantity: 1, unit_price: 20000, total: 20000, approved: true },
      { description: 'Cambio de llanta rechazado', quantity: 1, unit_price: 180000, total: 180000, approved: false }
    ],
    parts: []
  });

  assert.match(html, /Ajuste de frenos/);
  assert.ok(!html.includes('Cambio de llanta rechazado'),
    'lo que el cliente no aprobó no debe aparecer en su orden');
});

test('la plantilla escapa lo que escribió una persona', () => {
  const html = ordenDeServicioHtml(tallerDemo, {
    number: 8, status: 'closed', public_code: 'GHI789',
    customer: { name: '<script>alert(1)</script>' },
    motorcycle: { plate: 'BBB22B' },
    received_at: '2026-09-01', labor_total: 0, parts_total: 0,
    discount: 0, tax_total: 0, total: 0, services: [], parts: []
  });

  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;/);
});

test('el texto de WhatsApp va corto y con el enlace', () => {
  const texto = ordenDeServicioTexto(tallerDemo, {
    number: 42, public_code: 'ABC123',
    customer: { name: 'Ana Pérez' },
    motorcycle: { plate: 'XYZ99A', brand: 'Bajaj', model: 'Pulsar' },
    total: 45000
  });

  assert.match(texto, /Ana,/);
  assert.match(texto, /#42/);
  assert.match(texto, /XYZ99A/);
  assert.match(texto, /orden\/ABC123/);
  assert.ok(!texto.includes('<'), 'el mensaje de WhatsApp no lleva HTML');
});

test('con correo configurado, el envío llega con el asunto y el destinatario', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await ordenConCliente(client, { email: 'ana@ejemplo.com' });

  // Se fuerza la configuración del correo sólo para esta prueba: el módulo
  // lee la clave de config en cada llamada, no al importarse.
  const { config } = await import('../src/config.js');
  const antes = config.email.apiKey;
  config.email.apiKey = 're_de_prueba';
  conCorreoSimulado();
  try {
    const res = await client.post(`/api/work-orders/${order.id}/send`, { canal: 'email' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.sent, true);
    assert.equal(res.body.destino, 'ana@ejemplo.com');

    assert.equal(enviados.length, 1);
    assert.deepEqual(enviados[0].to, ['ana@ejemplo.com']);
    assert.match(enviados[0].subject, /Orden de servicio #/);
    assert.match(enviados[0].html, /Cambio de aceite/);
  } finally {
    config.email.apiKey = antes;
  }
});

test('se puede mandar a otro correo sin tocar la ficha del cliente', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await ordenConCliente(client, { email: 'ana@ejemplo.com' });

  const { config } = await import('../src/config.js');
  const antes = config.email.apiKey;
  config.email.apiKey = 're_de_prueba';
  conCorreoSimulado();
  try {
    const res = await client.post(`/api/work-orders/${order.id}/send`,
      { canal: 'email', destino: 'contador@empresa.com' });
    assert.equal(res.body.destino, 'contador@empresa.com');
    assert.deepEqual(enviados[0].to, ['contador@empresa.com']);
  } finally {
    config.email.apiKey = antes;
  }
});

test('si el servicio de correo falla, el taller se entera', async () => {
  const { client } = await createWorkshop(server.url);
  const order = await ordenConCliente(client, { email: 'ana@ejemplo.com' });

  const { config } = await import('../src/config.js');
  const antes = config.email.apiKey;
  config.email.apiKey = 're_de_prueba';
  conCorreoSimulado(() => new Response('{"message":"domain not verified"}', { status: 403 }));
  try {
    const res = await client.post(`/api/work-orders/${order.id}/send`, { canal: 'email' });
    assert.equal(res.status, 502);
    // El motivo real de Resend, no un "error al enviar" a secas.
    assert.match(res.body.error, /domain not verified/);
  } finally {
    config.email.apiKey = antes;
  }
});
