// Inventario de repuestos, proveedores y compras.
import { api, session } from '../api.js';
import {
  esc, money, number, date, empty, toast, field, modal, confirmDialog, clean
} from '../ui.js';
import { onMount, refresh } from '../app.js';

const partFields = (part = {}, suppliers = []) =>
  field('name', 'Nombre', { required: true, value: part.name || '' }) +
  `<div class="row">
     ${field('sku', 'SKU', { value: part.sku || '' })}
     ${field('category', 'Categoría', { value: part.category || '' })}
   </div>
   <div class="row">
     ${field('brand', 'Marca', { value: part.brand || '' })}
     ${field('supplier_id', 'Proveedor', {
        value: part.supplier_id || '',
        options: [['', 'Sin proveedor'], ...suppliers.map((s) => [s.id, s.name])] })}
   </div>
   <div class="row">
     ${field('cost', 'Costo', { type: 'number', value: part.cost ?? 0, min: 0 })}
     ${field('price', 'Precio de venta', { type: 'number', value: part.price ?? 0, min: 0 })}
   </div>
   <div class="row-3">
     ${field('stock', 'Existencia', { type: 'number', value: part.stock ?? 0, step: '0.01' })}
     ${field('min_stock', 'Mínimo', { type: 'number', value: part.min_stock ?? 0, step: '0.01', min: 0 })}
     ${field('location', 'Ubicación', { value: part.location || '' })}
   </div>` +
  field('description', 'Descripción', { rows: 2, value: part.description || '' });

export async function inventoryView() {
  const state = { tab: 'parts', filter: 'all', search: '' };
  const suppliers = (await api.get('/suppliers?limit=200').catch(() => ({ data: [] }))).data;

  const loadParts = async () => {
    const target = document.getElementById('inv-body');
    target.innerHTML = '<div class="spinner"></div>';
    const params = new URLSearchParams({ limit: '300' });
    if (state.search) params.set('search', state.search);

    const source = state.filter === 'low'
      ? await api.get('/parts/alerts/low-stock')
      : await api.get(`/parts?${params}`);
    let rows = source.data;
    if (state.filter === 'low' && state.search) {
      const term = state.search.toLowerCase();
      rows = rows.filter((part) =>
        [part.name, part.sku, part.category].join(' ').toLowerCase().includes(term));
    }

    const value = rows.reduce((sum, part) => sum + Number(part.stock) * Number(part.cost), 0);
    document.getElementById('inv-count').textContent =
      `${number(rows.length)} repuestos · ${money(value)} en costo`;

    target.innerHTML = rows.length ? `
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Repuesto</th><th>Ubicación</th><th class="num">Costo</th>
          <th class="num">Venta</th><th class="num">Stock</th><th></th>
        </tr></thead>
        <tbody>${rows.map((part) => {
          const low = Number(part.stock) <= Number(part.min_stock);
          return `<tr>
            <td>
              <div class="strong">${esc(part.name)}</div>
              <div class="faint">${esc(part.sku || 'Sin SKU')}
                ${part.category ? ` · ${esc(part.category)}` : ''}
                ${part.brand ? ` · ${esc(part.brand)}` : ''}</div>
            </td>
            <td class="small muted">${esc(part.location || '—')}</td>
            <td class="num">${money(part.cost)}</td>
            <td class="num strong">${money(part.price)}</td>
            <td class="num">
              <span class="tag ${low ? 'tag-red' : 'tag-grey'}">${number(part.stock)}</span>
              ${low ? `<div class="faint">mín. ${number(part.min_stock)}</div>` : ''}
            </td>
            <td class="num nowrap">
              <button class="btn btn-default btn-sm" data-move="${esc(part.id)}">Movimiento</button>
              <button class="btn btn-quiet btn-sm" data-edit="${esc(part.id)}">Editar</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`
      : empty(state.filter === 'low'
        ? 'Ningún repuesto está por debajo del mínimo. 👏'
        : 'Tu inventario está vacío. Agrega los repuestos que más mueves.', '📦');

    bindPartActions(rows);
  };

  const bindPartActions = (rows) => {
    document.querySelectorAll('[data-edit]').forEach((button) => {
      button.addEventListener('click', async () => {
        const part = rows.find((p) => p.id === button.dataset.edit);
        const result = await modal({
          title: 'Editar repuesto',
          body: partFields(part, suppliers),
          onSubmit: (data) => api.patch(`/parts/${part.id}`,
            clean(data, ['cost', 'price', 'stock', 'min_stock']))
        });
        if (result) { toast('Repuesto actualizado'); loadParts(); }
      });
    });

    document.querySelectorAll('[data-move]').forEach((button) => {
      button.addEventListener('click', async () => {
        const part = rows.find((p) => p.id === button.dataset.move);
        const result = await modal({
          title: `Movimiento · ${part.name}`,
          body: `<p class="small muted" style="margin-bottom:14px">
                   Existencia actual: <span class="strong">${number(part.stock)}</span></p>` +
                field('type', 'Tipo', { options: [
                  ['in', 'Entrada (compra o devolución)'],
                  ['out', 'Salida (consumo o baja)'],
                  ['adjust', 'Ajuste por conteo físico']] }) +
                field('quantity', 'Cantidad', { type: 'number', value: '1', step: '0.01',
                  hint: 'En un ajuste, escribe la cantidad real que contaste.' }) +
                field('unit_cost', 'Costo unitario', { type: 'number', value: part.cost, min: 0 }) +
                field('reason', 'Motivo'),
          confirmText: 'Registrar',
          onSubmit: (data) => api.post(`/parts/${part.id}/movements`,
            clean(data, ['quantity', 'unit_cost']))
        });
        if (result) { toast('Movimiento registrado'); loadParts(); }
      });
    });
  };

  const loadSuppliers = async () => {
    const target = document.getElementById('inv-body');
    const { data } = await api.get('/suppliers?limit=200');
    document.getElementById('inv-count').textContent =
      data.length === 1 ? '1 proveedor' : `${number(data.length)} proveedores`;

    target.innerHTML = data.length ? data.map((supplier) => `
      <div class="list-item" style="cursor:default">
        <div class="grow">
          <div class="t">${esc(supplier.name)}</div>
          <div class="s">${esc(supplier.contact_name || 'Sin contacto')}
            ${supplier.phone ? ` · ${esc(supplier.phone)}` : ''}
            ${supplier.email ? ` · ${esc(supplier.email)}` : ''}</div>
        </div>
        <button class="btn btn-quiet btn-sm" data-edit-supplier="${esc(supplier.id)}">Editar</button>
      </div>`).join('') : empty('Sin proveedores registrados.', '🚚');

    document.querySelectorAll('[data-edit-supplier]').forEach((button) => {
      button.addEventListener('click', async () => {
        const supplier = data.find((s) => s.id === button.dataset.editSupplier);
        const result = await modal({
          title: 'Editar proveedor',
          body: supplierFields(supplier),
          onSubmit: (payload) => api.patch(`/suppliers/${supplier.id}`, clean(payload))
        });
        if (result) { toast('Proveedor actualizado'); loadSuppliers(); }
      });
    });
  };

  const supplierFields = (supplier = {}) =>
    field('name', 'Nombre', { required: true, value: supplier.name || '' }) +
    `<div class="row">
       ${field('contact_name', 'Contacto', { value: supplier.contact_name || '' })}
       ${field('phone', 'Teléfono', { type: 'tel', value: supplier.phone || '' })}
     </div>` +
    field('email', 'Correo', { type: 'email', value: supplier.email || '' }) +
    field('notes', 'Notas', { rows: 2, value: supplier.notes || '' });

  const loadMovements = async () => {
    const target = document.getElementById('inv-body');
    const { data } = await api.get('/purchases');
    document.getElementById('inv-count').textContent =
      data.length === 1 ? '1 compra' : `${number(data.length)} compras`;

    target.innerHTML = data.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Proveedor</th><th>Referencia</th><th class="num">Total</th></tr></thead>
        <tbody>${data.map((purchase) => `
          <tr>
            <td>${date(purchase.purchased_at)}</td>
            <td>${esc(purchase.supplier_name || '—')}</td>
            <td class="small muted">${esc(purchase.reference || '—')}</td>
            <td class="num strong">${money(purchase.total)}</td>
          </tr>`).join('')}</tbody>
      </table></div>` : empty('Aún no has registrado compras a proveedores.', '🧾');
  };

  const load = () => (state.tab === 'parts' ? loadParts()
    : state.tab === 'suppliers' ? loadSuppliers() : loadMovements());

  onMount(() => {
    load();

    document.getElementById('inv-search').addEventListener('input', (event) => {
      state.search = event.target.value.trim();
      clearTimeout(window.__invTimer);
      window.__invTimer = setTimeout(load, 260);
    });

    document.querySelectorAll('[data-tab]').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.tab = chip.dataset.tab;
        state.filter = 'all';
        document.querySelectorAll('[data-tab]').forEach((c) =>
          c.classList.toggle('on', c.dataset.tab === state.tab));
        document.getElementById('inv-filters').style.display =
          state.tab === 'parts' ? 'flex' : 'none';
        document.getElementById('btn-new').textContent =
          state.tab === 'suppliers' ? 'Nuevo proveedor'
            : state.tab === 'purchases' ? 'Registrar compra' : 'Nuevo repuesto';
        load();
      });
    });

    document.querySelectorAll('[data-filter]').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.filter = chip.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach((c) =>
          c.classList.toggle('on', c.dataset.filter === state.filter));
        loadParts();
      });
    });

    document.getElementById('btn-new').addEventListener('click', async () => {
      if (state.tab === 'suppliers') {
        const result = await modal({
          title: 'Nuevo proveedor',
          body: supplierFields(),
          onSubmit: (data) => api.post('/suppliers', clean(data))
        });
        if (result) { toast('Proveedor creado'); load(); }
        return;
      }
      if (state.tab === 'purchases') {
        await registerPurchase(suppliers);
        load();
        return;
      }
      const result = await modal({
        title: 'Nuevo repuesto',
        body: partFields({}, suppliers),
        onSubmit: (data) => api.post('/parts',
          clean(data, ['cost', 'price', 'stock', 'min_stock']))
      });
      if (result) { toast('Repuesto agregado'); load(); }
    });
  });

  return `
    <div class="page-head">
      <div><h1>Inventario</h1><p id="inv-count">Cargando…</p></div>
      <button class="btn btn-primary" id="btn-new">Nuevo repuesto</button>
    </div>
    <div class="chips">
      <button class="chip on" data-tab="parts">Repuestos</button>
      <button class="chip" data-tab="suppliers">Proveedores</button>
      <button class="chip" data-tab="purchases">Compras</button>
    </div>
    <div class="toolbar">
      <input class="search" id="inv-search" type="search"
             placeholder="Buscar por nombre, SKU, categoría o ubicación">
    </div>
    <div class="chips" id="inv-filters">
      <button class="chip on" data-filter="all">Todos</button>
      <button class="chip" data-filter="low">Bajo mínimo</button>
    </div>
    <div class="card"><div class="card-body tight" id="inv-body"></div></div>`;
}

// Compra a proveedor: entra al inventario y actualiza el costo.
async function registerPurchase(suppliers) {
  const parts = (await api.get('/parts?active=true&limit=500')).data;
  if (!parts.length) {
    toast('Primero crea los repuestos que vas a comprar', true);
    return null;
  }

  const lineRow = () => `
    <div class="row-3" data-line style="margin-bottom:8px">
      <select name="part_id">${parts.map((part) =>
        `<option value="${esc(part.id)}">${esc(part.name)}</option>`).join('')}</select>
      <input name="quantity" type="number" step="0.01" min="0" placeholder="Cantidad" value="1">
      <input name="unit_cost" type="number" min="0" placeholder="Costo unitario">
    </div>`;

  // El modal se pinta de inmediato; se guarda la promesa para poder enlazar
  // el botón de "otra línea" mientras sigue abierto.
  const pending = modal({
    title: 'Registrar compra',
    wide: true,
    body:
      `<div class="row">
         ${field('supplier_id', 'Proveedor', {
            options: [['', 'Sin proveedor'], ...suppliers.map((s) => [s.id, s.name])] })}
         ${field('reference', 'Factura / remisión')}
       </div>
       <p class="small muted" style="margin:6px 0 10px">Líneas de la compra:</p>
       <div id="purchase-lines">${lineRow()}</div>
       <button type="button" class="btn btn-default btn-sm" id="btn-add-line">+ Otra línea</button>`,
    confirmText: 'Registrar compra',
    onSubmit: (_data, form) => {
      const items = [...form.querySelectorAll('[data-line]')].map((row) => ({
        part_id: row.querySelector('[name=part_id]').value,
        quantity: Number(row.querySelector('[name=quantity]').value),
        unit_cost: Number(row.querySelector('[name=unit_cost]').value)
      })).filter((item) => item.part_id && item.quantity > 0);

      if (!items.length) throw new Error('Agrega al menos una línea con repuesto y cantidad');
      return api.post('/purchases', {
        supplier_id: form.querySelector('[name=supplier_id]').value || undefined,
        reference: form.querySelector('[name=reference]').value || undefined,
        items
      });
    }
  });

  document.getElementById('btn-add-line')?.addEventListener('click', () => {
    document.getElementById('purchase-lines').insertAdjacentHTML('beforeend', lineRow());
  });

  const result = await pending;
  if (result) toast('Compra registrada y stock actualizado');
  return result;
}
