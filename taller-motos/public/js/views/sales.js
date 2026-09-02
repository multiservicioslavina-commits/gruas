// Ventas de mostrador: vender un repuesto sin que pase por una orden de
// trabajo. Se cobra al momento y descuenta inventario solo.
import { api, session } from '../api.js';
import { esc, money, date, empty, toast, field, modal, clean, PAYMENT_METHODS } from '../ui.js';
import { onMount } from '../app.js';

export async function salesView() {
  let sales = [];

  const load = async () => {
    const target = document.getElementById('sales-body');
    target.innerHTML = '<div class="spinner"></div>';
    sales = (await api.get('/sales')).data;

    target.innerHTML = sales.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>N°</th><th>Cliente</th><th>Ítems</th>
          <th>Método</th><th class="num">Total</th><th>Factura</th><th></th></tr></thead>
        <tbody>${sales.map((sale) => `
          <tr>
            <td class="small muted">${date(sale.created_at, true)}</td>
            <td class="strong">#${esc(sale.number)}</td>
            <td>${esc(sale.customer_name_saved || sale.customer_name || 'Mostrador')}</td>
            <td class="small muted">${esc(sale.item_count)}</td>
            <td class="small muted">${esc(PAYMENT_METHODS[sale.payment_method] || sale.payment_method)}</td>
            <td class="num strong">${money(sale.total)}</td>
            <td class="small muted" data-invoice-cell="${esc(sale.id)}">…</td>
            <td class="num nowrap" data-invoice-action="${esc(sale.id)}">…</td>
          </tr>`).join('')}</tbody>
      </table></div>` : empty('Aún no has registrado ninguna venta de mostrador.', '🧾');

    await paintInvoiceStatus();
  };

  // El listado no trae el detalle de facturas (evita N+1 al cargar la
  // página); se pide sólo cuando ya está pintada la tabla.
  const paintInvoiceStatus = async () => {
    await Promise.all(sales.map(async (sale) => {
      const cell = document.querySelector(`[data-invoice-cell="${sale.id}"]`);
      const actionCell = document.querySelector(`[data-invoice-action="${sale.id}"]`);
      if (!cell || !actionCell) return;
      const full = await api.get(`/sales/${sale.id}`);
      const facturada = full.invoices.find((i) => i.status === 'issued');
      if (facturada) {
        cell.textContent = facturada.doc_code;
        actionCell.innerHTML = '';
      } else {
        cell.textContent = 'Sin facturar';
        actionCell.innerHTML = session.can('cashier')
          ? `<button class="btn btn-quiet btn-sm" data-facturar="${esc(sale.id)}">Facturar</button>` : '';
        actionCell.querySelector('[data-facturar]')?.addEventListener('click', async (event) => {
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

  // Crea un repuesto sin salir de la venta — para cuando llega alguien a
  // comprar algo que todavía no está cargado en Inventario.
  const createPartInline = () => modal({
    title: 'Nuevo repuesto',
    body:
      field('name', 'Nombre', { required: true }) +
      `<div class="row">
         ${field('sku', 'SKU')}
         ${field('price', 'Precio de venta', { type: 'number', min: 0, value: '0' })}
       </div>
       <div class="row">
         ${field('cost', 'Costo', { type: 'number', min: 0, value: '0' })}
         ${field('stock', 'Existencia inicial', { type: 'number', step: '0.01', min: 0, value: '0' })}
       </div>`,
    confirmText: 'Crear repuesto',
    onSubmit: (data) => api.post('/parts', clean(data, ['cost', 'price', 'stock']))
  });

  const newSale = async () => {
    let parts = (await api.get('/parts?active=true&limit=500')).data;

    const partOptions = (selected) => parts.length
      ? parts.map((part) =>
          `<option value="${esc(part.id)}"${part.id === selected ? ' selected' : ''}>` +
          `${esc(part.name)} · ${money(part.price)} (${part.stock} disp.)</option>`).join('')
      : '<option value="">Sin repuestos — créalo con el botón +</option>';

    const lineRow = () => `
      <div class="row-3" data-line style="margin-bottom:8px">
        <div style="display:flex;gap:6px">
          <select name="part_id" style="flex:1">${partOptions()}</select>
          <button type="button" class="btn btn-default btn-sm" data-new-part
                  title="Crear repuesto nuevo">+</button>
        </div>
        <input name="quantity" type="number" step="0.01" min="0.01" placeholder="Cantidad" value="1">
        <input name="unit_price" type="number" min="0" placeholder="Precio (opcional)">
      </div>`;

    const bindNewPartButtons = () => {
      document.querySelectorAll('[data-new-part]').forEach((button) => {
        // El modal de repuesto se puede abrir varias veces; evita doble enlace.
        if (button.dataset.bound) return;
        button.dataset.bound = '1';
        button.addEventListener('click', async () => {
          const created = await createPartInline();
          if (!created) return;
          parts.push(created);
          toast(`Repuesto "${created.name}" creado`);
          document.querySelectorAll('#sale-lines [name=part_id]').forEach((select) => {
            const current = select.value;
            select.innerHTML = partOptions(current);
          });
          button.closest('[data-line]').querySelector('[name=part_id]').value = created.id;
        });
      });
    };

    const pending = modal({
      title: 'Nueva venta de mostrador',
      wide: true,
      body:
        `<div class="row">
           ${field('customer_name', 'Cliente (opcional)', { placeholder: 'Mostrador' })}
           ${field('payment_method', 'Método de pago', { value: 'cash', options: Object.entries(PAYMENT_METHODS) })}
         </div>
         <div class="row">
           ${field('discount', 'Descuento', { type: 'number', min: 0, value: '0' })}
           ${field('tax_rate', 'IVA (%)', { type: 'number', min: 0, max: 100,
             value: session.workshop?.tax_rate || '0' })}
         </div>
         <p class="small muted" style="margin:6px 0 10px">Ítems de la venta:</p>
         <div id="sale-lines">${lineRow()}</div>
         <button type="button" class="btn btn-default btn-sm" id="btn-add-line">+ Otro ítem</button>`,
      confirmText: 'Registrar venta',
      onSubmit: (data, form) => {
        const items = [...form.querySelectorAll('[data-line]')].map((row) => ({
          part_id: row.querySelector('[name=part_id]').value,
          quantity: Number(row.querySelector('[name=quantity]').value),
          unit_price: row.querySelector('[name=unit_price]').value
            ? Number(row.querySelector('[name=unit_price]').value) : undefined
        })).filter((item) => item.part_id && item.quantity > 0);

        if (!items.length) throw new Error('Agrega al menos un ítem con repuesto y cantidad');
        return api.post('/sales', {
          customer_name: data.customer_name || undefined,
          payment_method: data.payment_method,
          discount: Number(data.discount) || 0,
          tax_rate: Number(data.tax_rate) || 0,
          items
        });
      }
    });

    bindNewPartButtons();
    document.getElementById('btn-add-line')?.addEventListener('click', () => {
      document.getElementById('sale-lines').insertAdjacentHTML('beforeend', lineRow());
      bindNewPartButtons();
    });

    const result = await pending;
    if (result) { toast(`Venta #${result.number} registrada`); load(); }
  };

  onMount(async () => {
    await load();
    document.getElementById('btn-new-sale').addEventListener('click', newSale);
  });

  return `
    <div class="page-head">
      <div><h1>Ventas</h1><p>Venta de mostrador: repuestos vendidos sin orden de trabajo.</p></div>
      <button class="btn btn-primary" id="btn-new-sale">Nueva venta</button>
    </div>
    <div class="card"><div class="card-body tight" id="sales-body"></div></div>`;
}
