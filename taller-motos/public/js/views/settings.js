// Ajustes: datos del taller, equipo, catálogo de servicios y llaves de API.
import { api, session } from '../api.js';
import {
  esc, money, number, date, empty, toast, field, modal, confirmDialog, clean, ROLES
} from '../ui.js';
import { onMount, refresh } from '../app.js';

const PLAN_LABEL = { basico: 'Básico', completo: 'Completo', premium: 'Premium' };

export async function settingsView() {
  const isAdmin = session.role === 'admin';
  const [workshop, users, services, keys] = await Promise.all([
    api.get('/workshop'),
    api.get('/users').then((r) => r.data).catch(() => []),
    api.get('/services?limit=300').then((r) => r.data).catch(() => []),
    isAdmin ? api.get('/api-keys').then((r) => r.data).catch(() => []) : Promise.resolve([])
  ]);

  // idPrefix 'user-': este modal convive con el formulario "Datos del
  // taller", que ya usa los mismos nombres de campo (name, email, phone).
  // Sin un prefijo distinto, ambos generarían el mismo id="f-name" y
  // <label for> terminaría enfocando el campo equivocado.
  const userFields = (user = {}, isNew = false) =>
    field('name', 'Nombre', { required: true, value: user.name || '', idPrefix: 'user-' }) +
    (isNew ? field('email', 'Correo', { type: 'email', required: true, idPrefix: 'user-' }) : '') +
    (isNew ? field('password', 'Contraseña', { type: 'password', required: true,
      hint: 'Mínimo 8 caracteres', idPrefix: 'user-' })
           : field('password', 'Nueva contraseña', { type: 'password',
             hint: 'Déjalo vacío para no cambiarla', idPrefix: 'user-' })) +
    `<div class="row">
       ${field('role', 'Rol', { value: user.role || 'reception',
          options: Object.entries(ROLES), idPrefix: 'user-' })}
       ${field('phone', 'Teléfono', { type: 'tel', value: user.phone || '', idPrefix: 'user-' })}
     </div>` +
    field('specialty', 'Especialidad (mecánicos)', { value: user.specialty || '', idPrefix: 'user-' });

  onMount(() => {
    // Logo del taller.
    document.getElementById('btn-logo')?.addEventListener('click', () =>
      document.getElementById('logo-input').click());
    document.getElementById('logo-input')?.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const datos = new FormData();
      datos.append('logo', file);
      try {
        const updated = await api.upload('/workshop/logo', datos);
        session.workshop = updated;
        toast('Logo actualizado');
        refresh();
      } catch (err) { toast(err.message, true); }
    });

    // Datos del taller.
    document.getElementById('workshop-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.target.querySelector('[type=submit]');
      button.disabled = true;
      try {
        const raw = Object.fromEntries(new FormData(event.target).entries());
        const updated = await api.patch('/workshop', clean(raw, ['tax_rate']));
        session.workshop = updated;
        toast('Datos del taller actualizados');
        refresh();
      } catch (err) { toast(err.message, true); button.disabled = false; }
    });

    // Notificaciones por WhatsApp.
    const whatsappForm = document.getElementById('whatsapp-form');
    whatsappForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.target.querySelector('[type=submit]');
      button.disabled = true;
      try {
        const raw = Object.fromEntries(new FormData(event.target).entries());
        const updated = await api.patch('/workshop', clean(raw));
        session.workshop = updated;
        toast('Configuración de WhatsApp guardada');
        refresh();
      } catch (err) { toast(err.message, true); button.disabled = false; }
    });
    const whatsappMode = document.getElementById('f-whatsapp_mode');
    const whatsappOwnFields = document.getElementById('whatsapp-own-fields');
    const toggleWhatsappOwn = () => {
      if (whatsappOwnFields) whatsappOwnFields.hidden = whatsappMode?.value !== 'own';
    };
    whatsappMode?.addEventListener('change', toggleWhatsappOwn);
    toggleWhatsappOwn();

    // Facturación electrónica (Factus).
    document.getElementById('factus-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.target.querySelector('[type=submit]');
      button.disabled = true;
      try {
        const raw = Object.fromEntries(new FormData(event.target).entries());
        const updated = await api.patch('/workshop', clean(raw));
        session.workshop = updated;
        toast('Credenciales de Factus guardadas');
        refresh();
      } catch (err) { toast(err.message, true); button.disabled = false; }
    });

    document.getElementById('btn-factus-range')?.addEventListener('click', async () => {
      let ranges;
      try {
        ranges = await api.get('/workshop/factus/numbering-ranges');
      } catch (err) { toast(err.message, true); return; }
      if (!ranges.length) { toast('Factus no devolvió ningún rango de numeración activo', true); return; }

      const result = await modal({
        title: 'Rango de numeración',
        body: field('factus_numbering_range_id', 'Rango', {
          value: workshop.factus_numbering_range_id || '',
          options: ranges.map((r) => [r.id,
            `${r.prefix || ''} · resolución ${r.resolution_number} (${r.from}-${r.to})`])
        }),
        confirmText: 'Guardar',
        onSubmit: (data) => api.patch('/workshop', { factus_numbering_range_id: Number(data.factus_numbering_range_id) })
      });
      if (result) { toast('Rango de numeración guardado'); refresh(); }
    });

    // Plan y licencia.
    document.getElementById('btn-change-plan')?.addEventListener('click', async () => {
      const result = await modal({
        title: 'Cambiar de plan',
        body: `<p class="small muted" style="margin-bottom:14px">
                 Escribe el código de activación que te dieron (corto, tipo
                 TM-XXXX-XXXX, o el largo). Reemplaza el plan y la vigencia
                 actuales de tu taller.</p>` +
              field('license_code', 'Código de activación', { required: true,
                placeholder: 'TM-XXXX-XXXX' }),
        confirmText: 'Activar',
        onSubmit: (data) => api.post('/workshop/license', data)
      });
      if (result) {
        session.workshop = result;
        toast(`Plan actualizado a ${PLAN_LABEL[result.license_plan] || result.license_plan}`);
        refresh();
      }
    });

    // Cambio de mi contraseña.
    document.getElementById('password-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.target;
      const button = form.querySelector('[type=submit]');
      button.disabled = true;
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        await api.post('/auth/change-password', data);
        form.reset();
        toast('Contraseña actualizada');
      } catch (err) { toast(err.message, true); }
      button.disabled = false;
    });

    // Equipo.
    document.getElementById('btn-new-user')?.addEventListener('click', async () => {
      const result = await modal({
        title: 'Nuevo usuario',
        body: userFields({}, true),
        onSubmit: (data) => api.post('/users', clean(data))
      });
      if (result) { toast('Usuario creado'); refresh(); }
    });

    document.querySelectorAll('[data-user]').forEach((button) => {
      button.addEventListener('click', async () => {
        const user = users.find((u) => u.id === button.dataset.user);
        const result = await modal({
          title: `Editar a ${user.name}`,
          body: userFields(user),
          onSubmit: (data) => api.patch(`/users/${user.id}`, clean(data))
        });
        if (result) { toast('Usuario actualizado'); refresh(); }
      });
    });

    document.querySelectorAll('[data-reset-pw]').forEach((button) => {
      button.addEventListener('click', async () => {
        const result = await modal({
          title: `Nueva contraseña para ${button.dataset.resetName}`,
          body: field('password', 'Nueva contraseña', { type: 'password', required: true,
            hint: 'Mínimo 8 caracteres. Dásela al usuario para que entre.' }),
          confirmText: 'Restablecer',
          onSubmit: (data) => api.patch(`/users/${button.dataset.resetPw}`, { password: data.password })
        });
        if (result) toast('Contraseña restablecida');
      });
    });

    document.querySelectorAll('[data-toggle-user]').forEach((button) => {
      button.addEventListener('click', async () => {
        const user = users.find((u) => u.id === button.dataset.toggleUser);
        try {
          await api.patch(`/users/${user.id}`, { active: !user.active });
          toast(user.active ? 'Usuario desactivado' : 'Usuario activado');
          refresh();
        } catch (err) { toast(err.message, true); }
      });
    });

    // Catálogo de servicios.
    document.getElementById('btn-new-service').addEventListener('click', async () => {
      const result = await modal({
        title: 'Nuevo servicio',
        // idPrefix 'svc-': "Nombre" también existe en el formulario "Datos
        // del taller" de esta misma página; sin prefijo compartirían id.
        body: field('name', 'Nombre', { required: true, placeholder: 'Mantenimiento básico', idPrefix: 'svc-' }) +
              `<div class="row">
                 ${field('code', 'Código')}
                 ${field('price', 'Precio', { type: 'number', value: '0', min: 0 })}
               </div>` +
              field('estimated_minutes', 'Duración estimada (minutos)', { type: 'number', min: 0 }) +
              field('description', 'Descripción', { rows: 2 }),
        onSubmit: (data) => api.post('/services', clean(data, ['price', 'estimated_minutes']))
      });
      if (result) { toast('Servicio agregado'); refresh(); }
    });

    document.querySelectorAll('[data-service]').forEach((button) => {
      button.addEventListener('click', async () => {
        const service = services.find((s) => s.id === button.dataset.service);
        const result = await modal({
          title: 'Editar servicio',
          body: field('name', 'Nombre', { required: true, value: service.name, idPrefix: 'svc-' }) +
                `<div class="row">
                   ${field('code', 'Código', { value: service.code || '' })}
                   ${field('price', 'Precio', { type: 'number', value: service.price, min: 0 })}
                 </div>` +
                field('estimated_minutes', 'Duración estimada (minutos)',
                  { type: 'number', value: service.estimated_minutes || '', min: 0 }) +
                field('description', 'Descripción', { rows: 2, value: service.description || '' }),
          onSubmit: (data) => api.patch(`/services/${service.id}`,
            clean(data, ['price', 'estimated_minutes']))
        });
        if (result) { toast('Servicio actualizado'); refresh(); }
      });
    });

    // Descarga de los datos. Se pide con el token y se guarda en el equipo.
    document.querySelectorAll('[data-bajar]').forEach((button) => {
      button.addEventListener('click', async () => {
        const original = button.textContent;
        button.disabled = true;
        button.textContent = 'Preparando…';
        try {
          const respuesta = await fetch(`/api/export/${button.dataset.bajar}`, {
            headers: { Authorization: `Bearer ${session.token}` }
          });
          if (!respuesta.ok) {
            const detalle = await respuesta.json().catch(() => ({}));
            throw new Error(detalle.error || 'No se pudo preparar la descarga');
          }

          // El nombre del archivo lo manda el servidor.
          const cabecera = respuesta.headers.get('Content-Disposition') || '';
          const nombre = (cabecera.match(/filename="([^"]+)"/) || [])[1] || 'taller.json';

          const blob = await respuesta.blob();
          const url = URL.createObjectURL(blob);
          const enlace = document.createElement('a');
          enlace.href = url;
          enlace.download = nombre;
          document.body.appendChild(enlace);
          enlace.click();
          enlace.remove();
          URL.revokeObjectURL(url);
          toast('Descargado: ' + nombre);
        } catch (err) {
          toast(err.message, true);
        }
        button.disabled = false;
        button.textContent = original;
      });
    });

    // Llaves de API.
    document.getElementById('btn-new-key')?.addEventListener('click', async () => {
      const created = await modal({
        title: 'Nueva llave de API',
        body: `<p class="small muted" style="margin-bottom:14px">
                 Sirve para que otra plataforma consulte el estado de una moto o agende
                 una cita en tu taller. El secreto se muestra una sola vez.</p>` +
              field('name', 'Nombre', { required: true, placeholder: '¿Para qué la vas a usar?', idPrefix: 'key-' }) +
              field('scopes', 'Permisos', { idPrefix: 'key-', options: [
                ['read', 'Sólo consultar'],
                ['read,write', 'Consultar y agendar']] }),
        confirmText: 'Crear llave',
        onSubmit: (data) => api.post('/api-keys',
          { name: data.name, scopes: String(data.scopes).split(',') })
      });

      if (created) {
        await modal({
          title: 'Guarda esta llave ahora',
          body: `<div class="alert alert-warn">No la volveremos a mostrar. Si la pierdes,
                   borra esta y crea otra.</div>
                 <div class="mono small" style="background:var(--surface-2);border:1px solid var(--border);
                      border-radius:8px;padding:14px;word-break:break-all">${esc(created.key)}</div>`,
          confirmText: 'Ya la guardé'
        });
        refresh();
      }
    });

    document.querySelectorAll('[data-delete-key]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!(await confirmDialog(
          'Cualquier sistema que la esté usando dejará de funcionar de inmediato.',
          { confirmText: 'Sí, borrarla', title: 'Borrar llave de API' }))) return;
        await api.delete(`/api-keys/${button.dataset.deleteKey}`);
        toast('Llave eliminada');
        refresh();
      });
    });
  });

  return `
    <div class="page-head">
      <div><h1>Ajustes</h1><p>Datos del taller, equipo, catálogo e integraciones.</p></div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="card-head"><h2>Datos del taller</h2></div>
        <div class="card-body">
          ${isAdmin ? `
            <div class="row" style="align-items:center;margin-bottom:14px">
              <img id="logo-preview" src="${workshop.logo_url ? `/api/public/workshop/${esc(workshop.id)}/logo?v=${Date.now()}` : ''}"
                   alt="Logo del taller"
                   style="width:64px;height:64px;object-fit:contain;border-radius:8px;
                          border:1px solid var(--border);background:#fff;${workshop.logo_url ? '' : 'display:none'}">
              <div>
                <button type="button" class="btn btn-default btn-sm" id="btn-logo">
                  ${workshop.logo_url ? 'Cambiar logo' : 'Subir logo'}</button>
                <input type="file" id="logo-input" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
                <p class="faint" style="margin-top:4px">Aparece en la factura de venta impresa. Máx. 2MB.</p>
              </div>
            </div>
            <form id="workshop-form">
            ${field('name', 'Nombre', { required: true, value: workshop.name })}
            <div class="row">
              ${field('legal_name', 'Razón social', { value: workshop.legal_name || '' })}
              ${field('tax_id', 'NIT', { value: workshop.tax_id || '' })}
            </div>
            <div class="row">
              ${field('phone', 'Teléfono', { type: 'tel', value: workshop.phone || '' })}
              ${field('email', 'Correo', { type: 'email', value: workshop.email || '' })}
            </div>
            ${field('address', 'Dirección', { value: workshop.address || '' })}
            <div class="row-3">
              ${field('city', 'Ciudad', { value: workshop.city || '' })}
              ${field('currency', 'Moneda', { value: workshop.currency || 'COP' })}
              ${field('tax_rate', 'IVA (%)', { type: 'number', value: workshop.tax_rate, min: 0, step: '0.01' })}
            </div>
            <button type="submit" class="btn btn-primary btn-sm">Guardar</button>
          </form>` : `
            <div class="kv"><span class="k">Taller</span><span class="v">${esc(workshop.name)}</span></div>
            <div class="kv"><span class="k">Ciudad</span><span class="v">${esc(workshop.city || '—')}</span></div>
            <div class="kv"><span class="k">IVA</span><span class="v">${esc(workshop.tax_rate)}%</span></div>
            <p class="faint" style="margin-top:12px">Sólo el administrador puede cambiar estos datos.</p>`}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Mi cuenta</h2></div>
        <div class="card-body">
          <div class="kv"><span class="k">Nombre</span><span class="v">${esc(session.user?.name)}</span></div>
          <div class="kv"><span class="k">Correo</span><span class="v">${esc(session.user?.email)}</span></div>
          <div class="kv"><span class="k">Rol</span>
            <span class="v">${esc(ROLES[session.role] || session.role)}</span></div>
          <form id="password-form" style="margin-top:16px">
            <div class="row">
              ${field('current_password', 'Contraseña actual', { type: 'password', required: true })}
              ${field('new_password', 'Nueva contraseña', { type: 'password', required: true })}
            </div>
            <button type="submit" class="btn btn-default btn-sm">Cambiar contraseña</button>
          </form>
        </div>
      </div>
    </div>

    ${isAdmin ? `
    <div class="card">
      <div class="card-head"><h2>Plan y licencia</h2></div>
      <div class="card-body">
        <div class="kv"><span class="k">Plan actual</span>
          <span class="v">${esc(PLAN_LABEL[workshop.license_plan] || 'Sin plan asignado')}</span></div>
        ${workshop.license_holder ? `<div class="kv"><span class="k">Titular</span>
          <span class="v">${esc(workshop.license_holder)}</span></div>` : ''}
        ${workshop.license_expires_at ? `<div class="kv"><span class="k">Vence</span>
          <span class="v">${date(workshop.license_expires_at)}</span></div>` : ''}
        <button class="btn btn-default btn-sm" id="btn-change-plan" style="margin-top:8px">Cambiar plan</button>
      </div>
    </div>` : ''}

    <div class="card">
      <div class="card-head">
        <h2>Equipo</h2>
        ${isAdmin ? '<button class="btn btn-default btn-sm" id="btn-new-user">Nuevo usuario</button>' : ''}
      </div>
      <div class="card-body tight">
        ${users.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Último acceso</th><th></th></tr></thead>
          <tbody>${users.map((user) => `
            <tr${user.active ? '' : ' style="opacity:.5"'}>
              <td class="strong">${esc(user.name)}
                ${user.specialty ? `<div class="faint">${esc(user.specialty)}</div>` : ''}</td>
              <td class="small muted">${esc(user.email)}</td>
              <td><span class="tag ${user.role === 'admin' ? 'tag-accent' : 'tag-grey'}">
                ${esc(ROLES[user.role] || user.role)}</span></td>
              <td class="small muted">${user.last_login_at ? date(user.last_login_at) : 'Nunca'}</td>
              <td class="num nowrap">
                ${isAdmin ? `
                  <button class="btn btn-quiet btn-sm" data-user="${esc(user.id)}">Editar</button>
                  ${user.id !== session.user?.id ? `<button class="btn btn-quiet btn-sm"
                    data-reset-pw="${esc(user.id)}" data-reset-name="${esc(user.name)}">Contraseña</button>` : ''}
                  ${user.id !== session.user?.id ? `<button class="btn btn-quiet btn-sm"
                    data-toggle-user="${esc(user.id)}">${user.active ? 'Desactivar' : 'Activar'}</button>` : ''}
                ` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table></div>` : empty('Sin usuarios.', '👥')}
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Catálogo de servicios</h2>
        <button class="btn btn-default btn-sm" id="btn-new-service">Nuevo servicio</button>
      </div>
      <div class="card-body tight">
        ${services.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Servicio</th><th>Código</th><th class="num">Duración</th>
            <th class="num">Precio</th><th></th></tr></thead>
          <tbody>${services.map((service) => `
            <tr>
              <td class="strong">${esc(service.name)}
                ${service.description ? `<div class="faint">${esc(service.description)}</div>` : ''}</td>
              <td class="small muted">${esc(service.code || '—')}</td>
              <td class="num small muted">${service.estimated_minutes
                ? `${number(service.estimated_minutes)} min` : '—'}</td>
              <td class="num strong">${money(service.price)}</td>
              <td class="num"><button class="btn btn-quiet btn-sm"
                data-service="${esc(service.id)}">Editar</button></td>
            </tr>`).join('')}</tbody>
        </table></div>` : empty('Arma tu lista de trabajos con sus precios: agiliza cargar las órdenes.', '🔧')}
      </div>
    </div>

    ${isAdmin ? `
    <div class="card">
      <div class="card-head"><h2>Notificaciones por WhatsApp</h2></div>
      <div class="card-body">
        <p class="small muted" style="margin-bottom:14px">
          Avisa a tus clientes por WhatsApp cuando reciben su moto, cuando hay
          una cotización pendiente y cuando ya está lista para recoger.</p>
        <form id="whatsapp-form">
          ${field('whatsapp_mode', 'Modo de envío', {
            value: workshop.whatsapp_mode || 'off',
            options: [
              ['off', 'Desactivado'],
              ['ridera', 'Usar la cuenta de Ridera'],
              ['own', 'Usar mi propia cuenta de WhatsApp Business']
            ]
          })}
          <div id="whatsapp-own-fields">
            ${field('whatsapp_phone_number_id', 'Phone Number ID',
              { value: workshop.whatsapp_phone_number_id || '' })}
            ${field('whatsapp_access_token', 'Token de acceso', { type: 'password',
              hint: workshop.whatsapp_configured
                ? 'Ya tienes uno guardado. Déjalo vacío para conservarlo.'
                : 'Se genera como Usuario del sistema en Meta Business Suite.' })}
          </div>
          <button type="submit" class="btn btn-primary btn-sm">Guardar</button>
        </form>
      </div>
    </div>

    ${workshop.license_plan === 'premium' ? `
    <div class="card">
      <div class="card-head"><h2>Facturación electrónica (DIAN)</h2></div>
      <div class="card-body">
        <p class="small muted" style="margin-bottom:14px">
          Se factura con <a href="https://developers.factus.com.co/" target="_blank" rel="noopener">Factus</a>,
          proveedor autorizado por la DIAN. Necesitas una cuenta con ellos:
          RUT con responsabilidad de facturación electrónica, certificado
          digital y resolución de numeración vigente.</p>
        <form id="factus-form">
          ${field('factus_environment', 'Ambiente', {
            value: workshop.factus_environment || 'sandbox',
            options: [['sandbox', 'Pruebas (sandbox)'], ['production', 'Producción']],
            hint: 'Prueba primero en sandbox: no genera documentos válidos ante la DIAN.' })}
          <div class="row">
            ${field('factus_client_id', 'Client ID', { value: workshop.factus_client_id || '' })}
            ${field('factus_client_secret', 'Client Secret', { type: 'password',
              hint: workshop.factus_configured ? 'Ya tienes uno guardado. Déjalo vacío para conservarlo.' : '' })}
          </div>
          <div class="row">
            ${field('factus_username', 'Usuario', { value: workshop.factus_username || '' })}
            ${field('factus_password', 'Contraseña', { type: 'password',
              hint: workshop.factus_configured ? 'Déjala vacía para conservarla.' : '' })}
          </div>
          <button type="submit" class="btn btn-primary btn-sm">Guardar</button>
        </form>
        <div class="kv" style="margin-top:16px">
          <span class="k">Rango de numeración</span>
          <span class="v">${workshop.factus_numbering_range_id
            ? `#${esc(workshop.factus_numbering_range_id)}` : 'Sin elegir'}</span>
        </div>
        <button class="btn btn-default btn-sm" id="btn-factus-range" style="margin-top:8px">
          ${workshop.factus_numbering_range_id ? 'Cambiar rango' : 'Elegir rango de numeración'}</button>
      </div>
    </div>` : ''}

    <div class="card">
      <div class="card-head"><h2>Tus datos</h2></div>
      <div class="card-body">
        <p class="small muted" style="margin-bottom:14px">
          Toda la información de tu taller es tuya y te la puedes llevar cuando
          quieras, sin pedirle permiso a nadie. Descárgala cada tanto y guárdala
          en tu computador.</p>

        <div class="btn-group">
          <button class="btn btn-primary btn-sm" data-bajar="">Descargar todo (JSON)</button>
          <button class="btn btn-default btn-sm" data-bajar="clientes.csv">Clientes</button>
          <button class="btn btn-default btn-sm" data-bajar="motos.csv">Motos</button>
          <button class="btn btn-default btn-sm" data-bajar="ordenes.csv">Órdenes</button>
          <button class="btn btn-default btn-sm" data-bajar="inventario.csv">Inventario</button>
          <button class="btn btn-default btn-sm" data-bajar="pagos.csv">Pagos</button>
          <button class="btn btn-default btn-sm" data-bajar="contabilidad.csv">Contabilidad</button>
          <button class="btn btn-default btn-sm" data-bajar="prospectos.csv">Prospectos</button>
        </div>

        <p class="faint" style="margin-top:12px">
          El archivo JSON lleva absolutamente todo, incluidas las órdenes con sus
          repuestos, diagnósticos y pagos. Los CSV se abren en Excel.</p>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Integraciones (API)</h2>
        <button class="btn btn-default btn-sm" id="btn-new-key">Nueva llave</button>
      </div>
      <div class="card-body tight">
        ${keys.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Nombre</th><th>Prefijo</th><th>Permisos</th>
            <th>Último uso</th><th></th></tr></thead>
          <tbody>${keys.map((key) => `
            <tr>
              <td class="strong">${esc(key.name)}
                <div class="faint">Creada ${date(key.created_at)}</div></td>
              <td class="mono small">tm_${esc(key.prefix)}…</td>
              <td>${(key.scopes || []).map((scope) =>
                `<span class="tag tag-grey">${esc(scope)}</span>`).join(' ')}</td>
              <td class="small muted">${key.last_used_at ? date(key.last_used_at, true) : 'Nunca'}</td>
              <td class="num"><button class="btn btn-quiet btn-sm"
                data-delete-key="${esc(key.id)}">Borrar</button></td>
            </tr>`).join('')}</tbody>
        </table></div>` : `
          <div class="card-body">
            <p class="small muted">Todavía no tienes integraciones. Una llave de API permite que
              otra plataforma consulte el estado de una moto, lea el historial por placa o agende
              una cita en tu taller. La documentación está en <span class="mono">docs/API.md</span>.</p>
          </div>`}
      </div>
    </div>` : ''}`;
}
