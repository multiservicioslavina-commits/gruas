// Clientes, motos e historial por placa.
import { api } from '../api.js';
import {
  esc, money, number, date, since, statusTag, empty, toast, field, modal,
  confirmDialog, motorcycleName, clean
} from '../ui.js';
import { onMount, refresh, go } from '../app.js';

const customerFields = (customer = {}) =>
  field('name', 'Nombre', { required: true, value: customer.name || '' }) +
  `<div class="row">
     ${field('phone', 'WhatsApp / teléfono', { type: 'tel', value: customer.phone || '' })}
     ${field('email', 'Correo', { type: 'email', value: customer.email || '' })}
   </div>
   <div class="row">
     ${field('document_number', 'Documento', { value: customer.document_number || '' })}
     ${field('city', 'Ciudad', { value: customer.city || '' })}
   </div>` +
  field('price_tier', 'Tipo de cliente', {
    value: customer.price_tier || 'retail',
    options: [['retail', 'Minorista (precio de mostrador)'], ['wholesale', 'Mayorista']],
    hint: 'Un cliente mayorista paga el precio mayorista de cada repuesto, cuando el repuesto lo tiene.'
  }) +
  field('address', 'Dirección', { value: customer.address || '' }) +
  field('notes', 'Notas', { rows: 2, value: customer.notes || '' });

const motorcycleFields = (moto = {}) =>
  field('plate', 'Placa', { required: true, value: moto.plate || '' }) +
  `<div class="row-3">
     ${field('brand', 'Marca', { value: moto.brand || '' })}
     ${field('model', 'Línea', { value: moto.model || '' })}
     ${field('year', 'Modelo', { type: 'number', value: moto.year || '' })}
   </div>
   <div class="row-3">
     ${field('engine_size', 'Cilindraje', { value: moto.engine_size || '' })}
     ${field('color', 'Color', { value: moto.color || '' })}
     ${field('mileage', 'Kilometraje', { type: 'number', value: moto.mileage || '' })}
   </div>
   <div class="row">
     ${field('vin', 'VIN / chasis', { value: moto.vin || '' })}
     ${field('engine_number', 'Número de motor', { value: moto.engine_number || '' })}
   </div>` +
  field('notes', 'Notas', { rows: 2, value: moto.notes || '' });

export async function newCustomerModal() {
  return modal({
    title: 'Nuevo cliente',
    body: customerFields(),
    confirmText: 'Guardar',
    onSubmit: (data) => api.post('/customers', clean(data))
  });
}

export async function newMotorcycleModal(customerId) {
  return modal({
    title: 'Nueva moto',
    body: motorcycleFields(),
    confirmText: 'Guardar',
    onSubmit: (data) => api.post('/motorcycles',
      { ...clean(data, ['year', 'mileage']), customer_id: customerId })
  });
}

// ── Listado ───────────────────────────────────────────────────────────
export async function customersView() {
  const load = async (search = '') => {
    const target = document.getElementById('customers-list');
    target.innerHTML = '<div class="spinner"></div>';
    const { data, total } = await api.get(
      `/customers?limit=200${search ? `&search=${encodeURIComponent(search)}` : ''}`);
    // Si el usuario ya navegó a otra pantalla mientras cargaba, no hay
    // dónde escribir: salir en vez de reventar sobre un elemento muerto.
    const contador = document.getElementById('customers-count');
    if (!contador) return;
    contador.textContent = total === 1 ? '1 cliente' : `${number(total)} clientes`;

    target.innerHTML = data.length ? data.map((customer) => `
      <a class="list-item" href="#/clientes/${esc(customer.id)}"
         style="color:inherit;text-decoration:none">
        <div class="grow">
          <div class="t">${esc(customer.name)}</div>
          <div class="s">${esc(customer.phone || 'Sin teléfono')}
            ${customer.email ? ` · ${esc(customer.email)}` : ''}</div>
        </div>
        <span class="faint">Ver ficha →</span>
      </a>`).join('') : empty('Todavía no tienes clientes registrados.', '👥');
  };

  onMount(() => {
    load();
    document.getElementById('customers-search').addEventListener('input', (event) => {
      clearTimeout(window.__custTimer);
      window.__custTimer = setTimeout(() => load(event.target.value.trim()), 260);
    });
    document.getElementById('btn-new-customer').addEventListener('click', async () => {
      const created = await newCustomerModal();
      if (created) { toast('Cliente creado'); go(`/clientes/${created.id}`); }
    });
  });

  return `
    <div class="page-head">
      <div><h1>Clientes y motos</h1><p id="customers-count">Cargando…</p></div>
      <button class="btn btn-primary" id="btn-new-customer">Nuevo cliente</button>
    </div>
    <div class="toolbar">
      <input class="search" id="customers-search" type="search"
             placeholder="Buscar por nombre, teléfono, correo o documento">
    </div>
    <div class="card"><div class="card-body tight" id="customers-list"></div></div>`;
}

// ── Ficha del cliente ─────────────────────────────────────────────────
export async function customerDetailView(id) {
  const customer = await api.get(`/customers/${id}/detail`);

  onMount(() => {
    document.getElementById('btn-edit').addEventListener('click', async () => {
      const result = await modal({
        title: 'Editar cliente',
        body: customerFields(customer),
        onSubmit: (data) => api.patch(`/customers/${id}`, clean(data))
      });
      if (result) { toast('Cliente actualizado'); refresh(); }
    });

    document.getElementById('btn-add-moto').addEventListener('click', async () => {
      const created = await newMotorcycleModal(id);
      if (created) { toast('Moto registrada'); refresh(); }
    });

    document.querySelectorAll('[data-edit-moto]').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        const moto = customer.motorcycles.find((m) => m.id === button.dataset.editMoto);
        const result = await modal({
          title: `Moto ${moto.plate}`,
          body: motorcycleFields(moto),
          onSubmit: (data) => api.patch(`/motorcycles/${moto.id}`, clean(data, ['year', 'mileage']))
        });
        if (result) { toast('Moto actualizada'); refresh(); }
      });
    });

    document.getElementById('btn-delete').addEventListener('click', async () => {
      if (!(await confirmDialog(
        `¿Borrar a ${customer.name}? Sus órdenes quedan en el historial, pero pierden la ficha del cliente.`,
        { confirmText: 'Sí, borrar', title: 'Borrar cliente' }))) return;
      try {
        await api.delete(`/customers/${id}`);
        toast('Cliente eliminado');
        go('/clientes');
      } catch (err) { toast(err.message, true); }
    });
  });

  return `
    <div class="page-head">
      <div>
        <h1>${esc(customer.name)}</h1>
        <p>${esc(customer.phone || 'Sin teléfono')}
          ${customer.email ? ` · ${esc(customer.email)}` : ''}
          ${customer.document_number ? ` · doc. ${esc(customer.document_number)}` : ''}</p>
      </div>
      <div class="btn-group">
        <a class="btn btn-quiet" href="#/clientes">← Clientes</a>
        <button class="btn btn-default" id="btn-edit">Editar</button>
        <button class="btn btn-danger" id="btn-delete">Borrar</button>
      </div>
    </div>

    ${customer.notes ? `<div class="alert alert-info">${esc(customer.notes)}</div>` : ''}

    <div class="grid cols-2">
      <div class="card">
        <div class="card-head">
          <h2>Sus motos</h2>
          <button class="btn btn-default btn-sm" id="btn-add-moto">+ Moto</button>
        </div>
        <div class="card-body tight">
          ${customer.motorcycles.length ? customer.motorcycles.map((moto) => `
            <div class="list-item">
              <a class="grow" href="#/motos/${esc(moto.id)}" style="color:inherit;text-decoration:none">
                <div class="t"><span class="plate">${esc(moto.plate)}</span> ${esc(motorcycleName(moto))}</div>
                <div class="s">${moto.mileage ? `${number(moto.mileage)} km` : 'Sin kilometraje'}
                  ${moto.color ? ` · ${esc(moto.color)}` : ''}</div>
              </a>
              <button class="btn btn-quiet btn-sm" data-edit-moto="${esc(moto.id)}">Editar</button>
            </div>`).join('') : empty('Sin motos registradas.', '🏍️')}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Órdenes</h2></div>
        <div class="card-body tight">
          ${customer.work_orders.length ? customer.work_orders.map((order) => `
            <a class="list-item" href="#/ordenes/${esc(order.id)}"
               style="color:inherit;text-decoration:none">
              <div class="grow">
                <div class="t">#${esc(order.number)}
                  <span class="plate">${esc(order.plate || '—')}</span></div>
                <div class="s">${esc((order.complaint || '').slice(0, 60))}</div>
                <div class="faint">${date(order.received_at)}</div>
              </div>
              <div class="right nowrap">${statusTag(order.status)}
                <div class="small strong" style="margin-top:4px">${money(order.total)}</div></div>
            </a>`).join('') : empty('Este cliente aún no tiene órdenes.', '📋')}
        </div>
      </div>
    </div>`;
}

// ── Historial de una moto ─────────────────────────────────────────────
export async function motorcycleHistoryView(id) {
  const { motorcycle, customer, history } = await api.get(`/motorcycles/${id}/history`);

  const totalSpent = history.reduce((sum, row) => sum + Number(row.total || 0), 0);

  return `
    <div class="page-head">
      <div>
        <h1><span class="plate">${esc(motorcycle.plate)}</span> ${esc(motorcycleName(motorcycle))}</h1>
        <p>${customer ? `<a href="#/clientes/${esc(customer.id)}">${esc(customer.name)}</a>` : 'Sin dueño registrado'}
          ${motorcycle.mileage ? ` · ${number(motorcycle.mileage)} km` : ''}
          ${motorcycle.engine_size ? ` · ${esc(motorcycle.engine_size)}` : ''}
          ${motorcycle.vin ? ` · VIN ${esc(motorcycle.vin)}` : ''}</p>
      </div>
      <a class="btn btn-quiet" href="#/clientes">← Clientes</a>
    </div>

    <div class="stats">
      <div class="stat accent"><div class="v">${number(history.length)}</div>
        <div class="k">Servicios</div></div>
      <div class="stat"><div class="v">${money(totalSpent)}</div>
        <div class="k">Total facturado</div></div>
      <div class="stat"><div class="v">${history[0] ? esc(since(history[0].received_at)) : '—'}</div>
        <div class="k">Última visita</div></div>
    </div>

    ${history.length ? history.map((row) => `
      <div class="card">
        <div class="card-head">
          <div>
            <h2>Orden #${esc(row.number)} · ${date(row.received_at)}</h2>
            <p class="faint">${row.mileage_in ? `${number(row.mileage_in)} km` : 'Sin kilometraje'}
              ${row.delivered_at ? ` · entregada ${date(row.delivered_at)}` : ''}</p>
          </div>
          <div class="right">${statusTag(row.status)}
            <div class="small strong" style="margin-top:4px">${money(row.total)}</div></div>
        </div>
        <div class="card-body">
          ${row.complaint ? `<h3 class="muted small">Reportó</h3>
            <p class="small" style="margin:2px 0 12px">${esc(row.complaint)}</p>` : ''}
          ${row.diagnostics ? `<h3 class="muted small">Diagnóstico</h3>
            <p class="small" style="margin:2px 0 12px;white-space:pre-wrap">${esc(row.diagnostics)}</p>` : ''}
          ${row.work_performed ? `<h3 class="muted small">Trabajo realizado</h3>
            <p class="small" style="margin:2px 0 12px;white-space:pre-wrap">${esc(row.work_performed)}</p>` : ''}
          ${(row.parts_installed || []).length ? `<h3 class="muted small">Repuestos instalados</h3>
            <ul class="small muted" style="margin:4px 0 12px 18px">
              ${row.parts_installed.map((part) =>
                `<li>${esc(part.description)} × ${number(part.quantity)}</li>`).join('')}
            </ul>` : ''}
          ${row.recommendations ? `<div class="alert alert-warn" style="margin:0">
            <span class="strong">Se recomendó:</span> ${esc(row.recommendations)}</div>` : ''}
          ${row.next_service_mileage || row.next_service_date ? `<p class="faint" style="margin-top:10px">
            Próximo servicio: ${row.next_service_mileage ? `${number(row.next_service_mileage)} km` : ''}
            ${row.next_service_date ? ` · ${date(row.next_service_date)}` : ''}</p>` : ''}
        </div>
      </div>`).join('')
      : `<div class="card"><div class="card-body">
          ${empty('Esta moto todavía no tiene servicios registrados.', '🔧')}</div></div>`}`;
}
