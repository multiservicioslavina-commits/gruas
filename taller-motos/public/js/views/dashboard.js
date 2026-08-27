// Panel principal: lo que el taller necesita ver al abrir por la mañana.
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

  return `
    <div class="page-head">
      <div>
        <h1>${greeting}, ${esc((session.user?.name || '').split(' ')[0])}</h1>
        <p>${esc(new Date().toLocaleDateString('es-CO',
          { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
      </div>
      <a class="btn btn-primary" href="#/ordenes/nueva">Recibir una moto</a>
    </div>

    <div class="stats">
      <div class="stat accent"><div class="v">${number(c.open_orders)}</div>
        <div class="k">En el taller</div></div>
      <div class="stat"><div class="v">${number(c.diagnosing)}</div>
        <div class="k">En diagnóstico</div></div>
      <div class="stat amber"><div class="v">${number(c.awaiting_approval)}</div>
        <div class="k">Esperando al cliente</div></div>
      <div class="stat amber"><div class="v">${number(c.in_progress)}</div>
        <div class="k">En reparación</div></div>
      <div class="stat green"><div class="v">${number(c.ready_for_pickup)}</div>
        <div class="k">Listas para entregar</div></div>
      <div class="stat red"><div class="v">${money(c.receivable)}</div>
        <div class="k">Por cobrar</div></div>
    </div>

    <div class="grid cols-2">
      <div>
        <div class="card">
          <div class="card-head">
            <h2>Motos en el taller</h2>
            <a class="btn btn-default btn-sm" href="#/ordenes">Ver todas</a>
          </div>
          <div class="card-body tight">
            ${data.open_orders.length ? data.open_orders.map((order) => `
              <a class="list-item" href="#/ordenes/${esc(order.id)}" style="color:inherit;text-decoration:none">
                <div class="grow">
                  <div class="t"><span class="plate">${esc(order.plate || 'SIN PLACA')}</span>
                    ${esc(order.customer_name || 'Sin cliente')}</div>
                  <div class="s">Orden #${esc(order.number)} · ingresó ${esc(since(order.received_at))}</div>
                </div>
                <div class="right nowrap">
                  ${statusTag(order.status)}
                  <div class="faint" style="margin-top:4px">${money(order.total)}</div>
                </div>
              </a>`).join('')
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
          <div class="card-head">
            <h2>Caja de hoy</h2>
          </div>
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
