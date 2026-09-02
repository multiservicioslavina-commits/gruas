// CRM: embudo de prospectos, bitácora de contacto y recordatorios.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, closePool } from './helpers.js';

const server = await startServer();
test.after(async () => { await server.close(); await closePool(); });

const enUnaHora = () => new Date(Date.now() + 3600_000).toISOString();
const haceUnaHora = () => new Date(Date.now() - 3600_000).toISOString();

test('prospectos: se crean con etapa "new" por defecto, se filtran por etapa y se actualizan', async () => {
  const { client } = await createWorkshop(server.url);

  const creado = await client.post('/api/crm/leads', { name: 'Pedro Prospecto', phone: '3001112233' });
  assert.equal(creado.status, 201);
  assert.equal(creado.body.stage, 'new');

  await client.post('/api/crm/leads', { name: 'Otro', stage: 'won' });

  const soloGanados = await client.get('/api/crm/leads?stage=won');
  assert.equal(soloGanados.body.data.length, 1);
  assert.equal(soloGanados.body.data[0].name, 'Otro');

  const movido = await client.patch(`/api/crm/leads/${creado.body.id}`, { stage: 'contacted' });
  assert.equal(movido.status, 200);
  assert.equal(movido.body.stage, 'contacted');
});

test('bitácora de contacto: se registra y se lista por prospecto', async () => {
  const { client } = await createWorkshop(server.url);
  const lead = (await client.post('/api/crm/leads', { name: 'María' })).body;

  const contacto = await client.post(`/api/crm/leads/${lead.id}/contacts`,
    { channel: 'whatsapp', note: 'Le mandé precios, va a pensarlo' });
  assert.equal(contacto.status, 201);

  const lista = await client.get(`/api/crm/leads/${lead.id}/contacts`);
  assert.equal(lista.body.data.length, 1);
  assert.equal(lista.body.data[0].channel, 'whatsapp');
});

test('un taller no puede registrar contacto en un prospecto de otro taller', async () => {
  const { client: a } = await createWorkshop(server.url);
  const { client: b } = await createWorkshop(server.url);
  const leadDeA = (await a.post('/api/crm/leads', { name: 'De A' })).body;

  const res = await b.post(`/api/crm/leads/${leadDeA.id}/contacts`, { note: 'Intento ajeno' });
  assert.equal(res.status, 404);
});

test('seguimientos: se agendan, aparecen en el listado global y se marcan como hechos', async () => {
  const { client } = await createWorkshop(server.url);
  const lead = (await client.post('/api/crm/leads', { name: 'Con seguimiento' })).body;

  const vencido = await client.post(`/api/crm/leads/${lead.id}/follow-ups`,
    { note: 'Llamar urgente', due_at: haceUnaHora() });
  assert.equal(vencido.status, 201);
  await client.post(`/api/crm/leads/${lead.id}/follow-ups`, { note: 'Llamar luego', due_at: enUnaHora() });

  const pendientes = await client.get('/api/crm/follow-ups?done=false');
  assert.equal(pendientes.body.data.length, 2);
  assert.equal(pendientes.body.data[0].lead_name, 'Con seguimiento');

  const vencidos = await client.get('/api/crm/follow-ups?due=overdue');
  assert.equal(vencidos.body.data.length, 1);
  assert.equal(vencidos.body.data[0].id, vencido.body.id);

  const hecho = await client.patch(`/api/crm/follow-ups/${vencido.body.id}`, { done: true });
  assert.equal(hecho.status, 200);
  assert.ok(hecho.body.done_at);

  const yaNoPendiente = await client.get('/api/crm/follow-ups?done=false');
  assert.equal(yaNoPendiente.body.data.length, 1);
});

test('el resumen cuenta el embudo por etapa y los seguimientos vencidos/de hoy', async () => {
  const { client } = await createWorkshop(server.url);

  const l1 = (await client.post('/api/crm/leads', { name: 'Uno', stage: 'new' })).body;
  await client.post('/api/crm/leads', { name: 'Dos', stage: 'won' });
  await client.post('/api/crm/leads', { name: 'Tres', stage: 'won' });

  // "Vencido" cae hoy y ya pasó: cuenta como vencido y también como de hoy.
  await client.post(`/api/crm/leads/${l1.id}/follow-ups`, { note: 'Vencido', due_at: haceUnaHora() });
  await client.post(`/api/crm/leads/${l1.id}/follow-ups`, { note: 'Hoy', due_at: enUnaHora() });

  const resumen = await client.get('/api/crm/summary');
  assert.equal(resumen.status, 200);
  assert.equal(resumen.body.total, 3);
  assert.equal(resumen.body.funnel.find((s) => s.stage === 'won').count, 2);
  assert.equal(resumen.body.funnel.find((s) => s.stage === 'new').count, 1);
  assert.equal(resumen.body.follow_ups_overdue, 1);
  assert.equal(resumen.body.follow_ups_today, 2);
});

test('cada taller ve sólo sus propios prospectos y seguimientos', async () => {
  const { client: a } = await createWorkshop(server.url);
  const { client: b } = await createWorkshop(server.url);

  await a.post('/api/crm/leads', { name: 'Prospecto de A' });
  await b.post('/api/crm/leads', { name: 'Prospecto de B' });

  const deA = await a.get('/api/crm/leads');
  assert.equal(deA.body.data.length, 1);
  assert.equal(deA.body.data[0].name, 'Prospecto de A');
});
