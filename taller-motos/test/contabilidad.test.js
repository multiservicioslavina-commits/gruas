// Contabilidad básica: plan de cuentas, libro de ingresos/gastos y el
// balance de caja por periodo, que debe juntar pagos de órdenes, compras a
// proveedores y las entradas manuales de este módulo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, closePool } from './helpers.js';

const server = await startServer();
test.after(async () => { await server.close(); await closePool(); });

const hoy = () => new Date().toISOString().slice(0, 10);

test('categorías: se crean, se listan por tipo y se pueden desactivar', async () => {
  const { client } = await createWorkshop(server.url);

  const gasto = await client.post('/api/accounting/categories', { name: 'Arriendo', kind: 'expense' });
  assert.equal(gasto.status, 201);
  const ingreso = await client.post('/api/accounting/categories', { name: 'Venta de chatarra', kind: 'income' });
  assert.equal(ingreso.status, 201);

  const soloGastos = await client.get('/api/accounting/categories?kind=expense');
  assert.equal(soloGastos.body.data.length, 1);
  assert.equal(soloGastos.body.data[0].name, 'Arriendo');

  const apagada = await client.patch(`/api/accounting/categories/${gasto.body.id}`, { active: false });
  assert.equal(apagada.status, 200);
  assert.equal(apagada.body.active, false);
});

test('movimientos: se registran, se listan por rango de fechas y se pueden editar y borrar', async () => {
  const { client } = await createWorkshop(server.url);
  const cat = (await client.post('/api/accounting/categories', { name: 'Servicios públicos', kind: 'expense' })).body;

  const creado = await client.post('/api/accounting/entries', {
    category_id: cat.id, kind: 'expense', description: 'Luz de enero', amount: 120000, entry_date: hoy()
  });
  assert.equal(creado.status, 201);
  assert.equal(creado.body.category_id, cat.id);

  const listado = await client.get(`/api/accounting/entries?from=${hoy()}&to=${hoy()}`);
  assert.equal(listado.body.data.length, 1);
  assert.equal(listado.body.data[0].category_name, 'Servicios públicos');

  const editado = await client.patch(`/api/accounting/entries/${creado.body.id}`, { amount: 135000 });
  assert.equal(editado.status, 200);
  assert.equal(editado.body.amount, 135000);

  const borrado = await client.delete(`/api/accounting/entries/${creado.body.id}`);
  assert.equal(borrado.status, 204);
  const vacio = await client.get(`/api/accounting/entries?from=${hoy()}&to=${hoy()}`);
  assert.equal(vacio.body.data.length, 0);
});

test('un taller no puede usar la categoría de otro taller', async () => {
  const { client: a } = await createWorkshop(server.url);
  const { client: b } = await createWorkshop(server.url);
  const catDeA = (await a.post('/api/accounting/categories', { name: 'Solo de A', kind: 'expense' })).body;

  const res = await b.post('/api/accounting/entries', {
    category_id: catDeA.id, kind: 'expense', description: 'Intento ajeno', amount: 1000
  });
  assert.equal(res.status, 404);
});

test('el balance de caja junta pagos de órdenes, compras y movimientos manuales', async () => {
  const { client } = await createWorkshop(server.url);

  // Ingreso desde una orden real.
  const order = await client.post('/api/work-orders', {
    plate: `CTB${Math.floor(Math.random() * 900 + 100)}`,
    customer_name: 'Cliente Contable', customer_phone: '3009998877',
    brand: 'Suzuki', model: 'GN125', complaint: 'Mantenimiento'
  });
  assert.equal(order.status, 201);
  const pago = await client.post(`/api/work-orders/${order.body.id}/payments`, { amount: 200000 });
  assert.equal(pago.status, 201);

  // Gasto desde una compra a proveedor.
  const compra = await client.post('/api/purchases', {
    items: [{ description: 'Aceite 20W50', quantity: 2, unit_cost: 25000 }]
  });
  assert.equal(compra.status, 201);

  // Movimientos manuales de ambos tipos.
  await client.post('/api/accounting/entries', {
    kind: 'income', description: 'Venta de herramienta vieja', amount: 50000, entry_date: hoy()
  });
  const catGasto = (await client.post('/api/accounting/categories', { name: 'Arriendo', kind: 'expense' })).body;
  await client.post('/api/accounting/entries', {
    kind: 'expense', category_id: catGasto.id, description: 'Arriendo de enero', amount: 800000, entry_date: hoy()
  });

  const resumen = await client.get(`/api/accounting/summary?from=${hoy()}&to=${hoy()}`);
  assert.equal(resumen.status, 200);
  assert.equal(resumen.body.income.total, 200000 + 50000);
  assert.equal(resumen.body.expense.total, 50000 + 800000); // 2 x 25000 de la compra + arriendo
  assert.equal(resumen.body.net, (200000 + 50000) - (50000 + 800000));

  const ingresoOrdenes = resumen.body.income.by_category.find((r) => r.category === 'Órdenes (pagos recibidos)');
  assert.equal(ingresoOrdenes.total, 200000);
  const gastoCompras = resumen.body.expense.by_category.find((r) => r.category === 'Repuestos y compras');
  assert.equal(gastoCompras.total, 50000);
  const gastoArriendo = resumen.body.expense.by_category.find((r) => r.category === 'Arriendo');
  assert.equal(gastoArriendo.total, 800000);
});

test('cada taller ve sólo su propia contabilidad', async () => {
  const { client: a } = await createWorkshop(server.url);
  const { client: b } = await createWorkshop(server.url);

  await a.post('/api/accounting/entries', { kind: 'expense', description: 'Gasto de A', amount: 1000, entry_date: hoy() });
  await b.post('/api/accounting/entries', { kind: 'expense', description: 'Gasto de B', amount: 2000, entry_date: hoy() });

  const deA = await a.get(`/api/accounting/entries?from=${hoy()}&to=${hoy()}`);
  assert.equal(deA.body.data.length, 1);
  assert.equal(deA.body.data[0].description, 'Gasto de A');
});
