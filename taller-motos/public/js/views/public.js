// Pantallas del cliente final: seguimiento de su moto y aprobación de la
// cotización. No requieren cuenta — se entra con el código o el enlace.
import { api } from '../api.js';
import {
  esc, money, date, ORDER_STATUS, errorBox, toast, motorcycleName
} from '../ui.js';
import { onMount } from '../app.js';

const FLOW = ['received', 'diagnosing', 'quoted', 'pending_approval', 'approved',
              'repairing', 'waiting_parts', 'quality_check', 'ready', 'delivered'];

const CUSTOMER_LABEL = {
  received: 'Recibida en el taller',
  diagnosing: 'En diagnóstico',
  quoted: 'Cotizada',
  pending_approval: 'Esperando tu aprobación',
  approved: 'Aprobada por ti',
  repairing: 'En reparación',
  waiting_parts: 'Esperando repuestos',
  quality_check: 'Revisión final',
  ready: '¡Lista para recoger!',
  delivered: 'Entregada'
};

function wrapper(inner) {
  return `<div class="centered"><div class="panel wide">
    <div class="panel-brand">TALLER MOTOS</div>${inner}</div></div>`;
}

export async function trackView(code = '') {
  const clean = decodeURIComponent(code || '').trim().toUpperCase();

  // Sin código: formulario para escribirlo.
  if (!clean) {
    onMount(() => {
      document.getElementById('track-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const value = document.getElementById('f-code').value.trim().toUpperCase();
        if (value.length >= 4) location.hash = `#/orden/${encodeURIComponent(value)}`;
        else toast('Escribe el código completo que te dio el taller', true);
      });
    });
    return wrapper(`
      <div class="card"><div class="card-body">
        <h1>¿Cómo va tu moto?</h1>
        <p class="muted small" style="margin:6px 0 20px">
          Escribe el código de tu orden. Te lo dio el taller cuando dejaste la moto.</p>
        <form id="track-form">
          <input id="f-code" maxlength="8" placeholder="A1B2C3" autocomplete="off"
                 style="text-align:center;letter-spacing:.35em;text-transform:uppercase;
                        font-family:var(--mono);font-size:1.15rem;padding:14px">
          <button type="submit" class="btn btn-primary btn-block" style="margin-top:14px">
            Ver mi orden</button>
        </form>
      </div></div>`);
  }

  let order;
  try {
    order = await api.get(`/public/orders/${encodeURIComponent(clean)}`, { anonymous: true });
  } catch (err) {
    return wrapper(`${errorBox(err.status === 404
      ? 'No encontramos ninguna orden con ese código. Revísalo con tu taller.'
      : err.message)}
      <a class="btn btn-default btn-block" href="#/orden/">Probar con otro código</a>`);
  }

  const reached = new Map();
  (order.history || []).forEach((h) => { if (!reached.has(h.status)) reached.set(h.status, h.created_at); });
  const currentIndex = FLOW.indexOf(order.status);

  const steps = FLOW
    .filter((s) => s !== 'waiting_parts' || reached.has(s) || order.status === s)
    .filter((s) => !['quoted', 'approved'].includes(s) || reached.has(s))
    .map((status, _i) => {
      const index = FLOW.indexOf(status);
      const state = order.status === status ? 'now'
        : (reached.has(status) || index < currentIndex ? 'done' : 'todo');
      return `<div class="tl-item ${state}">
          <div class="tl-t">${esc(CUSTOMER_LABEL[status] || status)}</div>
          <div class="tl-d">${reached.has(status) ? date(reached.get(status), true)
            : (state === 'todo' ? 'Pendiente' : '')}</div>
        </div>`;
    }).join('');

  const balance = Number(order.balance || 0);
  const recommendations = (order.diagnostics || [])
    .filter((d) => d.recommendations).map((d) => d.recommendations);

  return wrapper(`
    <div class="card">
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
          <div>
            <span class="plate">${esc(order.plate || 'SIN PLACA')}</span>
            <div class="muted small" style="margin-top:6px">
              ${esc(motorcycleName(order))} · orden #${esc(order.number)}</div>
          </div>
          <span class="tag ${(ORDER_STATUS[order.status] || {}).tag || 'tag-grey'}">
            ${esc(CUSTOMER_LABEL[order.status] || order.status)}</span>
        </div>
        <div class="timeline" style="margin-top:20px">${steps}</div>
      </div>
    </div>

    ${order.pending_quote ? `
      <div class="card" style="border-color:var(--amber)">
        <div class="card-body">
          <h2>Tienes una cotización por responder</h2>
          <p class="muted small" style="margin:6px 0 14px">
            El taller te envió un presupuesto de ${money(order.pending_quote.total, order.currency)}.
            Necesita tu visto bueno para continuar.</p>
          <a class="btn btn-primary btn-block"
             href="#/aprobar/${esc(order.pending_quote.public_token)}">Ver y responder</a>
        </div>
      </div>` : ''}

    <div class="card"><div class="card-body">
      <div class="kv"><span class="k">Ingresó</span><span class="v">${date(order.received_at, true)}</span></div>
      ${order.promised_at ? `<div class="kv"><span class="k">Entrega prometida</span>
        <span class="v">${date(order.promised_at)}</span></div>` : ''}
      ${order.delivered_at ? `<div class="kv"><span class="k">Entregada</span>
        <span class="v">${date(order.delivered_at, true)}</span></div>` : ''}
      <div class="kv"><span class="k">Taller</span><span class="v">${esc(order.workshop_name)}</span></div>
      ${order.workshop_phone ? `<div class="kv"><span class="k">Teléfono</span>
        <span class="v"><a href="tel:${esc(order.workshop_phone)}">${esc(order.workshop_phone)}</a></span></div>` : ''}
      ${order.workshop_address ? `<div class="kv"><span class="k">Dirección</span>
        <span class="v">${esc(order.workshop_address)}</span></div>` : ''}
    </div></div>

    ${order.complaint || order.work_performed || recommendations.length ? `
      <div class="card"><div class="card-body">
        ${order.complaint ? `<h3>Lo que reportaste</h3>
          <p class="muted small" style="margin:4px 0 14px;white-space:pre-wrap">${esc(order.complaint)}</p>` : ''}
        ${order.work_performed ? `<h3>Trabajo realizado</h3>
          <p class="muted small" style="margin:4px 0 14px;white-space:pre-wrap">${esc(order.work_performed)}</p>` : ''}
        ${recommendations.length ? `<h3>Recomendaciones del taller</h3>
          <p class="muted small" style="margin:4px 0 0;white-space:pre-wrap">${esc(recommendations.join('\n'))}</p>` : ''}
      </div></div>` : ''}

    ${Number(order.total) > 0 ? `
      <div class="card"><div class="card-body">
        <div class="totals">
          <div class="line total"><span>Total del servicio</span>
            <span>${money(order.total, order.currency)}</span></div>
          <div class="line"><span>Abonado</span><span>${money(order.paid_total, order.currency)}</span></div>
          <div class="line ${balance > 0 ? 'due' : ''}"><span>Saldo</span>
            <span>${money(balance, order.currency)}</span></div>
        </div>
      </div></div>` : ''}

    <a class="btn btn-default btn-block" href="#/orden/">Consultar otro código</a>`);
}

export async function approveView(token) {
  let quote;
  try {
    quote = await api.get(`/public/quotes/${encodeURIComponent(token)}`, { anonymous: true });
  } catch (err) {
    return wrapper(errorBox(err.status === 404
      ? 'Esta cotización no existe o el enlace ya no es válido.' : err.message));
  }

  const responded = ['approved', 'rejected', 'partial'].includes(quote.status);
  const optionals = quote.items.filter((i) => i.optional);

  if (!responded && !quote.expired) {
    onMount(() => {
      const form = document.getElementById('approve-form');
      const send = async (decision) => {
        const slot = document.getElementById('approve-error');
        slot.innerHTML = '';
        form.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        try {
          const items = [...form.querySelectorAll('input[data-item]')]
            .map((input) => ({ id: input.dataset.item, approved: input.checked }));
          await api.post(`/public/quotes/${encodeURIComponent(token)}/respond`, {
            decision,
            customer_name: document.getElementById('f-customer_name').value.trim(),
            note: document.getElementById('f-note').value.trim(),
            items
          }, { anonymous: true });
          location.reload();
        } catch (err) {
          slot.innerHTML = errorBox(err.message);
          form.querySelectorAll('button').forEach((b) => { b.disabled = false; });
        }
      };
      document.getElementById('btn-approve').addEventListener('click', () => send('approved'));
      document.getElementById('btn-reject').addEventListener('click', async () => {
        if (confirm('¿Seguro que quieres rechazar todo el presupuesto? El taller no hará el trabajo.')) {
          await send('rejected');
        }
      });
    });
  }

  const itemRow = (item) => {
    const total = money(Number(item.quantity) * Number(item.unit_price), quote.currency);
    if (item.optional && !responded && !quote.expired) {
      return `<label class="check-row">
        <input type="checkbox" data-item="${esc(item.id)}" checked>
        <span class="grow">
          <span class="strong small">${esc(item.description)}</span>
          <span class="faint" style="display:block">
            ${esc(item.kind === 'part' ? 'Repuesto' : 'Mano de obra')} ·
            ${esc(item.quantity)} × ${money(item.unit_price, quote.currency)} · opcional</span>
        </span>
        <span class="strong small nowrap">${total}</span>
      </label>`;
    }
    return `<div class="check-row">
      <span class="grow">
        <span class="strong small">${esc(item.description)}</span>
        <span class="faint" style="display:block">
          ${esc(item.kind === 'part' ? 'Repuesto' : 'Mano de obra')} ·
          ${esc(item.quantity)} × ${money(item.unit_price, quote.currency)}
          ${item.approved === false ? ' · no autorizado' : ''}</span>
      </span>
      <span class="strong small nowrap"${item.approved === false ? ' style="text-decoration:line-through;opacity:.55"' : ''}>${total}</span>
    </div>`;
  };

  const banner = responded
    ? `<div class="alert ${quote.status === 'rejected' ? 'alert-error' : 'alert-ok'}">
         ${quote.status === 'rejected'
           ? 'Rechazaste este presupuesto. Si cambias de opinión, habla con el taller.'
           : `Respondiste este presupuesto el ${date(quote.responded_at, true)}. El taller ya fue notificado.`}
       </div>`
    : quote.expired
      ? '<div class="alert alert-warn">Este presupuesto venció. Pídele al taller uno nuevo.</div>'
      : '';

  return wrapper(`
    <div class="card">
      <div class="card-body">
        <h1>Presupuesto #${esc(quote.number)}</h1>
        <p class="muted small" style="margin:6px 0 16px">
          ${esc(quote.workshop_name)} · <span class="plate">${esc(quote.plate || 'SIN PLACA')}</span>
          ${quote.brand ? ` ${esc([quote.brand, quote.model].filter(Boolean).join(' '))}` : ''}
          · orden #${esc(quote.work_order_number)}</p>
        ${banner}
        ${quote.complaint ? `<p class="small muted" style="margin-bottom:16px">
          <span class="strong">Motivo de ingreso:</span> ${esc(quote.complaint)}</p>` : ''}

        <form id="approve-form">
          <div id="approve-error"></div>
          ${quote.items.map(itemRow).join('')}

          <div class="totals" style="margin-top:16px">
            <div class="line"><span>Subtotal</span><span>${money(quote.subtotal, quote.currency)}</span></div>
            ${Number(quote.discount) ? `<div class="line"><span>Descuento</span>
              <span>− ${money(quote.discount, quote.currency)}</span></div>` : ''}
            ${Number(quote.tax_rate) ? `<div class="line"><span>IVA (${esc(quote.tax_rate)}%)</span>
              <span>${money(quote.tax_total, quote.currency)}</span></div>` : ''}
            <div class="line total"><span>Total</span><span>${money(quote.total, quote.currency)}</span></div>
          </div>

          ${quote.notes ? `<p class="small muted" style="margin-top:14px;white-space:pre-wrap">
            ${esc(quote.notes)}</p>` : ''}
          ${quote.valid_until ? `<p class="faint" style="margin-top:10px">
            Válido hasta el ${date(quote.valid_until)}.</p>` : ''}

          ${!responded && !quote.expired ? `
            ${optionals.length ? `<p class="small muted" style="margin:16px 0 4px">
              Desmarca los trabajos que <span class="strong">no</span> quieras autorizar.</p>` : ''}
            <div style="margin-top:18px">
              <div class="field">
                <label for="f-customer_name">Tu nombre</label>
                <input id="f-customer_name" placeholder="Como confirmación de tu decisión">
              </div>
              <div class="field">
                <label for="f-note">¿Quieres dejarle un mensaje al taller?</label>
                <textarea id="f-note" rows="2" placeholder="Opcional"></textarea>
              </div>
              <button type="button" class="btn btn-primary btn-block" id="btn-approve">
                Autorizar el trabajo</button>
              <button type="button" class="btn btn-danger btn-block" id="btn-reject"
                style="margin-top:8px">Rechazar el presupuesto</button>
              <p class="faint center" style="margin-top:12px">
                Tu respuesta queda registrada con la fecha y la hora.</p>
            </div>` : ''}
        </form>
      </div>
    </div>
    <a class="btn btn-default btn-block" href="#/orden/${esc(quote.public_code)}">
      Ver el estado de mi moto</a>`);
}
