// CRM (plan Premium): embudo de prospectos, bitácora de contacto y
// recordatorios de seguimiento.
import { api } from '../api.js';
import { esc, number, date, since, empty, toast, field, modal, confirmDialog, clean } from '../ui.js';
import { onMount } from '../app.js';

const STAGE_LABEL = {
  new: 'Nuevo', contacted: 'Contactado', interested: 'Interesado',
  quoted: 'Cotizado', won: 'Ganado', lost: 'Perdido'
};
const STAGE_TAG = {
  new: 'tag-grey', contacted: 'tag-grey', interested: 'tag-accent',
  quoted: 'tag-accent', won: 'tag-green', lost: 'tag-red'
};
const STAGE_OPTIONS = Object.entries(STAGE_LABEL);
const CHANNEL_LABEL = { call: 'Llamada', whatsapp: 'WhatsApp', visit: 'Visita', email: 'Correo', other: 'Otro' };

export async function crmView() {
  let leads = [];
  let users = [];

  const userOptions = () => [['', 'Sin asignar'], ...users.map((u) => [u.id, u.name])];

  const leadFields = (lead = {}) => `
    ${field('name', 'Nombre', { required: true, value: lead.name || '' })}
    <div class="row">
      ${field('phone', 'Teléfono', { type: 'tel', value: lead.phone || '' })}
      ${field('email', 'Correo', { type: 'email', value: lead.email || '' })}
    </div>
    <div class="row">
      ${field('source', 'Origen', { value: lead.source || '', placeholder: 'Redes, referido, letrero...' })}
      ${field('stage', 'Etapa', { value: lead.stage || 'new', options: STAGE_OPTIONS })}
    </div>
    ${field('interest', 'Qué está buscando', { rows: 2, value: lead.interest || '' })}
    ${field('assigned_to', 'Asignado a', { value: lead.assigned_to || '', options: userOptions() })}`;

  const load = async () => {
    const target = document.getElementById('crm-body');
    target.innerHTML = '<div class="spinner"></div>';

    const [summary, leadsRes, usersRes, pending] = await Promise.all([
      api.get('/crm/summary'),
      api.get('/crm/leads?limit=300'),
      api.get('/users').then((r) => r.data).catch(() => []),
      api.get('/crm/follow-ups?done=false')
    ]);
    leads = leadsRes.data;
    users = usersRes;

    const maxStage = Math.max(1, ...summary.funnel.map((s) => s.count));
    const bar = (value, max) => `
      <div style="height:6px;background:var(--surface-2);border-radius:4px;overflow:hidden;margin-top:4px">
        <div style="height:100%;width:${max ? (value / max) * 100 : 0}%;background:var(--accent)"></div>
      </div>`;

    target.innerHTML = `
      <div class="stats">
        <div class="stat accent"><div class="v">${number(summary.total)}</div>
          <div class="k">Prospectos</div></div>
        <div class="stat green"><div class="v">${number(summary.funnel.find((s) => s.stage === 'won')?.count || 0)}</div>
          <div class="k">Ganados</div></div>
        <div class="stat red"><div class="v">${number(summary.follow_ups_overdue)}</div>
          <div class="k">Seguimientos vencidos</div></div>
        <div class="stat amber"><div class="v">${number(summary.follow_ups_today)}</div>
          <div class="k">Seguimientos hoy</div></div>
      </div>

      <div class="grid cols-2">
        <div class="card">
          <div class="card-head"><h2>Embudo</h2></div>
          <div class="card-body">
            ${summary.funnel.map((s) => `
              <div style="margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;font-size:.87rem">
                  <span>${esc(STAGE_LABEL[s.stage])}</span>
                  <span class="strong">${number(s.count)}</span>
                </div>
                ${bar(s.count, maxStage)}
              </div>`).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Seguimientos pendientes</h2></div>
          <div class="card-body tight">
            ${pending.data.length ? `<div class="table-wrap"><table>
              <thead><tr><th>Cuándo</th><th>Prospecto</th><th>Nota</th><th></th></tr></thead>
              <tbody>${pending.data.map((f) => `
                <tr${new Date(f.due_at) < new Date() ? ' style="color:var(--red)"' : ''}>
                  <td class="small">${date(f.due_at, true)}</td>
                  <td class="strong">${esc(f.lead_name)}</td>
                  <td class="small muted">${esc(f.note)}</td>
                  <td class="num"><button class="btn btn-quiet btn-sm" data-done-followup="${esc(f.id)}">Hecho</button></td>
                </tr>`).join('')}</tbody>
            </table></div>` : empty('Sin seguimientos pendientes.', '✅')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Prospectos</h2>
          <button class="btn btn-default btn-sm" id="btn-new-lead">Nuevo prospecto</button>
        </div>
        <div class="card-body tight">
          ${leads.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Nombre</th><th>Contacto</th><th>Interés</th><th>Etapa</th>
              <th>Asignado</th><th class="small">Desde</th><th></th></tr></thead>
            <tbody>${leads.map((lead) => `
              <tr>
                <td class="strong">${esc(lead.name)}
                  ${lead.source ? `<div class="faint">${esc(lead.source)}</div>` : ''}</td>
                <td class="small muted">${esc(lead.phone || '')}${lead.phone && lead.email ? '<br>' : ''}${esc(lead.email || '')}</td>
                <td class="small muted">${esc(lead.interest || '—')}</td>
                <td><span class="tag ${STAGE_TAG[lead.stage]}">${esc(STAGE_LABEL[lead.stage])}</span></td>
                <td class="small muted">${esc(users.find((u) => u.id === lead.assigned_to)?.name || '—')}</td>
                <td class="small muted">${since(lead.created_at)}</td>
                <td class="num nowrap">
                  <button class="btn btn-quiet btn-sm" data-contact="${esc(lead.id)}">Contacto</button>
                  <button class="btn btn-quiet btn-sm" data-followup="${esc(lead.id)}">Seguimiento</button>
                  <button class="btn btn-quiet btn-sm" data-edit-lead="${esc(lead.id)}">Editar</button>
                  <button class="btn btn-quiet btn-sm" data-del-lead="${esc(lead.id)}">Borrar</button>
                </td>
              </tr>`).join('')}</tbody>
          </table></div>` : empty('Aún no tienes prospectos registrados.', '🎯')}
        </div>
      </div>`;

    bindEvents();
  };

  const bindEvents = () => {
    document.querySelectorAll('[data-edit-lead]').forEach((button) => {
      button.addEventListener('click', async () => {
        const lead = leads.find((l) => l.id === button.dataset.editLead);
        const result = await modal({
          title: 'Editar prospecto',
          body: leadFields(lead),
          onSubmit: (data) => api.patch(`/crm/leads/${lead.id}`, clean(data))
        });
        if (result) { toast('Prospecto actualizado'); load(); }
      });
    });

    document.querySelectorAll('[data-del-lead]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!(await confirmDialog('Se borra también su historial de contacto y seguimientos.',
          { confirmText: 'Sí, borrarlo', title: 'Borrar prospecto' }))) return;
        await api.delete(`/crm/leads/${button.dataset.delLead}`);
        toast('Prospecto borrado');
        load();
      });
    });

    document.querySelectorAll('[data-contact]').forEach((button) => {
      button.addEventListener('click', async () => {
        const lead = leads.find((l) => l.id === button.dataset.contact);
        const result = await modal({
          title: `Registrar contacto con ${lead.name}`,
          body: field('channel', 'Medio', { value: 'call', options: Object.entries(CHANNEL_LABEL) }) +
                field('note', 'Qué pasó', { rows: 3, required: true,
                  placeholder: 'Le expliqué el servicio, quedó de confirmar mañana...' }),
          confirmText: 'Registrar',
          onSubmit: (data) => api.post(`/crm/leads/${lead.id}/contacts`, data)
        });
        if (result) toast('Contacto registrado');
      });
    });

    document.querySelectorAll('[data-followup]').forEach((button) => {
      button.addEventListener('click', async () => {
        const lead = leads.find((l) => l.id === button.dataset.followup);
        const result = await modal({
          title: `Agendar seguimiento a ${lead.name}`,
          body: field('note', 'Qué hay que hacer', { required: true, placeholder: 'Llamar a confirmar' }) +
                field('due_at', 'Cuándo', { type: 'datetime-local', required: true }) +
                field('assigned_to', 'Asignado a', { value: '', options: userOptions() }),
          confirmText: 'Agendar',
          onSubmit: (data) => api.post(`/crm/leads/${lead.id}/follow-ups`, clean(data))
        });
        if (result) { toast('Seguimiento agendado'); load(); }
      });
    });

    document.querySelectorAll('[data-done-followup]').forEach((button) => {
      button.addEventListener('click', async () => {
        await api.patch(`/crm/follow-ups/${button.dataset.doneFollowup}`, { done: true });
        toast('Seguimiento marcado como hecho');
        load();
      });
    });
  };

  onMount(() => {
    load();
    document.getElementById('btn-new-lead').addEventListener('click', async () => {
      const result = await modal({
        title: 'Nuevo prospecto',
        body: leadFields(),
        onSubmit: (data) => api.post('/crm/leads', clean(data))
      });
      if (result) { toast('Prospecto creado'); load(); }
    });
  });

  return `
    <div class="page-head">
      <div><h1>CRM</h1><p>Prospectos, contacto y seguimiento comercial.</p></div>
    </div>
    <div id="crm-body"></div>`;
}
