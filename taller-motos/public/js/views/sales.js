import { api, session } from '../api.js';
import {
  esc, money, number, date, empty, toast, field, modal, clean,
  errorBox, PAYMENT_METHODS
} from '../ui.js';
import { onMount, go } from '../app.js';

// ── Listado ──────────────────────────────────────────────────────────
export async function salesView() {
  const state = { search: '' };
  let sales = [];

  const load = async () => {
    const target = document.getElementById('sales-body');
    target.innerHTML = '<div class="spinner"></div>';
    const params = new URLSearchParams();
    if (state.search) params.set('search', state.search);
    sales = (await api.get(`/sales?${params}`)).data;

    const counter = document.getElementById('sales-count');
    if (!counter) return;
    counter.textContent = sales.length === 1 ? '1 venta' : `${number(sales.length)} ventas`;

    target.innerHTML = sales.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>N°</th><th>Cliente</th><th class="num">Ítems</th>
          <th>Método</th><th class="num">Total</th><th>Factura</th><th></th></tr></thead>
        <tbody>${sales.map((sale) => `
          <tr class="clickable" data-sale-id="${esc(sale.id)}">
            <td class="small muted">${date(sale.created_at, true)}</td>
            <td class="strong">#${esc(sale.number)}</td>
            <td>${esc(sale.customer_name_saved || sale.customer_name || 'Mostrador')}</td>
            <td class="num small muted">${esc(sale.item_count)}</td>
            <td class="small muted">${esc(PAYMENT_METHODS[sale.payment_method] || sale.payment_method)}</td>
            <td class="num strong">${money(sale.total)}</td>
            <td class="small muted" data-invoice-cell="${esc(sale.id)}">…</td>
            <td class="num nowrap" data-invoice-action="${esc(sale.id)}">…</td>
          </tr>`).join('')}</tbody>
      </table></div>` : empty('Aún no has registrado ninguna venta de mostrador.', '🧾');

    target.querySelectorAll('[data-sale-id]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        go(`/ventas/${row.dataset.saleId}`);
      });
    });

    await paintInvoiceStatus();
  };

  const paintInvoiceStatus = async () => {
    await Promise.all(sales.map(async (sale) => {
      const cell = document.querySelector(`[data-invoice-cell="${sale.id}"]`);
      const actionCell = document.querySelector(`[data-invoice-action="${sale.id}"]`);
      if (!cell || !actionCell) return;
      const full = await api.get(`/sales/${sale.id}`);
      const issued = full.invoices.find((i) => i.status === 'issued');
      if (issued) {
        cell.textContent = issued.doc_code;
        actionCell.innerHTML = '';
      } else {
        cell.textContent = 'Sin facturar';
        actionCell.innerHTML = session.can('cashier')
          ? `<button class="btn btn-quiet btn-sm" data-facturar="${esc(sale.id)}">Facturar</button>` : '';
        actionCell.querySelector('[data-facturar]')?.addEventListener('click', async (event) => {
          event.stopPropagation();
          const button = event.target;
          button.disabled = true;
          try {
            const result = await api.post(`/sales/${sale.id}/invoice-normal`, {});
            toast(`Factura ${result.doc_code} generada`);
            cell.textContent = result.doc_code;
            actionCell.innerHTML = '';
          } catch (err) { toast(err.message, true); button.disabled = false; }
        });
      }
    }));
  };

  onMount(async () => {
    await load();
    document.getElementById('sales-search')?.addEventListener('input', (e) => {
      state.search = e.target.value.trim();
      clearTimeout(window.__salesSearch);
      window.__salesSearch = setTimeout(load, 260);
    });
  });

  return `
    <div class="page-head">
      <div><h1>Ventas</h1><p id="sales-count">Cargando…</p></div>
      <a class="btn btn-primary" href="#/ventas/nueva">Nueva venta</a>
    </div>
    <div class="toolbar">
      <input class="search" id="sales-search" type="search"
             placeholder="Buscar por número, cliente…">
    </div>
    <div class="card"><div class="card-body tight" id="sales-body"></div></div>`;
}

// ── Detalle ──────────────────────────────────────────────────────────
export async function saleDetailView(id) {
  let sale;

  const load = async () => {
    sale = await api.get(`/sales/${id}`);
    const target = document.getElementById('sale-detail');
    if (!target) return;

    const issued = sale.invoices.find((i) => i.status === 'issued');

    target.innerHTML = `
      <div class="card" style="margin-bottom:18px">
        <div class="card-head">
          <h2>Datos de la venta</h2>
          ${!issued && session.can('cashier')
            ? `<button class="btn btn-default btn-sm" id="btn-facturar-detail">Facturar</button>` : ''}
        </div>
        <div class="card-body">
          <div class="grid cols-2">
            <div>
              <div class="kv"><span class="k">Número</span><span class="v">#${esc(sale.number)}</span></div>
              <div class="kv"><span class="k">Fecha</span><span class="v">${date(sale.created_at, true)}</span></div>
              <div class="kv"><span class="k">Cliente</span><span class="v">${esc(sale.customer_name_saved || sale.customer_name || 'Mostrador')}</span></div>
              <div class="kv"><span class="k">Método de pago</span><span class="v">${esc(PAYMENT_METHODS[sale.payment_method] || sale.payment_method)}</span></div>
            </div>
            <div>
              <div class="kv"><span class="k">Factura</span><span class="v">${issued ? esc(issued.doc_code) : 'Sin facturar'}</span></div>
              <div class="kv"><span class="k">Registró</span><span class="v">${esc(sale.created_by_name || '—')}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-head"><h2>Ítems</h2></div>
        <div class="card-body tight">
          <div class="table-wrap"><table>
            <thead><tr><th>Producto</th><th class="num">Cantidad</th>
              <th class="num">Precio un.</th><th class="num">Subtotal</th></tr></thead>
            <tbody>${sale.items.map((item) => `
              <tr>
                <td>${esc(item.description || item.part_name || '—')}</td>
                <td class="num">${number(item.quantity)}</td>
                <td class="num">${money(item.unit_price)}</td>
                <td class="num strong">${money(item.quantity * item.unit_price)}</td>
              </tr>`).join('')}</tbody>
          </table></div>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="totals" style="max-width:320px;margin-left:auto">
            <div class="line"><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
            ${Number(sale.discount) ? `<div class="line"><span>Descuento</span><span>-${money(sale.discount)}</span></div>` : ''}
            ${Number(sale.tax_total) ? `<div class="line"><span>IVA (${number(sale.tax_rate)}%)</span><span>${money(sale.tax_total)}</span></div>` : ''}
            <div class="line total"><span>Total</span><span>${money(sale.total)}</span></div>
          </div>
        </div>
      </div>`;

    document.getElementById('btn-facturar-detail')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const result = await api.post(`/sales/${id}/invoice-normal`, {});
        toast(`Factura ${result.doc_code} generada`);
        load();
      } catch (err) { toast(err.message, true); e.target.disabled = false; }
    });
  };

  onMount(load);

  return `
    <div class="page-head">
      <div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <a href="#/ventas" class="btn btn-quiet btn-sm" style="margin:-2px 0">&larr; Ventas</a>
          <h1>Venta</h1>
        </div>
        <p class="muted small" style="margin-top:2px">Detalle de la venta de mostrador</p>
      </div>
    </div>
    <div id="sale-detail"><div class="spinner"></div></div>`;
}

// ── Nueva venta (formulario completo) ────────────────────────────────
export async function newSaleView() {
  let parts = [];
  let customers = [];
  let lines = [];
  let lineSeq = 0;

  const loadData = async () => {
    [parts, customers] = await Promise.all([
      api.get('/parts?active=true&limit=500').then((r) => r.data),
      api.get('/customers?limit=500').then((r) => r.data).catch(() => [])
    ]);
  };

  const addLine = () => {
    const seq = ++lineSeq;
    lines.push({ seq, part_id: '', quantity: 1, unit_price: 0, description: '' });
    return seq;
  };

  const removeLine = (seq) => {
    lines = lines.filter((l) => l.seq !== seq);
    document.querySelector(`[data-line-seq="${seq}"]`)?.remove();
    recalcTotals();
    if (!lines.length) { addLine(); renderLines(); }
  };

  const partOptions = (selected) => {
    let html = '<option value="">— Seleccionar producto —</option>';
    html += parts.map((p) =>
      `<option value="${esc(p.id)}"${p.id === selected ? ' selected' : ''} data-price="${p.price}" data-stock="${p.stock}">` +
      `${esc(p.name)}${p.sku ? ` [${esc(p.sku)}]` : ''} — ${money(p.price)} (${number(p.stock)} disp.)</option>`
    ).join('');
    return html;
  };

  const customerOptions = () => {
    let html = '<option value="">Mostrador (sin cliente)</option>';
    html += customers.map((c) =>
      `<option value="${esc(c.id)}">${esc(c.name)}${c.phone ? ` · ${esc(c.phone)}` : ''}</option>`
    ).join('');
    return html;
  };

  const lineRowHtml = (line) => `
    <tr data-line-seq="${line.seq}">
      <td style="min-width:240px">
        <div style="display:flex;gap:4px">
          <select data-field="part_id" style="flex:1">${partOptions(line.part_id)}</select>
          <button type="button" class="btn btn-default btn-sm" data-new-part
                  title="Crear producto nuevo" style="flex-shrink:0">+</button>
        </div>
      </td>
      <td style="width:100px"><input data-field="quantity" type="number" step="0.01"
          min="0.01" value="${line.quantity}" style="text-align:right"></td>
      <td style="width:130px"><input data-field="unit_price" type="number" min="0"
          step="1" value="${line.unit_price || ''}" placeholder="Auto" style="text-align:right"></td>
      <td class="num strong" data-line-subtotal style="width:120px">${money(line.quantity * line.unit_price)}</td>
      <td style="width:44px"><button type="button" class="btn btn-quiet btn-sm" data-remove-line
          title="Quitar línea" style="color:var(--red)">&times;</button></td>
    </tr>`;

  const renderLines = () => {
    const tbody = document.getElementById('sale-lines-body');
    if (!tbody) return;
    tbody.innerHTML = lines.map(lineRowHtml).join('');
    bindLineEvents();
  };

  const bindLineEvents = () => {
    const tbody = document.getElementById('sale-lines-body');
    if (!tbody) return;

    tbody.querySelectorAll('tr[data-line-seq]').forEach((row) => {
      const seq = Number(row.dataset.lineSeq);
      const line = lines.find((l) => l.seq === seq);
      if (!line || row.dataset.bound) return;
      row.dataset.bound = '1';

      const partSelect = row.querySelector('[data-field="part_id"]');
      const qtyInput = row.querySelector('[data-field="quantity"]');
      const priceInput = row.querySelector('[data-field="unit_price"]');

      partSelect.addEventListener('change', () => {
        line.part_id = partSelect.value;
        const opt = partSelect.selectedOptions[0];
        if (opt && opt.dataset.price) {
          const price = Number(opt.dataset.price);
          line.unit_price = price;
          priceInput.value = price;
        }
        recalcLine(row, line);
      });

      qtyInput.addEventListener('input', () => {
        line.quantity = Number(qtyInput.value) || 0;
        recalcLine(row, line);
      });

      priceInput.addEventListener('input', () => {
        line.unit_price = Number(priceInput.value) || 0;
        recalcLine(row, line);
      });

      row.querySelector('[data-remove-line]').addEventListener('click', () => removeLine(seq));

      row.querySelector('[data-new-part]').addEventListener('click', async () => {
        const created = await createPartInline();
        if (!created) return;
        parts.push(created);
        toast(`Producto "${created.name}" creado`);
        refreshAllPartSelects();
        partSelect.value = created.id;
        line.part_id = created.id;
        line.unit_price = Number(created.price) || 0;
        priceInput.value = line.unit_price;
        recalcLine(row, line);
      });
    });
  };

  const refreshAllPartSelects = () => {
    document.querySelectorAll('#sale-lines-body [data-field="part_id"]').forEach((select) => {
      const current = select.value;
      select.innerHTML = partOptions(current);
    });
  };

  const recalcLine = (row, line) => {
    const sub = line.quantity * line.unit_price;
    row.querySelector('[data-line-subtotal]').textContent = money(sub);
    recalcTotals();
  };

  const recalcTotals = () => {
    const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);
    const discount = Number(document.getElementById('f-discount')?.value) || 0;
    const taxRate = Number(document.getElementById('f-tax_rate')?.value) || 0;
    const afterDiscount = subtotal - discount;
    const taxTotal = Math.round(afterDiscount * taxRate / 100);
    const total = afterDiscount + taxTotal;

    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('sale-subtotal', money(subtotal));
    el('sale-discount-display', money(discount));
    el('sale-tax-display', money(taxTotal));
    el('sale-tax-rate-display', `IVA (${number(taxRate)}%)`);
    el('sale-total', money(total));

    const discountRow = document.getElementById('sale-discount-row');
    if (discountRow) discountRow.style.display = discount ? '' : 'none';
    const taxRow = document.getElementById('sale-tax-row');
    if (taxRow) taxRow.style.display = taxRate ? '' : 'none';
  };

  const createPartInline = () => modal({
    title: 'Nuevo producto',
    body:
      field('name', 'Nombre', { required: true }) +
      `<div class="row">
         ${field('sku', 'SKU / Código')}
         ${field('price', 'Precio de venta', { type: 'number', min: 0, value: '0' })}
       </div>
       <div class="row">
         ${field('cost', 'Costo', { type: 'number', min: 0, value: '0' })}
         ${field('stock', 'Existencia inicial', { type: 'number', step: '0.01', min: 0, value: '0' })}
       </div>`,
    confirmText: 'Crear producto',
    onSubmit: (data) => api.post('/parts', clean(data, ['cost', 'price', 'stock']))
  });

  const submitSale = async () => {
    const form = document.getElementById('sale-form');
    const errSlot = document.getElementById('sale-error');
    const submitBtn = document.getElementById('btn-submit-sale');
    errSlot.innerHTML = '';
    submitBtn.disabled = true;

    try {
      const items = lines
        .filter((l) => l.part_id && l.quantity > 0)
        .map((l) => ({
          part_id: l.part_id,
          quantity: l.quantity,
          unit_price: l.unit_price || undefined
        }));

      if (!items.length) throw new Error('Agrega al menos un producto con cantidad');

      const customerSelect = document.getElementById('f-customer_id');
      const customerId = customerSelect?.value || undefined;
      const customerName = document.getElementById('f-customer_name')?.value || undefined;
      const paymentMethod = document.getElementById('f-payment_method')?.value || 'cash';
      const discount = Number(document.getElementById('f-discount')?.value) || 0;
      const taxRate = Number(document.getElementById('f-tax_rate')?.value) || 0;

      const result = await api.post('/sales', {
        customer_id: customerId || undefined,
        customer_name: !customerId ? customerName : undefined,
        payment_method: paymentMethod,
        discount,
        tax_rate: taxRate,
        items
      });

      toast(`Venta #${result.number} registrada`);
      go(`/ventas/${result.id}`);
    } catch (err) {
      errSlot.innerHTML = errorBox(err.message);
      submitBtn.disabled = false;
    }
  };

  onMount(async () => {
    await loadData();

    const custSelect = document.getElementById('f-customer_id');
    if (custSelect) custSelect.innerHTML = customerOptions();

    const custToggle = document.getElementById('toggle-customer-name');
    const custNameField = document.getElementById('customer-name-wrap');
    if (custSelect && custToggle && custNameField) {
      custSelect.addEventListener('change', () => {
        custNameField.style.display = custSelect.value ? 'none' : '';
      });
    }

    addLine();
    renderLines();

    document.getElementById('btn-add-line')?.addEventListener('click', () => {
      addLine();
      renderLines();
    });

    document.getElementById('f-discount')?.addEventListener('input', recalcTotals);
    document.getElementById('f-tax_rate')?.addEventListener('input', recalcTotals);
    document.getElementById('btn-submit-sale')?.addEventListener('click', submitSale);
    document.getElementById('btn-cancel-sale')?.addEventListener('click', () => go('/ventas'));

    recalcTotals();
  });

  const defaultTax = session.workshop?.tax_rate || '0';

  return `
    <div class="page-head">
      <div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <a href="#/ventas" class="btn btn-quiet btn-sm" style="margin:-2px 0">&larr; Ventas</a>
          <h1>Nueva venta de mostrador</h1>
        </div>
      </div>
    </div>

    <div id="sale-error"></div>

    <form id="sale-form" onsubmit="return false">
      <div class="grid cols-2" style="margin-bottom:18px">
        <div class="card">
          <div class="card-head"><h2>Cliente</h2></div>
          <div class="card-body">
            <div class="field">
              <label for="f-customer_id">Cliente registrado</label>
              <select id="f-customer_id" name="customer_id">
                <option value="">Cargando…</option>
              </select>
            </div>
            <div id="customer-name-wrap">
              ${field('customer_name', 'Nombre del cliente (si no está registrado)', { placeholder: 'Mostrador' })}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Condiciones</h2></div>
          <div class="card-body">
            ${field('payment_method', 'Método de pago', { value: 'cash', options: Object.entries(PAYMENT_METHODS) })}
            <div class="row">
              ${field('discount', 'Descuento ($)', { type: 'number', min: 0, value: '0' })}
              ${field('tax_rate', 'IVA (%)', { type: 'number', min: 0, max: 100, value: defaultTax })}
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-head">
          <h2>Productos</h2>
          <button type="button" class="btn btn-default btn-sm" id="btn-add-line">+ Agregar línea</button>
        </div>
        <div class="card-body tight">
          <div class="table-wrap"><table>
            <thead><tr>
              <th>Producto</th><th class="num">Cantidad</th>
              <th class="num">Precio un.</th><th class="num">Subtotal</th><th></th>
            </tr></thead>
            <tbody id="sale-lines-body"></tbody>
          </table></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:24px">
        <div class="card-body">
          <div class="totals" style="max-width:320px;margin-left:auto">
            <div class="line"><span>Subtotal</span><span id="sale-subtotal">${money(0)}</span></div>
            <div class="line" id="sale-discount-row" style="display:none"><span>Descuento</span><span id="sale-discount-display">${money(0)}</span></div>
            <div class="line" id="sale-tax-row" style="display:none"><span id="sale-tax-rate-display">IVA (0%)</span><span id="sale-tax-display">${money(0)}</span></div>
            <div class="line total"><span>Total</span><span id="sale-total">${money(0)}</span></div>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button type="button" class="btn btn-default" id="btn-cancel-sale">Cancelar</button>
        <button type="button" class="btn btn-primary" id="btn-submit-sale">Registrar venta</button>
      </div>
    </form>`;
}
