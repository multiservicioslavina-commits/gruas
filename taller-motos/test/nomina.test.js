// Nómina básica: empleados y pagos mensuales, y que aparezcan en el balance
// y en el listado de Operaciones de Contabilidad.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createWorkshop, closePool } from './helpers.js';

const server = await startServer();
test.after(async () => { await server.close(); await closePool(); });

const hoy = () => new Date().toISOString().slice(0, 10);
const periodoActual = () => new Date().toISOString().slice(0, 7);

test('empleados: se crean, se listan y se pueden desactivar', async () => {
  const { client } = await createWorkshop(server.url);

  const creado = await client.post('/api/payroll/employees',
    { name: 'Juan Mecánico', position: 'Mecánico', base_salary: 1500000 });
  assert.equal(creado.status, 201);

  const listado = await client.get('/api/payroll/employees');
  assert.equal(listado.body.data.length, 1);
  assert.equal(listado.body.data[0].name, 'Juan Mecánico');

  const apagado = await client.patch(`/api/payroll/employees/${creado.body.id}`, { active: false });
  assert.equal(apagado.status, 200);
  assert.equal(apagado.body.active, false);
});

test('pagos: se registran contra un empleado del mismo taller', async () => {
  const { client } = await createWorkshop(server.url);
  const emp = (await client.post('/api/payroll/employees', { name: 'Ana Recepción', base_salary: 1300000 })).body;

  const pago = await client.post('/api/payroll/payments',
    { employee_id: emp.id, period: periodoActual(), amount: 1300000 });
  assert.equal(pago.status, 201, JSON.stringify(pago.body));
  assert.equal(pago.body.employee_id, emp.id);

  const listado = await client.get(`/api/payroll/payments?from=${hoy()}&to=${hoy()}`);
  assert.equal(listado.body.data.length, 1);
  assert.equal(listado.body.data[0].employee_name, 'Ana Recepción');
});

test('el periodo debe tener el formato AAAA-MM', async () => {
  const { client } = await createWorkshop(server.url);
  const emp = (await client.post('/api/payroll/employees', { name: 'Ana', base_salary: 1000000 })).body;

  const res = await client.post('/api/payroll/payments',
    { employee_id: emp.id, period: '09-2026', amount: 1000000 });
  assert.equal(res.status, 400);
});

test('un taller no puede pagarle a un empleado de otro taller', async () => {
  const { client: a } = await createWorkshop(server.url);
  const { client: b } = await createWorkshop(server.url);
  const empDeA = (await a.post('/api/payroll/employees', { name: 'De A', base_salary: 1000000 })).body;

  const res = await b.post('/api/payroll/payments',
    { employee_id: empDeA.id, period: periodoActual(), amount: 500000 });
  assert.equal(res.status, 404);
});

test('los pagos de nómina aparecen en el balance de caja como gasto', async () => {
  const { client } = await createWorkshop(server.url);
  const emp = (await client.post('/api/payroll/employees', { name: 'Empleado', base_salary: 1200000 })).body;
  await client.post('/api/payroll/payments', { employee_id: emp.id, period: periodoActual(), amount: 1200000 });

  const resumen = await client.get(`/api/accounting/summary?from=${hoy()}&to=${hoy()}`);
  assert.equal(resumen.status, 200);
  assert.equal(resumen.body.expense.total, 1200000);
  const nomina = resumen.body.expense.by_category.find((r) => r.category === 'Nómina');
  assert.equal(nomina.total, 1200000);
});

test('los pagos de nómina aparecen en el listado de Operaciones', async () => {
  const { client } = await createWorkshop(server.url);
  const emp = (await client.post('/api/payroll/employees', { name: 'Empleado Ops', base_salary: 900000 })).body;
  const pago = (await client.post('/api/payroll/payments',
    { employee_id: emp.id, period: periodoActual(), amount: 900000 })).body;

  const ops = await client.get(`/api/accounting/operations?from=${hoy()}&to=${hoy()}`);
  assert.equal(ops.status, 200);
  const fila = ops.body.data.find((o) => o.source === 'payroll');
  assert.ok(fila, 'debe aparecer la operación de nómina');
  assert.equal(fila.id, pago.id);
  assert.equal(fila.doc_type, 'Nómina');
  assert.equal(fila.counterparty, 'Empleado Ops');
  assert.equal(fila.direction, 'expense');
  assert.equal(Number(fila.amount), 900000);
});
