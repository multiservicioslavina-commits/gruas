// Utilidades de interfaz: formato, plantillas y componentes compartidos.
import { session } from './api.js';

// ── Texto seguro ──────────────────────────────────────────────────────
// Todo lo que venga de la base pasa por aquí antes de entrar al HTML.
export const esc = (value) => (value == null ? '' : String(value))
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ── Formato ───────────────────────────────────────────────────────────
export function money(amount, currency) {
  const value = Number(amount) || 0;
  const code = currency || session.workshop?.currency || 'COP';
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: code, maximumFractionDigits: 0
    }).format(value);
  } catch {
    return `$${Math.round(value).toLocaleString('es-CO')}`;
  }
}

export const number = (value) => Number(value || 0).toLocaleString('es-CO');

// Para comparar texto ignorando tildes: quien busca "bujia" espera encontrar
// "Bujía". Sin esto, cualquier buscador en español falla con el uso normal.
export const normalizeSearch = (value) =>
  String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function date(value, withTime = false) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const day = d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  if (!withTime) return day;
  return `${day}, ${d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`;
}

export function time(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

export function since(value) {
  if (!value) return '';
  const days = Math.floor((Date.now() - new Date(value)) / 86400000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'hace un mes' : `hace ${months} meses`;
}

export const forInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
export const forInputTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

// ── Diccionarios ──────────────────────────────────────────────────────
export const ORDER_STATUS = {
  scheduled:        { label: 'Programada',        tag: 'tag-grey' },
  received:         { label: 'Recibida',          tag: 'tag-blue' },
  diagnosing:       { label: 'En diagnóstico',    tag: 'tag-violet' },
  quoted:           { label: 'Cotizada',          tag: 'tag-violet' },
  pending_approval: { label: 'Esperando al cliente', tag: 'tag-amber' },
  approved:         { label: 'Aprobada',          tag: 'tag-accent' },
  repairing:        { label: 'En reparación',     tag: 'tag-amber' },
  waiting_parts:    { label: 'Esperando repuesto', tag: 'tag-red' },
  quality_check:    { label: 'Control de calidad', tag: 'tag-violet' },
  ready:            { label: 'Lista para entregar', tag: 'tag-green' },
  delivered:        { label: 'Entregada',         tag: 'tag-grey' },
  closed:           { label: 'Cerrada',           tag: 'tag-grey' },
  cancelled:        { label: 'Anulada',           tag: 'tag-grey' }
};

export const PAYMENT_STATUS = {
  pending: { label: 'Sin pagar', tag: 'tag-red' },
  partial: { label: 'Abonada',   tag: 'tag-amber' },
  paid:    { label: 'Pagada',    tag: 'tag-green' }
};

export const PAYMENT_METHODS = {
  cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta',
  nequi: 'Nequi', daviplata: 'Daviplata', other: 'Otro'
};

export const APPOINTMENT_STATUS = {
  scheduled: { label: 'Agendada',  tag: 'tag-blue' },
  confirmed: { label: 'Confirmada', tag: 'tag-accent' },
  arrived:   { label: 'Llegó',     tag: 'tag-green' },
  no_show:   { label: 'No llegó',  tag: 'tag-red' },
  cancelled: { label: 'Cancelada', tag: 'tag-grey' },
  done:      { label: 'Atendida',  tag: 'tag-grey' }
};

export const ROLES = {
  admin: 'Administrador', reception: 'Recepción', mechanic: 'Mecánico',
  warehouse: 'Bodega', cashier: 'Caja'
};

export const FUEL_LEVELS = {
  empty: 'Vacío', quarter: '1/4', half: '1/2', three_quarters: '3/4', full: 'Lleno'
};

export const statusTag = (status) => {
  const s = ORDER_STATUS[status] || { label: status, tag: 'tag-grey' };
  return `<span class="tag ${s.tag}">${esc(s.label)}</span>`;
};

export const motorcycleName = (row) =>
  [row?.brand, row?.model, row?.year].filter(Boolean).join(' ') || 'Moto sin datos';

// ── Componentes ───────────────────────────────────────────────────────
export function toast(message, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast show${isError ? ' bad' : ''}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

export const spinner = () => '<div class="spinner"></div>';

export const empty = (message, icon = '📭') =>
  `<div class="empty"><span class="icon">${icon}</span>${esc(message)}</div>`;

export const errorBox = (message) => `<div class="alert alert-error">${esc(message)}</div>`;

// Modal con formulario. Devuelve una promesa que resuelve con los datos o null.
export function modal({ title, body, confirmText = 'Guardar', wide = false, onSubmit }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <form class="modal${wide ? ' wide' : ''}">
        <div class="modal-head">
          <h2>${esc(title)}</h2>
          <button type="button" class="x" data-close aria-label="Cerrar">&times;</button>
        </div>
        <div class="modal-body">
          <div data-error></div>
          ${body}
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-default" data-close>Cancelar</button>
          <button type="submit" class="btn btn-primary">${esc(confirmText)}</button>
        </div>
      </form>`;

    const close = (value) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(value); };
    const onKey = (event) => { if (event.key === 'Escape') close(null); };

    back.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close(null)));
    back.addEventListener('click', (event) => { if (event.target === back) close(null); });
    document.addEventListener('keydown', onKey);

    const form = back.querySelector('form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('[type=submit]');
      const errorSlot = form.querySelector('[data-error]');
      button.disabled = true;
      errorSlot.innerHTML = '';
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        const result = onSubmit ? await onSubmit(data, form) : data;
        if (result === false) { button.disabled = false; return; }
        close(result ?? data);
      } catch (err) {
        errorSlot.innerHTML = errorBox(err.message);
        button.disabled = false;
      }
    });

    document.body.appendChild(back);
    const first = form.querySelector('input:not([type=hidden]), select, textarea');
    if (first) first.focus();
  });
}

export function confirmDialog(message, { confirmText = 'Sí, continuar', title = 'Confirmar' } = {}) {
  return modal({
    title,
    body: `<p style="font-size:.92rem;line-height:1.6">${esc(message)}</p>`,
    confirmText,
    onSubmit: () => ({ confirmed: true })
  }).then((result) => Boolean(result));
}

// Campo de formulario. idPrefix evita ids duplicados cuando el campo se
// pinta dentro de un modal que convive con un formulario de página que ya
// usa el mismo `name` (ej. "name"/"email"/"phone" en Ajustes): sin esto,
// dos elementos con el mismo id="f-..." hacen que <label for> enfoque el
// campo equivocado (el que esté primero en el documento).
export function field(name, label, { type = 'text', value = '', required = false,
                                     placeholder = '', options = null, rows = 0,
                                     step = null, min = null, hint = '', idPrefix = '' } = {}) {
  const id = `f-${idPrefix}${name}`;
  const common = `name="${name}" id="${id}"${required ? ' required' : ''}` +
    `${placeholder ? ` placeholder="${esc(placeholder)}"` : ''}`;
  let control;

  if (options) {
    control = `<select ${common}>${options.map((option) => {
      const [optionValue, optionLabel] = Array.isArray(option) ? option : [option, option];
      return `<option value="${esc(optionValue)}"${String(optionValue) === String(value ?? '') ? ' selected' : ''}>${esc(optionLabel)}</option>`;
    }).join('')}</select>`;
  } else if (rows) {
    control = `<textarea ${common} rows="${rows}">${esc(value)}</textarea>`;
  } else if (type === 'password') {
    control = `<div class="pw-wrap"><input ${common} type="password" value="${esc(value)}">` +
      `<button type="button" class="pw-toggle" tabindex="-1" aria-label="Mostrar contraseña" onclick="` +
      `const i=this.previousElementSibling;const show=i.type==='password';` +
      `i.type=show?'text':'password';this.textContent=show?'🙈':'👁️';` +
      `this.setAttribute('aria-label',show?'Ocultar contraseña':'Mostrar contraseña')">👁️</button></div>`;
  } else {
    control = `<input ${common} type="${type}" value="${esc(value)}"` +
      `${step !== null ? ` step="${step}"` : ''}${min !== null ? ` min="${min}"` : ''}>`;
  }
  return `<div class="field"><label for="${id}">${esc(label)}</label>${control}` +
    `${hint ? `<div class="faint" style="margin-top:4px">${esc(hint)}</div>` : ''}</div>`;
}

// Convierte a número los campos indicados y quita los vacíos.
export function clean(data, numericKeys = []) {
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === '' || value === undefined) continue;
    out[key] = numericKeys.includes(key) ? Number(value) : value;
  }
  return out;
}
