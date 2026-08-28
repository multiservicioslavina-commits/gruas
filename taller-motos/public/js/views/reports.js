// Reportes de periodo: ventas, servicios, inventario, productividad y cartera.
import { api } from '../api.js';
import { esc, money, number, date, empty, statusTag, ORDER_STATUS, PAYMENT_METHODS } from '../ui.js';
import { onMount } from '../app.js';

const firstOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};

export async function reportsView() {
  const state = { from: firstOfMonth(), to: new Date().toISOString().slice(0, 10) };

  const bar = (value, max) => `
    <div style="height:6px;background:var(--surface-2);border-radius:4px;overflow:hidden;margin-top:4px">
      <div style="height:100%;width:${max ? (value / max) * 100 : 0}%;background:var(--accent)"></div>
    </div>`;

  const load = async () => {
    const target = document.getElementById('report-body');
    target.innerHTML = '<div class="spinner"></div>';
    const report = await api.get(`/reports/summary?from=${state.from}&to=${state.to}`);
    const receivables = await api.get('/reports/receivables');

    const maxStatus = Math.max(1, ...report.orders_by_status.map((row) => row.count));

    target.innerHTML = `
      <div class="stats">
        <div class="stat accent"><div class="v">${number(report.sales.orders)}</div>
          <div class="k">Órdenes</div></div>
        <div class="stat"><div class="v">${money(report.sales.invoiced)}</div>
          <div class="k">Facturado</div></div>
        <div class="stat green"><div class="v">${money(report.sales.labor)}</div>
          <div class="k">Mano de obra</div></div>
        <div class="stat"><div class="v">${money(report.sales.parts)}</div>
          <div class="k">Repuestos</div></div>
        <div class="stat"><div class="v">${money(report.sales.average_ticket)}</div>
          <div class="k">Ticket promedio</div></div>
        <div class="stat red"><div class="v">${money(report.receivable.amount)}</div>
          <div class="k">Por cobrar</div></div>
      </div>

      <div class="grid cols-2">
        <div class="card">
          <div class="card-head"><h2>Órdenes por estado</h2></div>
          <div class="card-body">
            ${report.orders_by_status.length ? report.orders_by_status.map((row) => `
              <div style="margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;font-size:.87rem">
                  <span>${esc(ORDER_STATUS[row.status]?.label || row.status)}</span>
                  <span class="strong">${number(row.count)}</span>
                </div>
                ${bar(row.count, maxStatus)}
              </div>`).join('') : empty('Sin órdenes en este periodo.', '📊')}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Cómo entró el dinero</h2></div>
          <div class="card-body">
            ${report.payments_by_method.length ? `<div class="totals">
              ${report.payments_by_method.map((row) => `
                <div class="line"><span>${esc(PAYMENT_METHODS[row.method] || row.method)}
                  <span class="faint">(${number(row.count)})</span></span>
                  <span>${money(row.amount)}</span></div>`).join('')}
              <div class="line total"><span>Recaudado</span>
                <span>${money(report.payments_by_method.reduce((s, r) => s + Number(r.amount), 0))}</span></div>
            </div>` : empty('Sin pagos registrados en el periodo.', '💵')}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Servicios más vendidos</h2></div>
          <div class="card-body tight">
            ${report.top_services.length ? `<div class="table-wrap"><table>
              <thead><tr><th>Servicio</th><th class="num">Veces</th><th class="num">Ingreso</th></tr></thead>
              <tbody>${report.top_services.map((row) => `
                <tr><td>${esc(row.description)}</td>
                  <td class="num">${number(row.quantity)}</td>
                  <td class="num strong">${money(row.revenue)}</td></tr>`).join('')}
              </tbody></table></div>` : empty('Sin mano de obra facturada.', '🔧')}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Repuestos más vendidos</h2></div>
          <div class="card-body tight">
            ${report.top_parts.length ? `<div class="table-wrap"><table>
              <thead><tr><th>Repuesto</th><th class="num">Cant.</th>
                <th class="num">Ingreso</th><th class="num">Margen</th></tr></thead>
              <tbody>${report.top_parts.map((row) => `
                <tr><td>${esc(row.description)}</td>
                  <td class="num">${number(row.quantity)}</td>
                  <td class="num">${money(row.revenue)}</td>
                  <td class="num strong" style="color:var(--green)">${money(row.margin)}</td></tr>`).join('')}
              </tbody></table></div>` : empty('Sin repuestos vendidos.', '📦')}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Productividad por mecánico</h2></div>
          <div class="card-body tight">
            ${report.mechanics.length ? `<div class="table-wrap"><table>
              <thead><tr><th>Mecánico</th><th class="num">Órdenes</th>
                <th class="num">Mano de obra</th></tr></thead>
              <tbody>${report.mechanics.map((row) => `
                <tr><td>${esc(row.name)}</td>
                  <td class="num">${number(row.orders)}</td>
                  <td class="num strong">${money(row.labor_billed)}</td></tr>`).join('')}
              </tbody></table></div>` : empty('No hay mecánicos registrados.', '👷')}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Inventario</h2></div>
          <div class="card-body">
            <div class="totals">
              <div class="line"><span>Referencias activas</span>
                <span>${number(report.inventory.items)}</span></div>
              <div class="line"><span>Valor a costo</span>
                <span>${money(report.inventory.cost_value)}</span></div>
              <div class="line"><span>Valor a precio de venta</span>
                <span>${money(report.inventory.retail_value)}</span></div>
              <div class="line ${report.inventory.below_minimum > 0 ? 'due' : ''}">
                <span>Por debajo del mínimo</span>
                <span>${number(report.inventory.below_minimum)}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Cartera por cobrar</h2>
          <span class="tag tag-red">${money(report.receivable.amount)} en ${number(report.receivable.orders)} órdenes</span>
        </div>
        <div class="card-body tight">
          ${receivables.data.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Orden</th><th>Cliente</th><th>Estado</th>
              <th class="num">Total</th><th class="num">Abonado</th><th class="num">Saldo</th></tr></thead>
            <tbody>${receivables.data.map((row) => `
              <tr class="clickable" onclick="location.hash='#/ordenes/${esc(row.id)}'">
                <td><span class="strong">#${esc(row.number)}</span>
                  <span class="plate">${esc(row.plate || '—')}</span>
                  <div class="faint">${date(row.received_at)}</div></td>
                <td>${esc(row.customer_name || '—')}
                  <div class="faint">${esc(row.customer_phone || '')}</div></td>
                <td>${statusTag(row.status)}</td>
                <td class="num">${money(row.total)}</td>
                <td class="num">${money(row.paid_total)}</td>
                <td class="num strong" style="color:var(--red)">${money(row.balance)}</td>
              </tr>`).join('')}</tbody>
          </table></div>` : empty('Nadie te debe. 👏', '✅')}
        </div>
      </div>`;
  };

  onMount(() => {
    load();
    for (const id of ['rep-from', 'rep-to']) {
      document.getElementById(id).addEventListener('change', (event) => {
        state[id === 'rep-from' ? 'from' : 'to'] = event.target.value;
        load();
      });
    }
    document.getElementById('btn-print-report').addEventListener('click', () => window.print());
  });

  return `
    <div class="page-head">
      <div><h1>Reportes</h1><p>Cómo le fue a tu taller en el periodo.</p></div>
      <button class="btn btn-default no-print" id="btn-print-report">Imprimir</button>
    </div>
    <div class="toolbar no-print">
      <div class="field" style="margin:0"><label>Desde</label>
        <input type="date" id="rep-from" value="${state.from}"></div>
      <div class="field" style="margin:0"><label>Hasta</label>
        <input type="date" id="rep-to" value="${state.to}"></div>
    </div>
    <div id="report-body"></div>`;
}
