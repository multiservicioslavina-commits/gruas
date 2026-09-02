// Contabilidad básica (plan Premium): plan de cuentas, libro de
// ingresos/gastos y balance de caja por periodo.
import { api } from '../api.js';
import { esc, money, date, empty, toast, field, modal, confirmDialog, clean, PAYMENT_METHODS } from '../ui.js';
import { onMount } from '../app.js';

const firstOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};

const KIND_LABEL = { income: 'Ingreso', expense: 'Gasto' };

export async function accountingView() {
  const state = { from: firstOfMonth(), to: new Date().toISOString().slice(0, 10) };
  let categories = [];

  const categoryOptions = (kind) => [['', 'Sin categoría'],
    ...categories.filter((c) => c.kind === kind).map((c) => [c.id, c.name])];

  const entryFields = (entry = {}) => `
    <div class="row">
      ${field('kind', 'Tipo', { value: entry.kind || 'expense',
        options: [['expense', 'Gasto'], ['income', 'Ingreso']] })}
      ${field('entry_date', 'Fecha', { type: 'date',
        value: entry.entry_date ? entry.entry_date.slice(0, 10) : new Date().toISOString().slice(0, 10) })}
    </div>
    ${field('description', 'Descripción', { required: true, value: entry.description || '',
      placeholder: 'Arriendo de enero, venta de una herramienta usada...' })}
    <div class="row">
      ${field('amount', 'Monto', { type: 'number', required: true, min: 0.01, step: 'any',
        value: entry.amount || '' })}
      ${field('method', 'Método', { value: entry.method || 'cash',
        options: Object.entries(PAYMENT_METHODS) })}
    </div>
    ${field('category_id', 'Categoría', { value: entry.category_id || '',
      options: categoryOptions(entry.kind || 'expense') })}
    ${field('notes', 'Notas', { rows: 2, value: entry.notes || '' })}`;

  const loadCategories = async () => {
    categories = (await api.get('/accounting/categories?limit=300')).data;
  };

  const load = async () => {
    const target = document.getElementById('acc-body');
    target.innerHTML = '<div class="spinner"></div>';

    await loadCategories();
    const [summary, entries, operations] = await Promise.all([
      api.get(`/accounting/summary?from=${state.from}&to=${state.to}`),
      api.get(`/accounting/entries?from=${state.from}&to=${state.to}`),
      api.get(`/accounting/operations?from=${state.from}&to=${state.to}`)
    ]);

    const categoryList = (rows) => rows.length ? `<div class="totals">
        ${rows.map((row) => `<div class="line"><span>${esc(row.category)}</span>
          <span>${money(row.total)}</span></div>`).join('')}
      </div>` : empty('Nada en este periodo.', '📄');

    target.innerHTML = `
      <div class="stats">
        <div class="stat green"><div class="v">${money(summary.income.total)}</div>
          <div class="k">Ingresos</div></div>
        <div class="stat red"><div class="v">${money(summary.expense.total)}</div>
          <div class="k">Gastos</div></div>
        <div class="stat ${summary.net >= 0 ? 'accent' : 'red'}">
          <div class="v">${money(summary.net)}</div>
          <div class="k">Balance neto</div></div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Operaciones</h2></div>
        <div class="card-body tight">
          ${operations.data.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Fecha</th><th>Documento</th><th>Código</th><th>Tercero</th>
              <th>Detalle</th><th class="num">Monto</th><th>Estado</th></tr></thead>
            <tbody>${operations.data.map((op) => `
              <tr>
                <td class="small muted">${date(op.doc_date)}</td>
                <td><span class="tag ${op.direction === 'income' ? 'tag-green' : 'tag-red'}">
                  ${esc(op.doc_type)}</span></td>
                <td class="small muted">${esc(op.doc_code || '—')}</td>
                <td class="strong">${esc(op.counterparty || '—')}</td>
                <td class="small muted">${esc(op.detail || '—')}</td>
                <td class="num strong" style="color:var(--${op.direction === 'income' ? 'green' : 'red'})">
                  ${op.direction === 'income' ? '+' : '-'}${money(op.amount)}</td>
                <td class="small muted">${esc(op.status)}</td>
              </tr>`).join('')}</tbody>
          </table></div>` : empty('Sin operaciones en este periodo.', '📋')}
        </div>
      </div>

      <div class="grid cols-2">
        <div class="card">
          <div class="card-head"><h2>Ingresos por categoría</h2></div>
          <div class="card-body">${categoryList(summary.income.by_category)}</div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Gastos por categoría</h2></div>
          <div class="card-body">${categoryList(summary.expense.by_category)}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Movimientos</h2>
          <button class="btn btn-default btn-sm" id="btn-new-entry">Nuevo movimiento</button>
        </div>
        <div class="card-body tight">
          ${entries.data.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Descripción</th>
              <th class="num">Monto</th><th></th></tr></thead>
            <tbody>${entries.data.map((entry) => `
              <tr>
                <td class="small muted">${date(entry.entry_date)}</td>
                <td><span class="tag ${entry.kind === 'income' ? 'tag-green' : 'tag-red'}">
                  ${KIND_LABEL[entry.kind]}</span></td>
                <td class="small muted">${esc(entry.category_name || 'Sin categoría')}</td>
                <td class="strong">${esc(entry.description)}
                  ${entry.notes ? `<div class="faint">${esc(entry.notes)}</div>` : ''}</td>
                <td class="num strong" style="color:var(--${entry.kind === 'income' ? 'green' : 'red'})">
                  ${entry.kind === 'income' ? '+' : '-'}${money(entry.amount)}</td>
                <td class="num nowrap">
                  <button class="btn btn-quiet btn-sm" data-edit-entry="${esc(entry.id)}">Editar</button>
                  <button class="btn btn-quiet btn-sm" data-del-entry="${esc(entry.id)}">Borrar</button>
                </td>
              </tr>`).join('')}</tbody>
          </table></div>` : empty('Sin movimientos manuales en este periodo.', '💰')}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Plan de cuentas</h2>
          <button class="btn btn-default btn-sm" id="btn-new-category">Nueva categoría</button>
        </div>
        <div class="card-body tight">
          ${categories.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Nombre</th><th>Tipo</th><th></th></tr></thead>
            <tbody>${categories.map((cat) => `
              <tr${cat.active ? '' : ' style="opacity:.5"'}>
                <td class="strong">${esc(cat.name)}</td>
                <td><span class="tag ${cat.kind === 'income' ? 'tag-green' : 'tag-red'}">
                  ${KIND_LABEL[cat.kind]}</span></td>
                <td class="num nowrap">
                  <button class="btn btn-quiet btn-sm" data-edit-cat="${esc(cat.id)}">Editar</button>
                  <button class="btn btn-quiet btn-sm" data-toggle-cat="${esc(cat.id)}">
                    ${cat.active ? 'Desactivar' : 'Activar'}</button>
                </td>
              </tr>`).join('')}</tbody>
          </table></div>` : empty('Aún no tienes categorías. Arriendo, servicios, nómina...', '🗂️')}
        </div>
      </div>`;

    bindEntryEvents(entries.data);
    bindCategoryEvents();
  };

  const bindEntryEvents = (entries) => {
    document.querySelectorAll('[data-edit-entry]').forEach((button) => {
      button.addEventListener('click', async () => {
        const entry = entries.find((e) => e.id === button.dataset.editEntry);
        const result = await modal({
          title: 'Editar movimiento',
          body: entryFields(entry),
          onSubmit: (data) => api.patch(`/accounting/entries/${entry.id}`, clean(data, ['amount']))
        });
        if (result) { toast('Movimiento actualizado'); load(); }
      });
    });
    document.querySelectorAll('[data-del-entry]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!(await confirmDialog('No se puede deshacer.', { confirmText: 'Sí, borrarlo', title: 'Borrar movimiento' }))) return;
        await api.delete(`/accounting/entries/${button.dataset.delEntry}`);
        toast('Movimiento borrado');
        load();
      });
    });
  };

  const bindCategoryEvents = () => {
    document.querySelectorAll('[data-edit-cat]').forEach((button) => {
      button.addEventListener('click', async () => {
        const cat = categories.find((c) => c.id === button.dataset.editCat);
        const result = await modal({
          title: 'Editar categoría',
          body: field('name', 'Nombre', { required: true, value: cat.name }) +
                field('kind', 'Tipo', { value: cat.kind,
                  options: [['expense', 'Gasto'], ['income', 'Ingreso']] }),
          onSubmit: (data) => api.patch(`/accounting/categories/${cat.id}`, data)
        });
        if (result) { toast('Categoría actualizada'); load(); }
      });
    });
    document.querySelectorAll('[data-toggle-cat]').forEach((button) => {
      button.addEventListener('click', async () => {
        const cat = categories.find((c) => c.id === button.dataset.toggleCat);
        await api.patch(`/accounting/categories/${cat.id}`, { active: !cat.active });
        toast(cat.active ? 'Categoría desactivada' : 'Categoría activada');
        load();
      });
    });
  };

  onMount(async () => {
    // Se espera a que cargue: "Nuevo movimiento"/"Nueva categoría" viven
    // dentro del contenido que arma load(), no en la plantilla estática.
    await load();
    for (const id of ['acc-from', 'acc-to']) {
      document.getElementById(id).addEventListener('change', (event) => {
        state[id === 'acc-from' ? 'from' : 'to'] = event.target.value;
        load();
      });
    }
    document.getElementById('btn-new-entry').addEventListener('click', async () => {
      const result = await modal({
        title: 'Nuevo movimiento',
        body: entryFields(),
        onSubmit: (data) => api.post('/accounting/entries', clean(data, ['amount']))
      });
      if (result) { toast('Movimiento registrado'); load(); }
    });
    document.getElementById('btn-new-category').addEventListener('click', async () => {
      const result = await modal({
        title: 'Nueva categoría',
        body: field('name', 'Nombre', { required: true, placeholder: 'Arriendo, servicios, nómina...' }) +
              field('kind', 'Tipo', { value: 'expense',
                options: [['expense', 'Gasto'], ['income', 'Ingreso']] }),
        onSubmit: (data) => api.post('/accounting/categories', data)
      });
      if (result) { toast('Categoría creada'); load(); }
    });
  });

  return `
    <div class="page-head">
      <div><h1>Contabilidad</h1><p>Operaciones, plan de cuentas, ingresos, gastos y balance de caja.</p></div>
    </div>
    <div class="toolbar no-print">
      <div class="field" style="margin:0"><label>Desde</label>
        <input type="date" id="acc-from" value="${state.from}"></div>
      <div class="field" style="margin:0"><label>Hasta</label>
        <input type="date" id="acc-to" value="${state.to}"></div>
    </div>
    <div id="acc-body"></div>`;
}
