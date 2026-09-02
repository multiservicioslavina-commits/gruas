// Nómina básica (plan Premium): empleados y pagos mensuales registrados.
// No calcula seguridad social ni prestaciones — ver la nota en
// src/routes/payroll.routes.js.
import { api } from '../api.js';
import { esc, money, date, empty, toast, field, modal, confirmDialog, clean, PAYMENT_METHODS } from '../ui.js';
import { onMount } from '../app.js';

const firstOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};
const thisPeriod = () => new Date().toISOString().slice(0, 7);

export async function payrollView() {
  const state = { from: firstOfMonth(), to: new Date().toISOString().slice(0, 10) };
  let employees = [];

  const employeeOptions = () => employees.filter((e) => e.active).map((e) => [e.id, e.name]);

  const employeeFields = (emp = {}) => `
    ${field('name', 'Nombre', { required: true, value: emp.name || '' })}
    <div class="row">
      ${field('position', 'Cargo', { value: emp.position || '' })}
      ${field('base_salary', 'Salario base', { type: 'number', min: 0, value: emp.base_salary || '' })}
    </div>
    <div class="row">
      ${field('phone', 'Teléfono', { type: 'tel', value: emp.phone || '' })}
      ${field('hired_at', 'Fecha de ingreso', { type: 'date', value: emp.hired_at ? emp.hired_at.slice(0, 10) : '' })}
    </div>
    ${field('notes', 'Notas', { rows: 2, value: emp.notes || '' })}`;

  const paymentFields = (pay = {}) => `
    <div class="row">
      ${field('employee_id', 'Empleado', { required: true, value: pay.employee_id || '',
        options: employeeOptions() })}
      ${field('period', 'Periodo (AAAA-MM)', { required: true, value: pay.period || thisPeriod() })}
    </div>
    <div class="row">
      ${field('amount', 'Monto', { type: 'number', required: true, min: 0.01, step: 'any', value: pay.amount || '' })}
      ${field('paid_at', 'Fecha de pago', { type: 'date',
        value: pay.paid_at ? pay.paid_at.slice(0, 10) : new Date().toISOString().slice(0, 10) })}
    </div>
    ${field('method', 'Método', { value: pay.method || 'transfer', options: Object.entries(PAYMENT_METHODS) })}
    ${field('notes', 'Notas', { rows: 2, value: pay.notes || '' })}`;

  const loadEmployees = async () => {
    employees = (await api.get('/payroll/employees?limit=300')).data;
  };

  const load = async () => {
    const target = document.getElementById('pay-body');
    target.innerHTML = '<div class="spinner"></div>';

    await loadEmployees();
    const payments = (await api.get(`/payroll/payments?from=${state.from}&to=${state.to}`)).data;
    const totalPeriodo = payments.reduce((s, p) => s + Number(p.amount), 0);

    target.innerHTML = `
      <div class="stats">
        <div class="stat"><div class="v">${employees.filter((e) => e.active).length}</div>
          <div class="k">Empleados activos</div></div>
        <div class="stat red"><div class="v">${money(totalPeriodo)}</div>
          <div class="k">Pagado en el periodo</div></div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Pagos de nómina</h2>
          ${employees.length ? '<button class="btn btn-default btn-sm" id="btn-new-payment">Registrar pago</button>' : ''}
        </div>
        <div class="card-body tight">
          ${payments.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Fecha</th><th>Empleado</th><th>Periodo</th><th>Método</th>
              <th class="num">Monto</th><th></th></tr></thead>
            <tbody>${payments.map((pay) => `
              <tr>
                <td class="small muted">${date(pay.paid_at)}</td>
                <td class="strong">${esc(pay.employee_name)}</td>
                <td class="small muted">${esc(pay.period)}</td>
                <td class="small muted">${esc(PAYMENT_METHODS[pay.method] || pay.method)}</td>
                <td class="num strong" style="color:var(--red)">-${money(pay.amount)}</td>
                <td class="num nowrap">
                  <button class="btn btn-quiet btn-sm" data-edit-payment="${esc(pay.id)}">Editar</button>
                  <button class="btn btn-quiet btn-sm" data-del-payment="${esc(pay.id)}">Borrar</button>
                </td>
              </tr>`).join('')}</tbody>
          </table></div>` : empty('Sin pagos registrados en este periodo.', '💵')}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Empleados</h2>
          <button class="btn btn-default btn-sm" id="btn-new-employee">Nuevo empleado</button>
        </div>
        <div class="card-body tight">
          ${employees.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Nombre</th><th>Cargo</th><th class="num">Salario base</th>
              <th>Teléfono</th><th></th></tr></thead>
            <tbody>${employees.map((emp) => `
              <tr${emp.active ? '' : ' style="opacity:.5"'}>
                <td class="strong">${esc(emp.name)}</td>
                <td class="small muted">${esc(emp.position || '—')}</td>
                <td class="num">${money(emp.base_salary)}</td>
                <td class="small muted">${esc(emp.phone || '—')}</td>
                <td class="num nowrap">
                  <button class="btn btn-quiet btn-sm" data-edit-emp="${esc(emp.id)}">Editar</button>
                  <button class="btn btn-quiet btn-sm" data-toggle-emp="${esc(emp.id)}">
                    ${emp.active ? 'Desactivar' : 'Activar'}</button>
                </td>
              </tr>`).join('')}</tbody>
          </table></div>` : empty('Aún no tienes empleados registrados.', '👥')}
        </div>
      </div>`;

    bindPaymentEvents(payments);
    bindEmployeeEvents();
  };

  const bindPaymentEvents = (payments) => {
    document.getElementById('btn-new-payment')?.addEventListener('click', async () => {
      const result = await modal({
        title: 'Registrar pago',
        body: paymentFields(),
        onSubmit: (data) => api.post('/payroll/payments', clean(data, ['amount']))
      });
      if (result) { toast('Pago registrado'); load(); }
    });
    document.querySelectorAll('[data-edit-payment]').forEach((button) => {
      button.addEventListener('click', async () => {
        const pay = payments.find((p) => p.id === button.dataset.editPayment);
        const result = await modal({
          title: 'Editar pago',
          body: paymentFields(pay),
          onSubmit: (data) => api.patch(`/payroll/payments/${pay.id}`, clean(data, ['amount']))
        });
        if (result) { toast('Pago actualizado'); load(); }
      });
    });
    document.querySelectorAll('[data-del-payment]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!(await confirmDialog('No se puede deshacer.', { confirmText: 'Sí, borrarlo', title: 'Borrar pago' }))) return;
        await api.delete(`/payroll/payments/${button.dataset.delPayment}`);
        toast('Pago borrado');
        load();
      });
    });
  };

  const bindEmployeeEvents = () => {
    document.querySelectorAll('[data-edit-emp]').forEach((button) => {
      button.addEventListener('click', async () => {
        const emp = employees.find((e) => e.id === button.dataset.editEmp);
        const result = await modal({
          title: 'Editar empleado',
          body: employeeFields(emp),
          onSubmit: (data) => api.patch(`/payroll/employees/${emp.id}`, clean(data, ['base_salary']))
        });
        if (result) { toast('Empleado actualizado'); load(); }
      });
    });
    document.querySelectorAll('[data-toggle-emp]').forEach((button) => {
      button.addEventListener('click', async () => {
        const emp = employees.find((e) => e.id === button.dataset.toggleEmp);
        await api.patch(`/payroll/employees/${emp.id}`, { active: !emp.active });
        toast(emp.active ? 'Empleado desactivado' : 'Empleado activado');
        load();
      });
    });
  };

  onMount(async () => {
    // Se espera a que cargue: "Nuevo empleado" vive dentro del contenido
    // que arma load(), no en la plantilla estática.
    await load();
    for (const id of ['pay-from', 'pay-to']) {
      document.getElementById(id).addEventListener('change', (event) => {
        state[id === 'pay-from' ? 'from' : 'to'] = event.target.value;
        load();
      });
    }
    document.getElementById('btn-new-employee').addEventListener('click', async () => {
      const result = await modal({
        title: 'Nuevo empleado',
        body: employeeFields(),
        onSubmit: (data) => api.post('/payroll/employees', clean(data, ['base_salary']))
      });
      if (result) { toast('Empleado creado'); load(); }
    });
  });

  return `
    <div class="page-head">
      <div><h1>Nómina</h1><p>Empleados y pagos mensuales.</p></div>
    </div>
    <div class="toolbar no-print">
      <div class="field" style="margin:0"><label>Desde</label>
        <input type="date" id="pay-from" value="${state.from}"></div>
      <div class="field" style="margin:0"><label>Hasta</label>
        <input type="date" id="pay-to" value="${state.to}"></div>
    </div>
    <div id="pay-body"></div>`;
}
