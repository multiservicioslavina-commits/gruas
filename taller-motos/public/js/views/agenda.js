// Agenda de citas.
import { api } from '../api.js';
import {
  esc, number, date, time, empty, toast, field, modal, clean,
  APPOINTMENT_STATUS, forInputTime
} from '../ui.js';
import { onMount, go } from '../app.js';

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, days) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export async function agendaView() {
  const state = { from: todayISO(), to: addDays(todayISO(), 6) };
  const [customers, motorcycles] = await Promise.all([
    api.get('/customers?limit=300').then((r) => r.data).catch(() => []),
    api.get('/motorcycles?limit=300').then((r) => r.data).catch(() => [])
  ]);

  const appointmentFields = (appointment = {}) =>
    field('scheduled_at', 'Fecha y hora', { type: 'datetime-local', required: true,
      value: forInputTime(appointment.scheduled_at) }) +
    `<div class="row">
       ${field('customer_id', 'Cliente', { value: appointment.customer_id || '',
          options: [['', 'Sin cliente'], ...customers.map((c) => [c.id, c.name])] })}
       ${field('motorcycle_id', 'Moto', { value: appointment.motorcycle_id || '',
          options: [['', 'Sin moto'], ...motorcycles.map((m) =>
            [m.id, `${m.plate} · ${[m.brand, m.model].filter(Boolean).join(' ')}`])] })}
     </div>` +
    field('reason', 'Motivo', { value: appointment.reason || '',
      placeholder: 'Mantenimiento de 10.000 km' }) +
    `<div class="row">
       ${field('duration_minutes', 'Duración (minutos)', { type: 'number',
          value: appointment.duration_minutes || 60, min: 5 })}
       ${field('status', 'Estado', { value: appointment.status || 'scheduled',
          options: Object.entries(APPOINTMENT_STATUS).map(([k, v]) => [k, v.label]) })}
     </div>` +
    field('notes', 'Notas', { rows: 2, value: appointment.notes || '' });

  const load = async () => {
    const target = document.getElementById('agenda-body');
    target.innerHTML = '<div class="spinner"></div>';
    const { data } = await api.get(`/appointments/calendar/range?from=${state.from}&to=${state.to}`);

    document.getElementById('agenda-count').textContent =
      data.length === 1 ? '1 cita' : `${number(data.length)} citas`;

    if (!data.length) {
      target.innerHTML = empty('No hay citas en este rango de fechas.', '📅');
      return;
    }

    // Agrupadas por día, que es como el taller mira su semana.
    const byDay = new Map();
    for (const appointment of data) {
      const key = new Date(appointment.scheduled_at).toISOString().slice(0, 10);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(appointment);
    }

    target.innerHTML = [...byDay.entries()].map(([day, items]) => `
      <div style="padding:12px 16px;background:var(--surface-2);border-bottom:1px solid var(--border)">
        <span class="strong small">${esc(new Date(`${day}T12:00:00`).toLocaleDateString('es-CO',
          { weekday: 'long', day: 'numeric', month: 'long' }))}</span>
        <span class="faint"> · ${items.length} ${items.length === 1 ? 'cita' : 'citas'}</span>
      </div>
      ${items.map((appointment) => `
        <div class="list-item" data-edit="${esc(appointment.id)}">
          <div style="min-width:58px" class="strong">${esc(time(appointment.scheduled_at))}</div>
          <div class="grow">
            <div class="t">${esc(appointment.customer_name || 'Sin cliente')}
              ${appointment.plate ? `<span class="plate">${esc(appointment.plate)}</span>` : ''}</div>
            <div class="s">${esc(appointment.reason || 'Sin motivo')}
              ${appointment.customer_phone ? ` · ${esc(appointment.customer_phone)}` : ''}</div>
          </div>
          <div class="right nowrap">
            <span class="tag ${(APPOINTMENT_STATUS[appointment.status] || {}).tag || 'tag-grey'}">
              ${esc((APPOINTMENT_STATUS[appointment.status] || {}).label || appointment.status)}</span>
            ${['scheduled', 'confirmed', 'arrived'].includes(appointment.status)
              ? `<div style="margin-top:6px"><button class="btn btn-primary btn-sm"
                   data-receive="${esc(appointment.id)}">Recibir moto</button></div>` : ''}
          </div>
        </div>`).join('')}`).join('');

    document.querySelectorAll('[data-receive]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        go('/ordenes/nueva');
      });
    });

    document.querySelectorAll('[data-edit]').forEach((row) => {
      row.addEventListener('click', async () => {
        const appointment = data.find((a) => a.id === row.dataset.edit);
        const result = await modal({
          title: 'Editar cita',
          body: appointmentFields(appointment),
          onSubmit: (payload) => api.patch(`/appointments/${appointment.id}`,
            clean(payload, ['duration_minutes']))
        });
        if (result) { toast('Cita actualizada'); load(); }
      });
    });
  };

  onMount(() => {
    load();
    for (const id of ['agenda-from', 'agenda-to']) {
      document.getElementById(id).addEventListener('change', (event) => {
        state[id === 'agenda-from' ? 'from' : 'to'] = event.target.value;
        load();
      });
    }
    document.getElementById('btn-today').addEventListener('click', () => {
      state.from = todayISO();
      state.to = todayISO();
      document.getElementById('agenda-from').value = state.from;
      document.getElementById('agenda-to').value = state.to;
      load();
    });
    document.getElementById('btn-new-appointment').addEventListener('click', async () => {
      const result = await modal({
        title: 'Nueva cita',
        body: appointmentFields(),
        onSubmit: (data) => api.post('/appointments', clean(data, ['duration_minutes']))
      });
      if (result) { toast('Cita agendada'); load(); }
    });
  });

  return `
    <div class="page-head">
      <div><h1>Agenda</h1><p id="agenda-count">Cargando…</p></div>
      <button class="btn btn-primary" id="btn-new-appointment">Nueva cita</button>
    </div>
    <div class="toolbar">
      <div class="field" style="margin:0"><label>Desde</label>
        <input type="date" id="agenda-from" value="${state.from}"></div>
      <div class="field" style="margin:0"><label>Hasta</label>
        <input type="date" id="agenda-to" value="${state.to}"></div>
      <button class="btn btn-default" id="btn-today" style="align-self:flex-end">Sólo hoy</button>
    </div>
    <div class="card"><div class="card-body tight" id="agenda-body"></div></div>`;
}
