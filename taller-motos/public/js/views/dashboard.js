import { api, session } from '../api.js';
import {
  esc, money, number, date, time, since, statusTag, empty,
  motorcycleName, APPOINTMENT_STATUS
} from '../ui.js';

export async function dashboardView() {
  const data = await api.get('/reports/dashboard');
  const c = data.counters;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : (hour < 19 ? 'Buenas tardes' : 'Buenas noches');
  const weekday = new Date().toLocaleDateString('es-CO',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const nombre = esc((session.user?.name || '').split(' ')[0]);
  const fecha = weekday[0].toUpperCase() + weekday.slice(1);

  if (session.workshop?.business_type === 'almacen') return almacenDashboard(data, greeting, nombre, fecha);

  return `
    <div class="page-head">
      <div>
        <h1>${greeting}, ${nombre}</h1>
        <p>${fecha}</p>
      </div>
      <a class="btn btn-primary" href="#/ordenes/nueva">Recibir una moto</a>
    </div>

    <div class="dash-cards">
      <div class="dash-card">
        <div class="dc-icon accent">🏍️</div>
        <div class="dc-body">
          <div class="v">${number(c.open_orders)}</div>
          <div class="k">En el taller</div>
          <div class="link"><a href="#/ordenes">Ver detalle &rarr;</a></div>
        </div>
      </div>
      <div class="dash-card">
        <div class="dc-icon blue">🔍</div>
        <div class="dc-body">
          <div class="v">${number(c.diagnosing)}</div>
          <div class="k">En diagnóstico</div>
          <div class="link"><a href="#/ordenes">Ver detalle &rarr;</a></div>
        </div>
      </div>
      <div class="dash-card">
        <div class="dc-icon amber">🔧</div>
        <div class="dc-body">
          <div class="v">${number(c.in_progress)}</div>
          <div class="k">En reparación</div>
          <div class="link"><a href="#/ordenes">Ver detalle &rarr;</a></div>
        </div>
      </div>
      <div class="dash-card">
        <div class="dc-icon green">✓</div>
        <div class="dc-body">
          <div class="v">${number(c.ready_for_pickup)}</div>
          <div class="k">Listas para entregar</div>
          <div class="link"><a href="#/ordenes">Ver detalle &rarr;</a></div>
        </div>
      </div>
    </div>

    <div class="receivable-card">
      <div class="dc-icon red">💰</div>
      <div style="flex:1">
        <div class="rc-amount">${money(c.receivable)}</div>
        <div class="rc-label">Por cobrar</div>
      </div>
      <div class="link"><a href="#/reportes">Ver detalle &rarr;</a></div>
    </div>

    <div class="card pipeline-card">
      <div class="card-head"><h2>Flujo de trabajo en el taller</h2></div>
      <div class="pipeline">
        ${pipeStep('accent', '📋', c.received || 0, 'Recibida')}
        ${pipeArrow()}
        ${pipeStep('blue', '🔍', c.diagnosing || 0, 'Diagnóstico')}
        ${pipeArrow()}
        ${pipeStep('amber', '🔧', c.in_progress || 0, 'Reparación')}
        ${pipeArrow()}
        ${pipeStep('green', '✓', c.ready_for_pickup || 0, 'Lista')}
        ${pipeArrow()}
        ${pipeStep('grey', '🏁', data.open_orders.length ? '—' : '0', 'Entregada')}
      </div>
    </div>

    <div class="grid cols-2">
      <div>
        <div class="card">
          <div class="card-head">
            <h2>Motos en el taller</h2>
            <a class="btn btn-default btn-sm" href="#/ordenes">Ver todas</a>
          </div>
          <div class="card-body tight">
            ${data.open_orders.length ? `
            <div class="table-wrap">
              <table>
                <thead><tr>
                  <th>Moto</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Ingreso</th>
                </tr></thead>
                <tbody>
                  ${data.open_orders.slice(0, 10).map((o) => `
                  <tr class="clickable" onclick="location.hash='#/ordenes/${esc(o.id)}'">
                    <td>
                      <div class="strong">${esc([o.brand, o.model].filter(Boolean).join(' ') || `Orden #${o.number}`)}</div>
                      ${o.plate ? `<div class="faint"><span class="plate">${esc(o.plate)}</span></div>` : ''}
                    </td>
                    <td>
                      <div>${esc(o.customer_name || 'Sin cliente')}</div>
                      ${o.phone ? `<div class="faint">${esc(o.phone)}</div>` : ''}
                    </td>
                    <td>${statusTag(o.status)}</td>
                    <td class="faint nowrap">${esc(date(o.received_at))}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
            ${data.open_orders.length > 10 ? `
            <div class="center" style="padding:12px">
              <a class="btn btn-default btn-sm" href="#/ordenes">Ver más motos</a>
            </div>` : ''}`
            : empty('No hay motos en el taller ahora mismo.', '🏍️')}
          </div>
        </div>

        ${data.ready_for_pickup.length ? `
        <div class="card">
          <div class="card-head"><h2>Listas para entregar</h2></div>
          <div class="card-body tight">
            ${data.ready_for_pickup.map((order) => `
              <a class="list-item" href="#/ordenes/${esc(order.id)}" style="color:inherit;text-decoration:none">
                <div class="grow">
                  <div class="t"><span class="plate">${esc(order.plate || '—')}</span>
                    ${esc(order.customer_name || 'Sin cliente')}</div>
                  <div class="s">${esc(order.phone || 'Sin teléfono')} · lista desde ${esc(since(order.received_at))}</div>
                </div>
                <div class="right nowrap">
                  <div class="strong small">${money(order.total)}</div>
                  ${Number(order.total) > Number(order.paid_total)
                    ? `<div class="faint" style="color:var(--red)">debe ${money(Number(order.total) - Number(order.paid_total))}</div>`
                    : '<div class="faint">pagada</div>'}
                </div>
              </a>`).join('')}
          </div>
        </div>` : ''}
      </div>

      <div>
        <div class="card">
          <div class="card-head">
            <h2>Citas de hoy</h2>
            <a class="btn btn-default btn-sm" href="#/agenda">Agenda</a>
          </div>
          <div class="card-body tight">
            ${data.appointments_today.length ? data.appointments_today.map((appointment) => `
              <div class="list-item" style="cursor:default">
                <div class="grow">
                  <div class="t">${esc(time(appointment.scheduled_at))} ·
                    ${esc(appointment.customer_name || 'Sin cliente')}</div>
                  <div class="s">${appointment.plate ? `<span class="plate">${esc(appointment.plate)}</span> ` : ''}
                    ${esc(appointment.reason || 'Sin motivo')}</div>
                </div>
                <span class="tag ${(APPOINTMENT_STATUS[appointment.status] || {}).tag || 'tag-grey'}">
                  ${esc((APPOINTMENT_STATUS[appointment.status] || {}).label || appointment.status)}</span>
              </div>`).join('')
              : empty('No hay citas para hoy.', '📅')}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Caja de hoy</h2></div>
          <div class="card-body">
            <div class="totals">
              <div class="line total"><span>Recaudado</span>
                <span>${money(data.cash_today.today)}</span></div>
              <div class="line"><span>Pagos registrados</span>
                <span>${number(data.cash_today.payments)}</span></div>
              <div class="line"><span>Motos recibidas hoy</span>
                <span>${number(c.received_today)}</span></div>
            </div>
          </div>
        </div>

        ${data.mechanics.length ? `
        <div class="card">
          <div class="card-head"><h2>Carga de los mecánicos</h2></div>
          <div class="card-body tight">
            ${data.mechanics.map((mechanic) => `
              <div class="list-item" style="cursor:default">
                <div class="grow"><div class="t">${esc(mechanic.name)}</div></div>
                <span class="tag ${mechanic.open_orders > 0 ? 'tag-accent' : 'tag-grey'}">
                  ${number(mechanic.open_orders)} ${mechanic.open_orders === 1 ? 'orden' : 'órdenes'}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}

        ${data.low_stock.length ? `
        <div class="card">
          <div class="card-head">
            <h2>Repuestos por pedir</h2>
            <a class="btn btn-default btn-sm" href="#/inventario">Inventario</a>
          </div>
          <div class="card-body tight">
            ${data.low_stock.map((part) => `
              <div class="list-item" style="cursor:default">
                <div class="grow">
                  <div class="t">${esc(part.name)}</div>
                  <div class="s">${esc(part.sku || 'Sin SKU')} · mínimo ${number(part.min_stock)}</div>
                </div>
                <span class="tag tag-red">${number(part.stock)} en stock</span>
              </div>`).join('')}
          </div>
        </div>` : ''}
      </div>
    </div>`;
}

// Panel del modo almacén: sin órdenes de trabajo ni agenda de reparación,
// por delante lo que un almacén de repuestos revisa cada mañana — cuánto
// vendió ayer/hoy y qué se está por acabar.
function almacenDashboard(data, greeting, nombre, fecha) {
  const s = data.sales_today || { count: 0, total: 0 };

  return `
    <div class="page-head">
      <div>
        <h1>${greeting}, ${nombre}</h1>
        <p>${fecha}</p>
      </div>
      <a class="btn btn-primary" href="#/ventas/nueva">Nueva venta</a>
    </div>

    <div class="dash-cards">
      <div class="dash-card">
        <div class="dc-icon accent">🛒</div>
        <div class="dc-body">
          <div class="v">${number(s.count)}</div>
          <div class="k">Ventas de hoy</div>
          <div class="link"><a href="#/ventas">Ver detalle &rarr;</a></div>
        </div>
      </div>
      <div class="dash-card">
        <div class="dc-icon green">💰</div>
        <div class="dc-body">
          <div class="v">${money(s.total)}</div>
          <div class="k">Recaudado hoy</div>
          <div class="link"><a href="#/ventas">Ver detalle &rarr;</a></div>
        </div>
      </div>
      <div class="dash-card">
        <div class="dc-icon red">📦</div>
        <div class="dc-body">
          <div class="v">${number(data.low_stock.length)}</div>
          <div class="k">Repuestos por pedir</div>
          <div class="link"><a href="#/inventario">Ver detalle &rarr;</a></div>
        </div>
      </div>
    </div>

    <div class="grid cols-2">
      <div>
        <div class="card">
          <div class="card-head">
            <h2>Repuestos con stock bajo</h2>
            <a class="btn btn-default btn-sm" href="#/inventario">Inventario</a>
          </div>
          <div class="card-body tight">
            ${data.low_stock.length ? data.low_stock.map((part) => `
              <div class="list-item" style="cursor:default">
                <div class="grow">
                  <div class="t">${esc(part.name)}</div>
                  <div class="s">${esc(part.sku || 'Sin SKU')} · mínimo ${number(part.min_stock)}</div>
                </div>
                <span class="tag tag-red">${number(part.stock)} en stock</span>
              </div>`).join('')
              : empty('Ningún repuesto está por debajo del mínimo. 👏', '📦')}
          </div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-head"><h2>Caja de hoy</h2></div>
          <div class="card-body">
            <div class="totals">
              <div class="line total"><span>Recaudado</span>
                <span>${money(s.total)}</span></div>
              <div class="line"><span>Ventas registradas</span>
                <span>${number(s.count)}</span></div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Accesos rápidos</h2></div>
          <div class="card-body tight">
            <a class="list-item" href="#/ventas/nueva" style="color:inherit;text-decoration:none">
              <div class="grow"><div class="t">🛒 Registrar una venta</div></div>
            </a>
            <a class="list-item" href="#/inventario" style="color:inherit;text-decoration:none">
              <div class="grow"><div class="t">📦 Cargar o ajustar inventario</div></div>
            </a>
          </div>
        </div>
      </div>
    </div>`;
}

function pipeStep(color, icon, count, label) {
  return `<div class="pipe-step">
    <div class="pipe-dot ${color}">${icon}</div>
    <div class="pipe-count">${count}</div>
    <div class="pipe-label">${label}</div>
  </div>`;
}

function pipeArrow() {
  return `<div class="pipe-arrow">&rarr;</div>`;
}
