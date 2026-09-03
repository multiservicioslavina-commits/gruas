import { api, session } from '../api.js';
import {
  esc, money, number, date, empty, toast, field, modal, clean,
  errorBox, PAYMENT_METHODS, normalizeSearch
} from '../ui.js';
import { onMount, go } from '../app.js';

// ── Listado ──────────────────────────────────────────────────────────
export async function salesView() {
  const state = { search: '', from: '', to: '' };
  let sales = [];

  const load = async () => {
    const target = document.getElementById('sales-body');
    target.innerHTML = '<div class="spinner"></div>';
    const params = new URLSearchParams();
    if (state.search) params.set('search', state.search);
    if (state.from) params.set('from', state.from);
    if (state.to) params.set('to', state.to);
    sales = (await api.get(`/sales?${params}`)).data;

    const counter = document.getElementById('sales-count');
    if (!counter) return;
    const sumTotal = sales.reduce((s, v) => s + Number(v.total), 0);
    counter.textContent = (sales.length === 1 ? '1 venta' : `${number(sales.length)} ventas`) +
      ` · Total: ${money(sumTotal)}`;

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
    document.getElementById('sales-from')?.addEventListener('change', (e) => {
      state.from = e.target.value;
      load();
    });
    document.getElementById('sales-to')?.addEventListener('change', (e) => {
      state.to = e.target.value;
      load();
    });
  });

  return `
    <div class="page-head">
      <div><h1>Ventas</h1><p id="sales-count">Cargando…</p></div>
      <a class="btn btn-primary" href="#/ventas/nueva">Nueva venta</a>
    </div>
    <div class="toolbar" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <input class="search" id="sales-search" type="search"
             placeholder="Buscar por número, cliente…" style="flex:1;min-width:180px">
      <div style="display:flex;gap:6px;align-items:center">
        <label class="small muted" for="sales-from" style="white-space:nowrap">Desde</label>
        <input type="date" id="sales-from" style="width:auto">
        <label class="small muted" for="sales-to" style="white-space:nowrap">Hasta</label>
        <input type="date" id="sales-to" style="width:auto">
      </div>
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
          <div style="display:flex;gap:8px">
            <button class="btn btn-default btn-sm" id="btn-print-sale" type="button">Imprimir</button>
            ${!issued && session.can('cashier')
              ? `<button class="btn btn-default btn-sm" id="btn-facturar-detail">Facturar</button>` : ''}
          </div>
        </div>
        <div class="card-body">
          <div class="grid cols-2">
            <div>
              <div class="kv"><span class="k">Número</span><span class="v">#${esc(sale.number)}</span></div>
              <div class="kv"><span class="k">Fecha</span><span class="v">${date(sale.created_at, true)}</span></div>
              <div class="kv"><span class="k">Cliente</span><span class="v">${esc(sale.customer_name_saved || sale.customer_name || 'Mostrador')}</span></div>
              ${sale.customer_phone ? `<div class="kv"><span class="k">Teléfono</span><span class="v">${esc(sale.customer_phone)}</span></div>` : ''}
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

    document.getElementById('btn-print-sale')?.addEventListener('click', () => {
      const w = session.workshop || {};
      const printHtml = `<!doctype html><html><head><meta charset="utf-8">
        <title>Venta #${sale.number}</title>
        <style>
          body{font-family:system-ui,sans-serif;max-width:700px;margin:20px auto;font-size:13px;color:#222}
          h1{font-size:18px;margin:0 0 4px} .shop{margin-bottom:14px;color:#555}
          table{width:100%;border-collapse:collapse;margin:12px 0}
          th,td{padding:5px 8px;text-align:left;border-bottom:1px solid #ddd}
          th{font-weight:600;font-size:12px;text-transform:uppercase;color:#555}
          .num{text-align:right} .totals{margin-left:auto;max-width:280px}
          .totals .line{display:flex;justify-content:space-between;padding:3px 0}
          .totals .total{font-weight:700;font-size:15px;border-top:2px solid #222;margin-top:4px;padding-top:6px}
          .meta{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px}
          .meta span{font-size:12px;color:#555}
          @media print{body{margin:0}}
        </style></head><body>
        <h1>${esc(w.name || 'Taller')}</h1>
        <div class="shop">${[w.address, w.city, w.phone].filter(Boolean).map(esc).join(' · ')}</div>
        <div class="meta">
          <span><b>Venta #${esc(sale.number)}</b></span>
          <span>${date(sale.created_at, true)}</span>
          <span>Cliente: ${esc(sale.customer_name_saved || sale.customer_name || 'Mostrador')}</span>
          <span>Pago: ${esc(PAYMENT_METHODS[sale.payment_method] || sale.payment_method)}</span>
        </div>
        <table><thead><tr><th>Descripción</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead>
        <tbody>${sale.items.map((i) => `<tr><td>${esc(i.description)}</td><td class="num">${i.quantity}</td><td class="num">${money(i.unit_price)}</td><td class="num">${money(i.quantity * i.unit_price)}</td></tr>`).join('')}</tbody></table>
        <div class="totals">
          <div class="line"><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
          ${Number(sale.discount) ? `<div class="line"><span>Descuento</span><span>-${money(sale.discount)}</span></div>` : ''}
          ${Number(sale.tax_total) ? `<div class="line"><span>IVA (${sale.tax_rate}%)</span><span>${money(sale.tax_total)}</span></div>` : ''}
          <div class="line total"><span>Total</span><span>${money(sale.total)}</span></div>
        </div>
        <script>window.print();<\/script></body></html>`;
      const win = window.open('', '_blank');
      win.document.write(printHtml);
      win.document.close();
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

// ── Nueva venta (formulario profesional) ────────────────────────────
const DOC_TYPES = [
  ['', '-- Tipo --'],
  ['CC', 'CC - Cedula'],
  ['NIT', 'NIT'],
  ['CE', 'CE - Extranjeria'],
  ['PP', 'Pasaporte'],
  ['TI', 'TI - Tarjeta Id.']
];

export async function newSaleView() {
  let parts = [];
  let selectedCustomer = null;
  let walkIn = false;
  let lines = [];
  let lineSeq = 0;
  let searchTimer = null;

  const loadParts = async () => {
    parts = (await api.get('/parts?active=true&limit=500')).data;
  };

  // ── Cliente: búsqueda ────────────────────────────────────────────
  const searchCustomers = async (q) => {
    if (!q || q.length < 2) return [];
    return (await api.get(`/customers?search=${encodeURIComponent(q)}&limit=8`)).data;
  };

  const renderCustomerArea = () => {
    const area = document.getElementById('customer-area');
    if (!area) return;

    if (selectedCustomer) {
      const c = selectedCustomer;
      const docLine = [c.document_type, c.document_number].filter(Boolean).join(' ');
      const details = [
        docLine,
        c.phone ? `Tel: ${c.phone}` : '',
        c.email || '',
        c.address ? `${c.address}${c.city ? `, ${c.city}` : ''}` : ''
      ].filter(Boolean);

      area.innerHTML = `
        <div class="sale-cust-card">
          <div class="sale-cust-info">
            <div class="sale-cust-name">${esc(c.name)}</div>
            <div class="sale-cust-detail">
              ${details.map((d) => `<span>${esc(d)}</span>`).join('')}
            </div>
          </div>
          <button type="button" class="btn btn-quiet btn-sm" id="btn-change-cust">Cambiar</button>
        </div>`;
      document.getElementById('btn-change-cust')?.addEventListener('click', () => {
        selectedCustomer = null;
        renderCustomerArea();
      });
      return;
    }

    if (walkIn) {
      area.innerHTML = `
        <div class="row" style="margin-bottom:10px">
          ${field('customer_name', 'Nombre', { placeholder: 'Consumidor final' })}
          ${field('customer_phone_walkin', 'Telefono', { type: 'tel' })}
        </div>
        <button type="button" class="btn btn-quiet btn-sm" id="btn-back-search">Buscar cliente existente</button>`;
      document.getElementById('btn-back-search')?.addEventListener('click', () => {
        walkIn = false;
        renderCustomerArea();
      });
      return;
    }

    area.innerHTML = `
      <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:10px">
        <div class="field sale-search-wrap" style="flex:1;margin-bottom:0">
          <label for="cust-search-input">Buscar por nombre, cedula o telefono</label>
          <input id="cust-search-input" type="search"
                 placeholder="Ej: Juan Perez, 1098765432..." autocomplete="off">
          <div id="cust-search-dd" class="sale-search-dd"></div>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="btn-new-cust"
                style="height:40px;white-space:nowrap">+ Nuevo cliente</button>
      </div>
      <button type="button" class="btn btn-quiet btn-sm" id="btn-walkin">Venta sin cliente registrado</button>`;

    const input = document.getElementById('cust-search-input');
    const dd = document.getElementById('cust-search-dd');

    input?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const q = input.value.trim();
      if (q.length < 2) { dd.style.display = 'none'; return; }
      searchTimer = setTimeout(async () => {
        try {
          const results = await searchCustomers(q);
          if (!results.length) {
            dd.innerHTML = `<div class="sale-sr-empty">Sin resultados.
              <button type="button" class="btn-link" id="btn-create-dd">Crear cliente</button></div>`;
            dd.style.display = 'block';
            document.getElementById('btn-create-dd')?.addEventListener('click', () => {
              dd.style.display = 'none';
              openNewCustomer(q);
            });
          } else {
            dd.innerHTML = results.map((c) => {
              const doc = [c.document_type, c.document_number].filter(Boolean).join(' ');
              return `<div class="sale-sr-item" data-cid="${esc(c.id)}">
                <div class="sale-sr-name">${esc(c.name)}</div>
                <div class="sale-sr-meta">${[doc, c.phone, c.email].filter(Boolean).map(esc).join(' · ')}</div>
              </div>`;
            }).join('');
            dd.style.display = 'block';
            dd.querySelectorAll('.sale-sr-item').forEach((el) => {
              el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                selectedCustomer = results.find((c) => c.id === el.dataset.cid);
                renderCustomerArea();
              });
            });
          }
        } catch { /* ignore */ }
      }, 250);
    });

    input?.addEventListener('blur', () => {
      setTimeout(() => { if (dd) dd.style.display = 'none'; }, 180);
    });
    input?.addEventListener('focus', () => {
      if (dd?.innerHTML) dd.style.display = 'block';
    });

    document.getElementById('btn-new-cust')?.addEventListener('click', () => openNewCustomer());
    document.getElementById('btn-walkin')?.addEventListener('click', () => {
      walkIn = true;
      renderCustomerArea();
    });

    input?.focus();
  };

  const openNewCustomer = async (prefillName = '') => {
    const created = await modal({
      title: 'Nuevo cliente',
      body:
        field('name', 'Nombre completo', { required: true, value: prefillName }) +
        `<div class="row">
           ${field('document_type', 'Tipo de documento', { options: DOC_TYPES })}
           ${field('document_number', 'Numero de documento', { placeholder: 'Ej: 1098765432' })}
         </div>
         <div class="row">
           ${field('phone', 'Telefono / WhatsApp', { type: 'tel' })}
           ${field('email', 'Correo electronico', { type: 'email' })}
         </div>` +
        field('address', 'Direccion', { placeholder: 'Calle, carrera, numero...' }) +
        `<div class="row">
           ${field('city', 'Ciudad')}
           ${field('notes', 'Notas', { placeholder: 'Opcional' })}
         </div>`,
      confirmText: 'Crear cliente',
      onSubmit: (data) => api.post('/customers', clean(data))
    });
    if (created) {
      selectedCustomer = created;
      toast(`Cliente "${created.name}" registrado`);
      renderCustomerArea();
    }
  };

  // ── Líneas de producto ───────────────────────────────────────────
  const addLine = () => {
    lines.push({ seq: ++lineSeq, part_id: '', quantity: 1, unit_price: 0, description: '' });
    return lineSeq;
  };

  const removeLine = (seq) => {
    lines = lines.filter((l) => l.seq !== seq);
    document.querySelector(`[data-line-seq="${seq}"]`)?.remove();
    recalcTotals();
    if (!lines.length) { addLine(); renderLines(); }
  };

  const partDisplayText = (part) =>
    part ? `${part.name}${part.sku ? ` [${part.sku}]` : ''}` : '';

  const lineRowHtml = (line) => {
    const selectedPart = line.part_id ? parts.find((p) => p.id === line.part_id) : null;
    const searchValue = selectedPart ? partDisplayText(selectedPart) : (line.part_query || '');
    return `
    <tr data-line-seq="${line.seq}">
      <td style="min-width:230px">
        <div style="display:flex;gap:4px;align-items:flex-start">
          <div class="field" style="flex:1;margin-bottom:0">
            <input data-field="part_search" type="text" autocomplete="off"
                value="${esc(searchValue)}" placeholder="Buscar producto o SKU...">
          </div>
          <button type="button" class="btn btn-default btn-sm" data-new-part
                  title="Crear producto nuevo" style="flex-shrink:0">+</button>
        </div>
      </td>
      <td style="min-width:140px"><input data-field="description" type="text"
          value="${esc(line.description)}" placeholder="Descripcion"></td>
      <td style="width:90px"><input data-field="quantity" type="number" step="0.01"
          min="0.01" value="${line.quantity}" style="text-align:right"></td>
      <td style="width:120px"><input data-field="unit_price" type="number" min="0"
          step="1" value="${line.unit_price || ''}" placeholder="Auto" style="text-align:right"></td>
      <td class="num strong" data-line-subtotal style="width:110px">${money(line.quantity * line.unit_price)}</td>
      <td style="width:44px"><button type="button" class="btn btn-quiet btn-sm" data-remove-line
          title="Quitar linea" style="color:var(--red)">&times;</button></td>
    </tr>`;
  };

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

      const partInput = row.querySelector('[data-field="part_search"]');
      const descInput = row.querySelector('[data-field="description"]');
      const qtyInput = row.querySelector('[data-field="quantity"]');
      const priceInput = row.querySelector('[data-field="unit_price"]');
      let partSearchTimer = null;
      let partDd = null;

      // La tabla de productos tiene overflow-x:auto, lo que por especificación
      // vuelve automático también el overflow-y (recorta lo que sobresalga en
      // vertical). Por eso el desplegable vive en <body> con posición fija,
      // calculada contra el input, en vez de ir anidado en la celda.
      const closePartDd = () => { partDd?.remove(); partDd = null; };
      const positionPartDd = () => {
        if (!partDd) return;
        const rect = partInput.getBoundingClientRect();
        partDd.style.left = `${rect.left}px`;
        partDd.style.top = `${rect.bottom + 2}px`;
        partDd.style.width = `${rect.width}px`;
      };
      const openPartDd = () => {
        if (!partDd) {
          partDd = document.createElement('div');
          partDd.className = 'sale-search-dd sale-search-dd-floating';
          document.body.appendChild(partDd);
        }
        positionPartDd();
        partDd.style.display = 'block';
      };

      const pickPart = (part) => {
        line.part_id = part.id;
        line.part_query = '';
        partInput.value = partDisplayText(part);
        line.description = part.name;
        descInput.value = part.name;
        line.unit_price = Number(part.price) || 0;
        priceInput.value = line.unit_price;
        closePartDd();
        recalcLine(row, line);
      };

      const renderPartResults = (query) => {
        const q = normalizeSearch(query.trim());
        if (!q.length) { closePartDd(); return; }
        const results = parts
          .filter((p) => normalizeSearch(p.name).includes(q) || normalizeSearch(p.sku).includes(q))
          .slice(0, 8);

        openPartDd();
        partDd.innerHTML = results.length
          ? results.map((p) => `<div class="sale-sr-item" data-pid="${esc(p.id)}">
              <div class="sale-sr-name">${esc(p.name)}${p.sku ? ` <span class="faint">[${esc(p.sku)}]</span>` : ''}</div>
              <div class="sale-sr-meta">${money(p.price)} &middot; ${number(p.stock)} disponibles</div>
            </div>`).join('')
          : `<div class="sale-sr-empty">Sin resultados para "${esc(query)}"</div>`;
        partDd.querySelectorAll('.sale-sr-item').forEach((el) => {
          el.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const part = parts.find((p) => p.id === el.dataset.pid);
            if (part) pickPart(part);
          });
        });
      };

      partInput.addEventListener('input', () => {
        line.part_id = '';
        line.part_query = partInput.value;
        clearTimeout(partSearchTimer);
        partSearchTimer = setTimeout(() => renderPartResults(partInput.value), 150);
      });
      partInput.addEventListener('focus', () => {
        if (partInput.value.trim().length && !line.part_id) renderPartResults(partInput.value);
      });
      partInput.addEventListener('blur', () => {
        setTimeout(closePartDd, 180);
      });

      descInput.addEventListener('input', () => { line.description = descInput.value; });
      qtyInput.addEventListener('input', () => { line.quantity = Number(qtyInput.value) || 0; recalcLine(row, line); });
      priceInput.addEventListener('input', () => { line.unit_price = Number(priceInput.value) || 0; recalcLine(row, line); });

      row.querySelector('[data-remove-line]').addEventListener('click', () => removeLine(seq));

      row.querySelector('[data-new-part]').addEventListener('click', async () => {
        const created = await createPartInline();
        if (!created) return;
        parts.push(created);
        toast(`Producto "${created.name}" creado`);
        pickPart(created);
      });
    });
  };

  const recalcLine = (row, line) => {
    row.querySelector('[data-line-subtotal]').textContent = money(line.quantity * line.unit_price);
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
         ${field('sku', 'SKU / Codigo')}
         ${field('price', 'Precio de venta', { type: 'number', min: 0, value: '0' })}
       </div>
       <div class="row">
         ${field('cost', 'Costo', { type: 'number', min: 0, value: '0' })}
         ${field('stock', 'Existencia inicial', { type: 'number', step: '0.01', min: 0, value: '0' })}
       </div>`,
    confirmText: 'Crear producto',
    onSubmit: (data) => api.post('/parts', clean(data, ['cost', 'price', 'stock']))
  });

  // ── Enviar ───────────────────────────────────────────────────────
  const submitSale = async () => {
    const errSlot = document.getElementById('sale-error');
    const submitBtn = document.getElementById('btn-submit-sale');
    errSlot.innerHTML = '';
    submitBtn.disabled = true;

    try {
      const items = lines
        .filter((l) => (l.part_id || l.description) && l.quantity > 0)
        .map((l) => ({
          part_id: l.part_id || undefined,
          description: l.description || undefined,
          quantity: l.quantity,
          unit_price: l.unit_price || undefined
        }));

      if (!items.length) throw new Error('Agrega al menos un item con descripcion o producto');

      const customerId = selectedCustomer?.id || undefined;
      const customerName = walkIn
        ? (document.getElementById('f-customer_name')?.value || undefined)
        : undefined;
      const paymentMethod = document.getElementById('f-payment_method')?.value || 'cash';
      const discount = Number(document.getElementById('f-discount')?.value) || 0;
      const taxRate = Number(document.getElementById('f-tax_rate')?.value) || 0;

      const result = await api.post('/sales', {
        customer_id: customerId,
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

  // ── Montar ───────────────────────────────────────────────────────
  onMount(async () => {
    await loadParts();
    renderCustomerArea();

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
          <h1>Nueva venta</h1>
        </div>
        <p class="muted small" style="margin-top:2px">Registra una venta de mostrador con cliente y productos</p>
      </div>
    </div>

    <div id="sale-error"></div>

    <form id="sale-form" onsubmit="return false">
      <div class="grid cols-2" style="margin-bottom:18px">
        <div class="card">
          <div class="card-head">
            <h2>Cliente</h2>
          </div>
          <div class="card-body" id="customer-area">
            <div class="spinner"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Condiciones</h2></div>
          <div class="card-body">
            ${field('payment_method', 'Metodo de pago', { value: 'cash', options: Object.entries(PAYMENT_METHODS) })}
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
          <button type="button" class="btn btn-default btn-sm" id="btn-add-line">+ Agregar linea</button>
        </div>
        <div class="card-body tight">
          <div class="table-wrap"><table>
            <thead><tr>
              <th>Producto</th><th>Descripcion</th><th class="num">Cantidad</th>
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
