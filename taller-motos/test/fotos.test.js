// Fotos de recepción: el respaldo del taller si después hay un reclamo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, makeClient, addUser, closePool } from './helpers.js';

const server = await startServer();
test.after(async () => { await server.close(); await closePool(); });

// Un PNG de 1×1 de verdad: el servidor mira el tipo de archivo.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

async function subir(token, campos, archivos = [['moto.png', PNG, 'image/png']]) {
  const datos = new FormData();
  for (const [k, v] of Object.entries(campos)) datos.append(k, v);
  for (const [nombre, contenido, tipo] of archivos) {
    datos.append('files', new Blob([contenido], { type: tipo }), nombre);
  }
  const res = await fetch(`${server.url}/api/attachments`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: datos
  });
  const texto = await res.text();
  return { status: res.status, body: texto ? JSON.parse(texto) : null };
}

async function ordenDePrueba(client) {
  return (await client.post('/api/work-orders', {
    plate: `FOT${Math.floor(Math.random() * 900 + 100)}`,
    customer_name: 'Cliente con Fotos', complaint: 'Rayón en el tanque'
  })).body;
}

test('se suben fotos de recepción y quedan asociadas a la orden', async () => {
  const { client, token } = await createWorkshop(server.url);
  const orden = await ordenDePrueba(client);

  const res = await subir(token, {
    entity_type: 'work_order', entity_id: orden.id, kind: 'photo', stage: 'reception'
  }, [['frente.png', PNG, 'image/png'], ['tanque.png', PNG, 'image/png']]);

  assert.equal(res.status, 201);
  assert.equal(res.body.total, 2);
  assert.equal(res.body.data[0].stage, 'reception');

  // La orden ya las muestra en su ficha.
  const ficha = (await client.get(`/api/work-orders/${orden.id}`)).body;
  assert.equal(ficha.attachments.length, 2);
  assert.ok(ficha.attachments.some((a) => a.filename === 'tanque.png'));
});

test('la foto se puede volver a descargar tal cual', async () => {
  const { client, token } = await createWorkshop(server.url);
  const orden = await ordenDePrueba(client);
  const subida = await subir(token, {
    entity_type: 'work_order', entity_id: orden.id, stage: 'reception'
  });

  const res = await fetch(`${server.url}/api/attachments/${subida.body.data[0].id}/file`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');

  const bytes = Buffer.from(await res.arrayBuffer());
  assert.deepEqual(bytes, PNG, 'debe salir el mismo archivo que entró');
});

test('no se aceptan archivos que no sean imagen o PDF', async () => {
  const { client, token } = await createWorkshop(server.url);
  const orden = await ordenDePrueba(client);

  const res = await subir(token,
    { entity_type: 'work_order', entity_id: orden.id },
    [['virus.exe', Buffer.from('MZ'), 'application/x-msdownload']]);
  assert.equal(res.status, 400);
});

test('un taller no puede ver las fotos de otro', async () => {
  const a = await createWorkshop(server.url);
  const b = await createWorkshop(server.url);
  const orden = await ordenDePrueba(a.client);
  const subida = await subir(a.token, {
    entity_type: 'work_order', entity_id: orden.id, stage: 'reception'
  });
  const fotoId = subida.body.data[0].id;

  assert.equal((await b.client.get(`/api/attachments?entity_type=work_order&entity_id=${orden.id}`))
    .body.total, 0, 'no las lista');

  const descarga = await fetch(`${server.url}/api/attachments/${fotoId}/file`, {
    headers: { Authorization: `Bearer ${b.token}` }
  });
  assert.equal(descarga.status, 404, 'ni las descarga');

  assert.equal((await b.client.delete(`/api/attachments/${fotoId}`)).status, 404,
    'ni las borra');
  assert.equal((await a.client.get(`/api/attachments/${fotoId}/file`)).status, 200,
    'y el dueño las sigue teniendo');
});

test('borrar una foto la quita de la orden', async () => {
  const { client, token } = await createWorkshop(server.url);
  const orden = await ordenDePrueba(client);
  const subida = await subir(token, { entity_type: 'work_order', entity_id: orden.id });

  assert.equal((await client.delete(`/api/attachments/${subida.body.data[0].id}`)).status, 204);
  const ficha = (await client.get(`/api/work-orders/${orden.id}`)).body;
  assert.equal(ficha.attachments.length, 0);
});

test('las fotos aparecen en la exportación del taller', async () => {
  const { client, token } = await createWorkshop(server.url);
  const orden = await ordenDePrueba(client);
  await subir(token, {
    entity_type: 'work_order', entity_id: orden.id, stage: 'reception', caption: 'Tanque'
  });

  const datos = (await client.get('/api/export')).body;
  assert.equal(datos.archivos.length, 1);
  assert.equal(datos.archivos[0].caption, 'Tanque');
  assert.equal(datos.archivos[0].storage_path, undefined, 'sin rutas internas del servidor');
});

test('el mecánico no puede borrar las fotos de la recepción', async () => {
  const { client, token } = await createWorkshop(server.url);
  const orden = await ordenDePrueba(client);
  const subida = await subir(token, {
    entity_type: 'work_order', entity_id: orden.id, stage: 'reception'
  });
  const fotoId = subida.body.data[0].id;

  // Es justo a quien le achacarían el rayón: no puede quitar la prueba.
  const mecanico = await addUser(server.url, client, 'mechanic');
  assert.equal((await mecanico.client.delete(`/api/attachments/${fotoId}`)).status, 403);
  assert.equal((await client.get(`/api/attachments/${fotoId}/file`)).status, 200,
    'la foto sigue ahí');

  // Recepción, que es quien la tomó, sí puede quitar una que salió mal.
  const recepcion = await addUser(server.url, client, 'reception');
  assert.equal((await recepcion.client.delete(`/api/attachments/${fotoId}`)).status, 204);
});
