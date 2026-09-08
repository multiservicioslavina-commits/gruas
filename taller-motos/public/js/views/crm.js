// CRM (plan Premium): embudo de prospectos, bitácora de contacto y
// recordatorios de seguimiento.
import { api } from '../api.js';
import { esc, number, date, since, empty, toast, field, modal, confirmDialog, clean } from '../ui.js';
import { onMount } from '../app.js';

const STAGE_LABEL = {
  new: 'Nuevo', contacted: 'Contactado', interested: 'Interesado',
  quoted: 'Cotizado', won: 'Ganado', lost: 'Perdido'
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
          ${leads.length ? kanbanHtml() : empty('Aún no tienes prospectos registrados.', '🎯')}
        </div>
      </div>`;

    bindEvents();
  };

  // Tablero kanban: un prospecto es una tarjeta que se arrastra entre
  // columnas de etapa, como en cualquier CRM de verdad (Odoo, Pipedrive,
  // HubSpot...). Una tabla con la etapa en una celda de texto no comunica
  // "embudo de ventas" del mismo modo.
  const cardHtml = (lead) => `
    <div class="kanban-card" draggable="true" data-lead-card="${esc(lead.id)}">
      <div class="kc-name">${esc(lead.name)}</div>
      ${lead.source ? `<div class="kc-source">${esc(lead.source)}</div>` : ''}
      ${lead.interest ? `<div class="kc-interest">${esc(lead.interest)}</div>` : ''}
      <div class="kc-meta">
        <span>${esc(users.find((u) => u.id === lead.assigned_to)?.name || 'Sin asignar')}</span>
        <span>${since(lead.created_at)}</span>
      </div>
      <div class="kc-actions">
        <button type="button" data-contact="${esc(lead.id)}">Contacto</button>
        <button type="button" data-followup="${esc(lead.id)}">Seguimiento</button>
        <button type="button" data-edit-lead="${esc(lead.id)}">Editar</button>
        <button type="button" data-del-lead="${esc(lead.id)}">Borrar</button>
      </div>
    </div>`;

  const kanbanHtml = () => `
    <div class="kanban-board">
      ${STAGE_OPTIONS.map(([stage, label]) => {
        const stageLeads = leads.filter((lead) => lead.stage === stage);
        return `
        <div class="kanban-col" data-stage-col="${stage}">
          <div class="kanban-col-head">
            <span class="kanban-col-title">${esc(label)}</span>
            <span class="kanban-col-count">${stageLeads.length}</span>
          </div>
          <div class="kanban-cards">
            ${stageLeads.length ? stageLeads.map(cardHtml).join('')
              : '<div class="kanban-empty">Sin prospectos</div>'}
          </div>
        </div>`;
      }).join('')}
    </div>`;

  const bindDragDrop = () => {
    document.querySelectorAll('.kanban-card').forEach((card) => {
      card.addEventListener('dragstart', (event) => {
        card.classList.add('dragging');
        event.dataTransfer.setData('text/plain', card.dataset.leadCard);
        event.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });

    document.querySelectorAll('.kanban-col').forEach((col) => {
      col.addEventListener('dragover', (event) => {
        event.preventDefault();
        col.classList.add('drag-over');
      });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', async (event) => {
        event.preventDefault();
        col.classList.remove('drag-over');
        const leadId = event.dataTransfer.getData('text/plain');
        const newStage = col.dataset.stageCol;
        const lead = leads.find((l) => l.id === leadId);
        if (!lead || lead.stage === newStage) return;
        try {
          await api.patch(`/crm/leads/${leadId}`, { stage: newStage });
          toast(`"${lead.name}" movido a ${STAGE_LABEL[newStage]}`);
          load();
        } catch (err) { toast(err.message, true); }
      });
    });
  };

  const bindEvents = () => {
    bindDragDrop();
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

  onMount(async () => {
    // Se espera a que cargue: "Nuevo prospecto" vive dentro del contenido
    // que arma load(), no en la plantilla estática.
    await load();
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
