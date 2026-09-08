// Órdenes de trabajo: listado, recepción de la moto y ficha completa.
import { api, session } from '../api.js';
import {
  esc, money, number, date, since, statusTag, empty, toast, field, modal,
  confirmDialog, motorcycleName, ORDER_STATUS, PAYMENT_STATUS, PAYMENT_METHODS,
  FUEL_LEVELS, clean, forInput, normalizeSearch
} from '../ui.js';
import { onMount, refresh, go } from '../app.js';

const FILTERS = [
  ['open', 'En el taller'], ['received', 'Recibidas'], ['diagnosing', 'En diagnóstico'],
  ['pending_approval', 'Esperando cliente'], ['repairing', 'En reparación'],
  ['waiting_parts', 'Esperando repuestos'], ['ready', 'Listas'],
  ['delivered', 'Entregadas'], ['unpaid', 'Con saldo'], ['all', 'Todas']
];

// ── Listado ───────────────────────────────────────────────────────────
export async function ordersView() {
  const state = { filter: sessionStorage.getItem('orders_filter') || 'open', search: '' };

  const load = async () => {
    const params = new URLSearchParams();
    if (state.filter === 'open') params.set('open', 'true');
    else if (state.filter === 'unpaid') params.set('unpaid', 'true');
    else if (state.filter !== 'all') params.set('status', state.filter);
    if (state.search) params.set('search', state.search);

    const target = document.getElementById('orders-list');
    target.innerHTML = '<div class="spinner"></div>';
    const { data, total } = await api.get(`/work-orders?${params}`);

    // Si el usuario ya navegó a otra pantalla mientras cargaba, no hay
    // dónde escribir: salir en vez de reventar sobre un elemento muerto.
    const contador = document.getElementById('orders-count');
    if (!contador) return;
    contador.textContent = total === 1 ? '1 orden' : `${number(total)} órdenes`;

    target.innerHTML = data.length ? data.map((order) => {
      const balance = Number(order.balance || 0);
      return `<a class="list-item" href="#/ordenes/${esc(order.id)}"
                 style="color:inherit;text-decoration:none">
        <div class="grow">
          <div class="t">
            <span class="plate">${esc(order.plate || 'SIN PLACA')}</span>
            ${esc(motorcycleName(order))}
          </div>
          <div class="s">#${esc(order.number)} · ${esc(order.customer_name || 'Sin cliente')}
            · ${esc((order.complaint || '').slice(0, 70))}</div>
          <div class="faint" style="margin-top:3px">
            Ingresó ${esc(since(order.received_at))}
            ${order.mechanic_name ? ` · ${esc(order.mechanic_name)}` : ''}
            ${balance > 0 ? ` · <span style="color:var(--red)">debe ${money(balance)}</span>` : ''}
          </div>
        </div>
        <div class="right nowrap">
          ${statusTag(order.status)}
          <div class="small strong" style="margin-top:5px">${money(order.total)}</div>
        </div>
      </a>`;
    }).join('') : empty('No hay órdenes con este filtro.', '🔍');
  };

  onMount(() => {
    load();
    document.getElementById('orders-search').addEventListener('input', (event) => {
      state.search = event.target.value.trim();
      clearTimeout(window.__searchTimer);
      window.__searchTimer = setTimeout(load, 260);
    });
    document.querySelectorAll('[data-filter]').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.filter = chip.dataset.filter;
        sessionStorage.setItem('orders_filter', state.filter);
        document.querySelectorAll('[data-filter]').forEach((c) =>
          c.classList.toggle('on', c.dataset.filter === state.filter));
        load();
      });
    });
  });

  return `
    <div class="page-head">
      <div><h1>Órdenes de trabajo</h1><p id="orders-count">Cargando…</p></div>
      <a class="btn btn-primary" href="#/ordenes/nueva">Recibir una moto</a>
    </div>
    <div class="toolbar">
      <input class="search" id="orders-search" type="search"
             placeholder="Buscar por placa, cliente, número o código">
    </div>
    <div class="chips">
      ${FILTERS.map(([key, label]) =>
        `<button class="chip ${state.filter === key ? 'on' : ''}" data-filter="${key}">${label}</button>`).join('')}
    </div>
    <div class="card"><div class="card-body tight" id="orders-list"></div></div>`;
}

// ── Recepción ─────────────────────────────────────────────────────────
export async function receptionView() {
  const [mechanics] = await Promise.all([
    api.get('/users?role=mechanic&active=true').then((r) => r.data).catch(() => [])
  ]);

  // Las fotos se acumulan aquí hasta que la orden exista: sin orden creada
  // no hay a qué asociarlas.
  const fotos = [];

  onMount(() => {
    const form = document.getElementById('reception-form');
    const plateInput = document.getElementById('f-plate');
    const known = document.getElementById('plate-known');
    const entradaFotos = document.getElementById('f-fotos');
    const previas = document.getElementById('fotos-previas');

    const pintarPrevias = () => {
      previas.innerHTML = fotos.map((foto, i) => `
        <div style="position:relative">
          <img src="${URL.createObjectURL(foto)}" alt=""
               style="width:92px;height:92px;object-fit:cover;border-radius:8px;
                      border:1px solid var(--border-strong)">
          <button type="button" data-quitar="${i}" title="Quitar"
                  style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;
                         border-radius:50%;border:none;background:var(--red);color:#fff;
                         cursor:pointer;font-size:13px;line-height:1">×</button>
        </div>`).join('');

      previas.querySelectorAll('[data-quitar]').forEach((boton) => {
        boton.addEventListener('click', () => {
          fotos.splice(Number(boton.dataset.quitar), 1);
          pintarPrevias();
        });
      });
    };

    entradaFotos.addEventListener('change', () => {
      for (const archivo of entradaFotos.files) {
        if (fotos.length >= 10) { toast('Máximo 10 fotos por recepción', true); break; }
        fotos.push(archivo);
      }
      entradaFotos.value = '';   // permite volver a elegir la misma foto
      pintarPrevias();
    });

    // Al escribir una placa conocida, se rellenan los datos de la moto.
    let lookupTimer;
    plateInput.addEventListener('input', () => {
      plateInput.value = plateInput.value.toUpperCase();
      clearTimeout(lookupTimer);
      known.innerHTML = '';
      const plate = plateInput.value.trim();
      if (plate.length < 4) return;

      lookupTimer = setTimeout(async () => {
        try {
          const moto = await api.get(`/motorcycles/by-plate/${encodeURIComponent(plate)}`);
          known.innerHTML = `<div class="alert alert-ok" style="margin:8px 0 0">
            Moto conocida: ${esc(motorcycleName(moto))} — ${esc(moto.customer_name || 'sin dueño registrado')}.
            Se usará su ficha y su historial.</div>`;
          for (const [key, value] of Object.entries({
            brand: moto.brand, model: moto.model, year: moto.year,
            customer_name: moto.customer_name, customer_phone: moto.customer_phone
          })) {
            const input = document.getElementById(`f-${key}`);
            if (input && value != null) { input.value = value; input.readOnly = true; }
          }
          if (moto.mileage && !document.getElementById('f-mileage_in').value) {
            document.getElementById('f-mileage_in').value = moto.mileage;
          }
        } catch {
          known.innerHTML = '<div class="faint" style="margin-top:8px">Placa nueva: se creará la ficha de la moto.</div>';
          // Sólo se limpian los campos que quedaron de sólo lectura: eso es
          // justo lo que marca que su valor vino de una placa conocida
          // anterior, no de algo que el usuario haya escrito a mano.
          form.querySelectorAll('input[readonly]').forEach((input) => {
            input.readOnly = false;
            input.value = '';
          });
        }
      }, 350);
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('[type=submit]');
      button.disabled = true;
      button.textContent = 'Creando la orden…';
      try {
        const raw = Object.fromEntries(new FormData(form).entries());
        const accessories = [...form.querySelectorAll('input[name=accessory]:checked')]
          .map((input) => input.value);
        const payload = clean(raw, ['year', 'mileage_in', 'tax_rate']);
        delete payload.accessory;
        payload.accessories = accessories;
        const order = await api.post('/work-orders', payload);

        // Ya existe la orden: ahora sí se suben las fotos.
        if (fotos.length) {
          button.textContent = `Subiendo ${fotos.length} foto(s)…`;
          const datos = new FormData();
          datos.append('entity_type', 'work_order');
          datos.append('entity_id', order.id);
          datos.append('kind', 'photo');
          datos.append('stage', 'reception');
          for (const foto of fotos) datos.append('files', foto);
          try {
            await api.upload('/attachments', datos);
          } catch (err) {
            // La orden ya se creó: perderla por una foto sería peor.
            toast('La orden se creó, pero las fotos no subieron: ' + err.message, true);
          }
        }

        toast(`Orden #${order.number} creada`);
        go(`/ordenes/${order.id}`);
      } catch (err) {
        document.getElementById('reception-error').innerHTML =
          `<div class="alert alert-error">${esc(err.message)}</div>`;
        button.disabled = false;
        button.textContent = 'Crear la orden';
        window.scrollTo(0, 0);
      }
    });
  });

  const accessories = ['Casco', 'Baúl', 'Herramientas', 'Documentos', 'Llaves de repuesto', 'Guantes'];

  return `
    <div class="page-head">
      <div><h1>Recepción de la moto</h1>
        <p>Deja constancia de cómo entra la moto: es lo que te respalda en la entrega.</p></div>
      <a class="btn btn-default" href="#/ordenes">Cancelar</a>
    </div>
    <div id="reception-error"></div>

    <form id="reception-form">
      <div class="grid cols-2">
        <div class="card">
          <div class="card-head"><h2>Moto y cliente</h2></div>
          <div class="card-body">
            ${field('plate', 'Placa', { required: true, placeholder: 'ABC12D' })}
            <div id="plate-known"></div>
            <div class="row-3" style="margin-top:14px">
              ${field('brand', 'Marca', { placeholder: 'Yamaha' })}
              ${field('model', 'Línea', { placeholder: 'FZ 2.0' })}
              ${field('year', 'Modelo', { type: 'number', placeholder: '2021' })}
            </div>
            <div class="row">
              ${field('customer_name', 'Cliente', { placeholder: 'Nombre del dueño' })}
              ${field('customer_phone', 'WhatsApp', { type: 'tel', placeholder: '300 000 0000' })}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Estado de entrada</h2></div>
          <div class="card-body">
            <div class="row">
              ${field('mileage_in', 'Kilometraje', { type: 'number', placeholder: '24500' })}
              ${field('fuel_level', 'Combustible',
                { options: [['', '—'], ...Object.entries(FUEL_LEVELS)] })}
            </div>
            <div class="field">
              <label>Accesorios que entrega</label>
              <div style="display:flex;flex-wrap:wrap;gap:10px 16px;margin-top:4px">
                ${accessories.map((item) => `
                  <label class="small" style="display:flex;gap:6px;align-items:center;cursor:pointer">
                    <input type="checkbox" name="accessory" value="${esc(item)}"> ${esc(item)}
                  </label>`).join('')}
              </div>
            </div>
            ${field('existing_damage', 'Daños o rayones que ya trae', { rows: 2,
              placeholder: 'Rayón en el tanque lado derecho, direccional izquierda partida...' })}

            <div class="field">
              <label for="f-fotos">Fotos de cómo entra la moto</label>
              <input type="file" id="f-fotos" accept="image/*" capture="environment" multiple>
              <div class="faint" style="margin-top:4px">
                Desde el celular o la tablet abre la cámara. Tómale a los daños que
                anotaste: es lo que te respalda si después hay un reclamo.</div>
              <div id="fotos-previas" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Motivo de ingreso</h2></div>
        <div class="card-body">
          ${field('complaint', '¿Qué reporta el cliente?', { required: true, rows: 3,
            placeholder: 'Suena la cadena, no arranca en frío, mantenimiento de 10.000 km...' })}
          <div class="row-3">
            ${field('mechanic_id', 'Mecánico asignado',
              { options: [['', 'Sin asignar'], ...mechanics.map((m) => [m.id, m.name])] })}
            ${field('priority', 'Prioridad',
              { options: [['normal', 'Normal'], ['high', 'Alta'], ['low', 'Baja']] })}
            ${field('promised_at', 'Entrega prometida', { type: 'date' })}
          </div>
          ${Number(session.workshop?.tax_rate) > 0 ? `
            <div class="row">
              ${field('tax_rate', 'Facturación', {
                options: [
                  [String(session.workshop.tax_rate), `Con IVA (${session.workshop.tax_rate}%)`],
                  ['0', 'Sin IVA']],
                hint: 'Se puede cambiar después con un clic en la orden.' })}
            </div>` : ''}
          ${field('reception_notes', 'Notas internas de recepción', { rows: 2 })}
        </div>
      </div>

      <div class="btn-group" style="justify-content:flex-end">
        <a class="btn btn-default" href="#/ordenes">Cancelar</a>
        <button type="submit" class="btn btn-primary">Crear la orden</button>
      </div>
    </form>`;
}

// Buscador de catálogo (servicio o repuesto) para reemplazar el <select>
// con todo el catálogo en texto plano — el mismo patrón que ya usan Ventas
// e Inventario. Al elegir un resultado completa descripción y precio, y
// deja el id enlazado en un input oculto (para repuestos, es lo que hace
// que el backend descuente stock).
function bindCatalogSearch(inputId, hiddenId, { items, getMeta, onPick }) {
  const input = document.getElementById(inputId);
  const hidden = document.getElementById(hiddenId);
  if (!input || !hidden) return;
  let dd = null;
  let timer = null;

  const close = () => { dd?.remove(); dd = null; };
  const position = () => {
    if (!dd) return;
    const rect = input.getBoundingClientRect();
    dd.style.left = `${rect.left}px`;
    dd.style.top = `${rect.bottom + 2}px`;
    dd.style.width = `${rect.width}px`;
  };
  const open = () => {
    if (!dd) {
      dd = document.createElement('div');
      dd.className = 'sale-search-dd sale-search-dd-floating';
      document.body.appendChild(dd);
    }
    position();
    dd.style.display = 'block';
  };
  const pick = (item) => {
    hidden.value = item.id;
    input.value = item.name;
    close();
    onPick(item);
  };
  const render = (query) => {
    const q = normalizeSearch(query.trim());
    if (!q.length) { close(); return; }
    const results = items
      .filter((it) => normalizeSearch(it.name).includes(q) || normalizeSearch(it.code || it.sku || '').includes(q))
      .slice(0, 8);

    open();
    dd.innerHTML = results.length
      ? results.map((it) => `<div class="sale-sr-item" data-id="${esc(it.id)}">
          <div class="sale-sr-name">${esc(it.name)}${(it.code || it.sku) ? ` <span class="faint">[${esc(it.code || it.sku)}]</span>` : ''}</div>
          <div class="sale-sr-meta">${esc(getMeta(it))}</div>
        </div>`).join('')
      : `<div class="sale-sr-empty">Sin resultados para "${esc(query)}"</div>`;
    dd.querySelectorAll('.sale-sr-item').forEach((el) => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const item = items.find((it) => it.id === el.dataset.id);
        if (item) pick(item);
      });
    });
  };

  input.addEventListener('input', () => {
    hidden.value = '';
    clearTimeout(timer);
    timer = setTimeout(() => render(input.value), 150);
  });
  input.addEventListener('focus', () => {
    if (input.value.trim().length && !hidden.value) render(input.value);
  });
  input.addEventListener('blur', () => setTimeout(close, 180));
}

// ── Ficha de la orden ─────────────────────────────────────────────────
export async function orderDetailView(id) {
  const [order, mechanics, catalogServices, parts] = await Promise.all([
    api.get(`/work-orders/${id}`),
    api.get('/users?role=mechanic&active=true').then((r) => r.data).catch(() => []),
    api.get('/services?active=true&limit=300').then((r) => r.data).catch(() => []),
    api.get('/parts?active=true&limit=500').then((r) => r.data).catch(() => [])
  ]);

  const editable = !['closed', 'cancelled'].includes(order.status);
  const balance = Number(order.balance || 0);
  const trackUrl = `${location.origin}/#/orden/${order.public_code}`;

  const nextStatuses = (await api.get('/work-orders/statuses'))[order.status] || [];

  onMount(() => {
    // Las imágenes van protegidas por el token, así que no se pueden poner
    // directamente en un <img src>: se piden y se muestran desde memoria.
    const pintarFotos = async () => {
      const caja = document.getElementById('fotos-orden');
      if (!caja || !order.attachments.length) return;

      const etapas = { reception: 'Recepción', diagnostic: 'Diagnóstico',
                       work: 'Trabajo', delivery: 'Entrega' };
      const trozos = await Promise.all(order.attachments.map(async (archivo) => {
        try {
          const res = await fetch(`/api/attachments/${archivo.id}/file`, {
            headers: { Authorization: `Bearer ${session.token}` }
          });
          if (!res.ok) throw new Error('no disponible');
          const url = URL.createObjectURL(await res.blob());
          return `<a href="${url}" target="_blank" rel="noopener" title="${esc(archivo.filename)}">
            <img src="${url}" alt="${esc(archivo.caption || archivo.filename)}"
                 style="width:120px;height:120px;object-fit:cover;border-radius:8px;
                        border:1px solid var(--border-strong)">
            <div class="faint" style="text-align:center;margin-top:3px">
              ${esc(etapas[archivo.stage] || '')}</div></a>`;
        } catch {
          return `<div class="faint" style="width:120px">${esc(archivo.filename)}<br>(no disponible)</div>`;
        }
      }));
      caja.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:10px">${trozos.join('')}</div>`;
    };
    pintarFotos();

    // Agregar fotos después de la recepción (avance del trabajo, entrega...).
    const entradaMas = document.getElementById('mas-fotos');
    document.getElementById('btn-mas-fotos')?.addEventListener('click', () => entradaMas.click());
    entradaMas?.addEventListener('change', async () => {
      if (!entradaMas.files.length) return;
      const datos = new FormData();
      datos.append('entity_type', 'work_order');
      datos.append('entity_id', id);
      datos.append('kind', 'photo');
      datos.append('stage', order.status === 'delivered' ? 'delivery' : 'work');
      for (const archivo of entradaMas.files) datos.append('files', archivo);
      try {
        await api.upload('/attachments', datos);
        toast('Fotos agregadas');
        refresh();
      } catch (err) { toast(err.message, true); }
    });

    // Cambio de estado.
    document.querySelectorAll('[data-status]').forEach((button) => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await api.post(`/work-orders/${id}/status`, { status: button.dataset.status });
          toast(`Estado: ${ORDER_STATUS[button.dataset.status]?.label || button.dataset.status}`);
          refresh();
        } catch (err) { toast(err.message, true); button.disabled = false; }
      });
    });

    // Con IVA / sin IVA: un clic, sin escribir números.
    document.querySelectorAll('[data-tax]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (button.classList.contains('on')) return;
        const rate = button.dataset.tax === '0' ? 0 : Number(session.workshop.tax_rate);
        button.disabled = true;
        try {
          await api.patch(`/work-orders/${id}`, { tax_rate: rate });
          toast(rate > 0 ? `Orden con IVA del ${rate}%` : 'Orden sin IVA');
          refresh();
        } catch (err) { toast(err.message, true); button.disabled = false; }
      });
    });

    document.getElementById('btn-copy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(trackUrl);
        toast('Enlace de seguimiento copiado');
      } catch { toast('No se pudo copiar el enlace', true); }
    });

    document.getElementById('btn-print')?.addEventListener('click', () => window.print());

    // Guardar diagnóstico, trabajo realizado y próximos servicios.
    document.getElementById('work-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.target.querySelector('[type=submit]');
      button.disabled = true;
      try {
        const raw = Object.fromEntries(new FormData(event.target).entries());
        await api.patch(`/work-orders/${id}`,
          clean(raw, ['discount', 'tax_rate', 'next_service_mileage']));
        toast('Cambios guardados');
        refresh();
      } catch (err) { toast(err.message, true); button.disabled = false; }
    });

    document.getElementById('btn-diagnostic')?.addEventListener('click', async () => {
      const result = await modal({
        title: 'Registrar diagnóstico',
        body: field('findings', '¿Qué encontraste?', { required: true, rows: 3 }) +
              field('tests_performed', 'Pruebas realizadas', { rows: 2 }) +
              field('recommendations', 'Recomendaciones para el cliente', { rows: 2 }),
        confirmText: 'Guardar diagnóstico',
        onSubmit: (data) => api.post(`/work-orders/${id}/diagnostics`, clean(data))
      });
      if (result) { toast('Diagnóstico registrado'); refresh(); }
    });

    // Mano de obra. El campo de búsqueda reemplaza el <select> con todo el
    // catálogo en texto plano — mismo patrón que Ventas e Inventario.
    document.getElementById('btn-add-service')?.addEventListener('click', async () => {
      const pending = modal({
        title: 'Agregar mano de obra',
        body: (catalogServices.length
                ? `<div class="field sale-search-wrap" style="margin-bottom:4px">
                     <label for="f-catalog-search">Buscar en el catálogo</label>
                     <input type="text" id="f-catalog-search" autocomplete="off"
                         placeholder="Buscar servicio o código...">
                     <input type="hidden" name="service_id" id="f-service_id">
                   </div>
                   <div class="faint" style="margin:0 0 14px">Al elegir uno se llenan solos la descripción y el precio.</div>`
                : `<div class="alert alert-info">Todavía no tienes servicios en el catálogo.
                     Escribe el trabajo aquí abajo. Si lo agregas en
                     <b>Ajustes → Catálogo de servicios</b>, la próxima vez lo eliges de una
                     lista y sale con su precio puesto.</div>`) +
              field('description', 'Descripción', { required: true }) +
              `<div class="row">${field('quantity', 'Cantidad', { type: 'number', value: '1', step: '0.01', min: 0 })}
               ${field('unit_price', 'Precio', { type: 'number', value: '0', min: 0 })}</div>` +
              field('approved', '¿Ya está autorizado?',
                { options: [['true', 'Sí, cóbralo'], ['false', 'No, va a cotización']] }),
        confirmText: 'Agregar',
        onSubmit: (data) => {
          const payload = clean(data, ['quantity', 'unit_price']);
          payload.approved = data.approved === 'true';
          if (!payload.service_id && !payload.description) {
            throw new Error('Elige un servicio del catálogo o escribe la descripción');
          }
          return api.post(`/work-orders/${id}/services`, payload);
        }
      });
      if (catalogServices.length) {
        bindCatalogSearch('f-catalog-search', 'f-service_id', {
          items: catalogServices,
          getMeta: (s) => money(s.price),
          onPick: (s) => {
            document.getElementById('f-description').value = s.name;
            document.getElementById('f-unit_price').value = s.price;
          }
        });
      }
      const result = await pending;
      if (result) { toast('Trabajo agregado'); refresh(); }
    });

    // Repuestos.
    document.getElementById('btn-add-part')?.addEventListener('click', async () => {
      const pending = modal({
        title: 'Cargar repuesto',
        body: (parts.length
                ? `<div class="field sale-search-wrap" style="margin-bottom:4px">
                     <label for="f-catalog-search">Buscar en el inventario</label>
                     <input type="text" id="f-catalog-search" autocomplete="off"
                         placeholder="Buscar repuesto o SKU...">
                     <input type="hidden" name="part_id" id="f-part_id">
                   </div>
                   <div class="faint" style="margin:0 0 14px">Al elegir uno se llenan la descripción y el precio, y se descuenta el stock.</div>`
                : `<div class="alert alert-info">Tu inventario está vacío.
                     Escribe el repuesto aquí abajo. Si lo cargas en <b>Inventario</b>, la próxima
                     vez lo eliges de una lista y el stock se descuenta solo.</div>`) +
              field('description', 'Descripción', { required: true }) +
              `<div class="row">${field('quantity', 'Cantidad', { type: 'number', value: '1', step: '0.01', min: 0 })}
               ${field('unit_price', 'Precio', { type: 'number', value: '0', min: 0 })}</div>` +
              field('approved', '¿Ya está autorizado?',
                { options: [['true', 'Sí, sácalo de bodega'], ['false', 'No, va a cotización']] }),
        confirmText: 'Cargar',
        onSubmit: (data) => {
          const payload = clean(data, ['quantity', 'unit_price']);
          payload.approved = data.approved === 'true';
          if (!payload.part_id && !payload.description) {
            throw new Error('Elige un repuesto del inventario o escribe la descripción');
          }
          return api.post(`/work-orders/${id}/parts`, payload);
        }
      });
      if (parts.length) {
        bindCatalogSearch('f-catalog-search', 'f-part_id', {
          items: parts,
          getMeta: (p) => `${money(p.price)} · ${number(p.stock)} en stock`,
          onPick: (p) => {
            document.getElementById('f-description').value = p.name;
            document.getElementById('f-unit_price').value = p.price;
          }
        });
      }
      const result = await pending;
      if (result) { toast('Repuesto cargado'); refresh(); }
    });

    // Quitar líneas.
    document.querySelectorAll('[data-remove]').forEach((button) => {
      button.addEventListener('click', async () => {
        const { remove, kind } = button.dataset;
        if (!(await confirmDialog('¿Quitar esta línea de la orden?',
          { confirmText: 'Sí, quitarla' }))) return;
        try {
          await api.delete(`/work-orders/${id}/${kind}/${remove}`);
          toast('Línea eliminada');
          refresh();
        } catch (err) { toast(err.message, true); }
      });
    });

    // Cotización.
    document.getElementById('btn-quote')?.addEventListener('click', async () => {
      const result = await modal({
        title: 'Crear cotización',
        body: `<p class="small muted" style="margin-bottom:14px">
                 Se arma con las líneas cargadas. Lo que aún no está autorizado se
                 marca como opcional para que el cliente decida.</p>` +
              field('discount', 'Descuento', { type: 'number', value: '0', min: 0 }) +
              field('valid_until', 'Válida hasta', { type: 'date' }) +
              field('notes', 'Nota para el cliente', { rows: 2 }),
        confirmText: 'Crear',
        onSubmit: (data) => api.post(`/work-orders/${id}/quotes`, clean(data, ['discount']))
      });
      if (result) { toast(`Cotización #${result.number} creada`); refresh(); }
    });

    document.querySelectorAll('[data-send-quote]').forEach((button) => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const quote = await api.post(`/quotes/${button.dataset.sendQuote}/send`);
          await navigator.clipboard.writeText(quote.public_url).catch(() => {});
          toast('Cotización enviada. Enlace copiado para el cliente.');
          refresh();
        } catch (err) { toast(err.message, true); button.disabled = false; }
      });
    });

    document.querySelectorAll('[data-quote-link]').forEach((button) => {
      button.addEventListener('click', async () => {
        await navigator.clipboard.writeText(button.dataset.quoteLink).catch(() => {});
        toast('Enlace copiado');
      });
    });

    // Pagos.
    document.getElementById('btn-payment')?.addEventListener('click', async () => {
      const result = await modal({
        title: 'Registrar pago',
        body: field('amount', 'Monto', { type: 'number', value: String(Math.round(balance) || ''), min: 0 }) +
              field('method', 'Método', { options: Object.entries(PAYMENT_METHODS) }) +
              field('reference', 'Referencia'),
        confirmText: 'Registrar',
        onSubmit: (data) => api.post(`/work-orders/${id}/payments`, clean(data, ['amount']))
      });
      if (result) { toast('Pago registrado'); refresh(); }
    });

    // Factura de venta normal (plan Completo): sin DIAN, sin Factus, sólo
    // formaliza el total de la orden con su propio consecutivo.
    document.getElementById('btn-invoice-normal')?.addEventListener('click', async () => {
      const result = await modal({
        title: 'Factura de venta',
        body: `<p class="small muted" style="margin-bottom:14px">
                 Es un comprobante de venta normal, no electrónico ante la DIAN.
                 Para eso está "Facturar electrónicamente" (plan Premium).</p>
               ${field('observation', 'Observación (opcional)', { rows: 2 })}`,
        confirmText: 'Generar factura',
        onSubmit: (data) => api.post(`/work-orders/${id}/invoice-normal`, clean(data))
      });
      if (result) { toast(`Factura ${result.doc_code} generada`); refresh(); }
    });

    // Facturación electrónica DIAN (plan Premium).
    document.getElementById('btn-invoice')?.addEventListener('click', async () => {
      const lastMethod = order.payments[order.payments.length - 1]?.method;
      const result = await modal({
        title: 'Facturar electrónicamente',
        wide: true,
        body: `<p class="small muted" style="margin-bottom:14px">
                 Estos datos son los que exige la DIAN y no viven en la ficha del
                 cliente. Se completan aquí cada vez porque cambian según a nombre
                 de quién se factura.</p>
               <div class="row">
                 ${field('identification_document_code', 'Tipo de documento', { value: '13', options: [
                   ['13', 'Cédula de ciudadanía'], ['31', 'NIT'], ['22', 'Cédula de extranjería'],
                   ['12', 'Tarjeta de identidad'], ['41', 'Pasaporte'], ['91', 'NUIP']
                 ] })}
                 ${field('identification', 'Número de documento', { required: true,
                   value: order.customer?.document_number || '' })}
               </div>
               <div class="row">
                 ${field('legal_organization_code', 'Tipo de persona', { value: '2', options: [
                   ['2', 'Persona natural'], ['1', 'Persona jurídica'] ] })}
                 ${field('dv', 'DV (sólo NIT)', { placeholder: 'Dígito de verificación' })}
               </div>
               ${field('names', 'Nombre completo o razón social', { required: true,
                 value: order.customer?.name || '' })}
               ${field('address', 'Dirección', { value: order.customer?.address || '' })}
               <div class="row">
                 ${field('email', 'Correo', { type: 'email', value: order.customer?.email || '' })}
                 ${field('phone', 'Teléfono', { type: 'tel', value: order.customer?.phone || '' })}
               </div>
               <div class="row">
                 ${field('municipality_code', 'Código DANE del municipio', { required: true,
                   placeholder: '05001', hint: 'Medellín 05001 · Bogotá 11001 · Cali 76001' })}
                 ${field('tribute_code', 'Responsabilidad de IVA', {
                   value: Number(order.tax_rate) > 0 ? '01' : 'ZZ',
                   options: [['01', 'Responsable de IVA'], ['ZZ', 'No aplica']] })}
               </div>
               ${field('payment_method_code', 'Método de pago', {
                 value: { cash: '10', transfer: '47', card: '48' }[lastMethod] || '10',
                 options: [['10', 'Efectivo'], ['47', 'Transferencia'], ['48', 'Tarjeta crédito'],
                   ['49', 'Tarjeta débito'], ['42', 'Consignación bancaria'], ['ZZZ', 'Otro']] })}
               ${field('observation', 'Observación (opcional)', { rows: 2 })}`,
        confirmText: 'Facturar',
        onSubmit: (data) => api.post(`/work-orders/${id}/invoice`, data)
      });
      if (result) { toast(`Factura ${result.external_id} emitida`); refresh(); }
    });

    document.querySelectorAll('[data-invoice-pdf]').forEach((button) => {
      button.addEventListener('click', async () => {
        const original = button.textContent;
        button.disabled = true;
        button.textContent = 'Preparando…';
        try {
          const res = await fetch(`/api/invoices/${button.dataset.invoicePdf}/pdf`, {
            headers: { Authorization: `Bearer ${session.token}` }
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo descargar');
          const cabecera = res.headers.get('Content-Disposition') || '';
          const nombre = (cabecera.match(/filename="([^"]+)"/) || [])[1] || 'factura.pdf';
          const url = URL.createObjectURL(await res.blob());
          const enlace = document.createElement('a');
          enlace.href = url; enlace.download = nombre;
          document.body.appendChild(enlace); enlace.click(); enlace.remove();
          URL.revokeObjectURL(url);
        } catch (err) { toast(err.message, true); }
        button.disabled = false;
        button.textContent = original;
      });
    });
  });

  const lineRow = (line, kind) => `
    <tr>
      <td>
        <div class="strong">${esc(line.description)}</div>
        <div class="faint">${kind === 'parts' ? 'Repuesto' : 'Mano de obra'}
          ${line.approved ? '' : ' · <span style="color:var(--amber)">por autorizar</span>'}
          ${line.mechanic_name ? ` · ${esc(line.mechanic_name)}` : ''}</div>
      </td>
      <td class="num">${number(line.quantity)}</td>
      <td class="num">${money(line.unit_price)}</td>
      <td class="num strong">${money(Number(line.quantity) * Number(line.unit_price))}</td>
      ${editable ? `<td class="num no-print">
        <button class="btn btn-quiet btn-sm" data-remove="${esc(line.id)}"
                data-kind="${kind}" title="Quitar">✕</button></td>` : '<td></td>'}
    </tr>`;

  const w = session.workshop || {};
  const letterhead = `
    <div class="print-only" style="align-items:center;gap:14px;margin-bottom:16px;
                                    border-bottom:2px solid #000;padding-bottom:12px">
      ${w.logo_url ? `<img src="/api/public/workshop/${esc(w.id)}/logo"
           style="width:64px;height:64px;object-fit:contain">` : ''}
      <div>
        <div style="font-weight:700;font-size:1.1rem">${esc(w.legal_name || w.name || '')}</div>
        ${w.tax_id ? `<div>NIT ${esc(w.tax_id)}</div>` : ''}
        <div>${[w.address, w.city].filter(Boolean).map(esc).join(', ')}
          ${w.phone ? ` · Tel. ${esc(w.phone)}` : ''}</div>
      </div>
    </div>`;

  return `
    ${letterhead}
    <div class="page-head">
      <div>
        <h1>Orden #${esc(order.number)}
          <span class="mono faint" style="font-size:.8rem">${esc(order.public_code)}</span></h1>
        <p>
          <span class="plate">${esc(order.motorcycle?.plate || 'SIN PLACA')}</span>
          ${esc(motorcycleName(order.motorcycle))} ·
          ${esc(order.customer?.name || 'Sin cliente')}
          ${order.customer?.phone ? ` · ${esc(order.customer.phone)}` : ''}
        </p>
        <p class="faint">Ingresó ${date(order.received_at, true)}
          ${order.mileage_in ? ` · ${number(order.mileage_in)} km` : ''}
          ${order.promised_at ? ` · prometida ${date(order.promised_at)}` : ''}
          ${order.fuel_level ? ` · combustible ${esc(FUEL_LEVELS[order.fuel_level] || order.fuel_level)}` : ''}</p>
      </div>
      <div class="btn-group no-print">
        ${statusTag(order.status)}
        <span class="tag ${(PAYMENT_STATUS[order.payment_status] || {}).tag}">
          ${esc((PAYMENT_STATUS[order.payment_status] || {}).label)}</span>
      </div>
    </div>

    <div class="btn-group no-print" style="margin-bottom:16px">
      ${nextStatuses.map((status) => `
        <button class="btn ${['ready', 'delivered'].includes(status) ? 'btn-primary' : 'btn-default'} btn-sm"
                data-status="${esc(status)}">→ ${esc(ORDER_STATUS[status]?.label || status)}</button>`).join('')}
      <button class="btn btn-default btn-sm" id="btn-copy">Copiar seguimiento</button>
      <button class="btn btn-default btn-sm" id="btn-print">Imprimir</button>
      ${order.customer?.phone ? `<a class="btn btn-default btn-sm" target="_blank" rel="noopener"
        href="https://wa.me/${esc(String(order.customer.phone).replace(/\D/g, '').replace(/^0+/, '').replace(/^(?!57)/, '57'))}?text=${encodeURIComponent(
          `Hola ${(order.customer.name || '').split(' ')[0]}, te escribo de ${session.workshop?.name || 'el taller'}. Tu moto ${order.motorcycle?.plate || ''} (orden #${order.number}) está en estado: ${ORDER_STATUS[order.status]?.label}. Puedes seguirla aquí: ${trackUrl}`)}">
        WhatsApp al cliente</a>` : ''}
    </div>

    <div class="grid cols-2">
      <div>
        <div class="card">
          <div class="card-head">
            <h2>Repuestos y mano de obra</h2>
            ${editable ? `<div class="btn-group no-print">
              <button class="btn btn-default btn-sm" id="btn-add-service">+ Mano de obra</button>
              <button class="btn btn-primary btn-sm" id="btn-add-part">+ Repuesto</button>
            </div>` : ''}
          </div>
          <div class="card-body tight">
            ${order.services.length || order.parts.length ? `
              <div class="table-wrap"><table>
                <thead><tr><th>Concepto</th><th class="num">Cant.</th>
                  <th class="num">Precio</th><th class="num">Total</th><th></th></tr></thead>
                <tbody>
                  ${order.services.map((line) => lineRow(line, 'services')).join('')}
                  ${order.parts.map((line) => lineRow(line, 'parts')).join('')}
                </tbody>
              </table></div>`
              : empty('Aún no has cargado repuestos ni mano de obra.', '🔧')}
          </div>
          <div class="card-body" style="border-top:1px solid var(--border)">
            ${Number(session.workshop?.tax_rate) > 0 ? `
              <div class="btn-group no-print" style="margin-bottom:12px">
                <button class="chip ${Number(order.tax_rate) > 0 ? 'on' : ''}" data-tax="taller">
                  Con IVA (${esc(Number(order.tax_rate) > 0 ? order.tax_rate : session.workshop.tax_rate)}%)</button>
                <button class="chip ${Number(order.tax_rate) > 0 ? '' : 'on'}" data-tax="0">
                  Sin IVA</button>
              </div>` : ''}
            <div class="totals">
              <div class="line"><span>Mano de obra</span><span>${money(order.labor_total)}</span></div>
              <div class="line"><span>Repuestos</span><span>${money(order.parts_total)}</span></div>
              ${Number(order.discount) ? `<div class="line"><span>Descuento</span>
                <span>− ${money(order.discount)}</span></div>` : ''}
              ${Number(order.tax_rate) ? `<div class="line"><span>IVA (${esc(order.tax_rate)}%)</span>
                <span>${money(order.tax_total)}</span></div>` : ''}
              <div class="line total"><span>Total</span><span>${money(order.total)}</span></div>
              <div class="line"><span>Abonado</span><span>${money(order.paid_total)}</span></div>
              ${balance > 0 ? `<div class="line due"><span>Saldo</span><span>${money(balance)}</span></div>` : ''}
            </div>
            <div class="btn-group no-print" style="margin-top:14px">
              ${session.can('cashier', 'reception') && order.status !== 'cancelled'
                ? '<button class="btn btn-default btn-sm" id="btn-payment">Registrar pago</button>' : ''}
              ${editable ? '<button class="btn btn-default btn-sm" id="btn-quote">Crear cotización</button>' : ''}
              ${session.can('cashier')
                && !order.invoices.some((i) => i.status === 'issued')
                ? '<button class="btn btn-default btn-sm" id="btn-invoice-normal">Factura de venta</button>' : ''}
              ${session.hasPlan('premium') && session.can('cashier')
                && !order.invoices.some((i) => i.status === 'issued')
                ? '<button class="btn btn-default btn-sm" id="btn-invoice">Facturar electrónicamente</button>' : ''}
            </div>
            ${order.payments.length ? `<div class="timeline" style="margin-top:16px">
              ${order.payments.map((payment) => `<div class="tl-item done">
                <div class="tl-t">${money(payment.amount)} ·
                  ${esc(PAYMENT_METHODS[payment.method] || payment.method)}</div>
                <div class="tl-d">${date(payment.created_at, true)}
                  ${payment.reference ? ` · ${esc(payment.reference)}` : ''}</div>
              </div>`).join('')}</div>` : ''}
          </div>
        </div>

        ${order.quotes.length ? `
        <div class="card">
          <div class="card-head"><h2>Cotizaciones</h2></div>
          <div class="card-body tight">
            ${order.quotes.map((quote) => `
              <div class="list-item" style="cursor:default">
                <div class="grow">
                  <div class="t">#${esc(quote.number)} · ${money(quote.total)}</div>
                  <div class="s">${quote.sent_at ? `Enviada ${date(quote.sent_at, true)}` : 'En borrador'}
                    ${quote.responded_at ? ` · respondida ${date(quote.responded_at, true)}` : ''}</div>
                </div>
                <div class="btn-group no-print">
                  <span class="tag ${quote.status === 'approved' ? 'tag-green'
                    : quote.status === 'rejected' ? 'tag-red'
                    : quote.status === 'partial' ? 'tag-amber' : 'tag-grey'}">${esc(quote.status)}</span>
                  ${quote.status === 'draft'
                    ? `<button class="btn btn-primary btn-sm" data-send-quote="${esc(quote.id)}">Enviar</button>`
                    : `<button class="btn btn-default btn-sm"
                         data-quote-link="${esc(location.origin)}/#/aprobar/${esc(quote.public_token)}">Copiar enlace</button>`}
                </div>
              </div>`).join('')}
          </div>
        </div>` : ''}

        ${order.invoices.length ? `
        <div class="card">
          <div class="card-head"><h2>Facturación</h2></div>
          <div class="card-body tight">
            ${order.invoices.map((invoice) => `
              <div class="list-item" style="cursor:default">
                <div class="grow">
                  <div class="t">${esc(invoice.doc_code)}
                    · ${money(invoice.total)}
                    <span class="tag ${invoice.kind === 'electronic' ? 'tag-green' : 'tag-grey'}"
                      style="margin-left:6px">${invoice.kind === 'electronic' ? 'Electrónica DIAN' : 'Venta'}</span></div>
                  <div class="s">Emitida ${date(invoice.issued_at || invoice.created_at, true)}
                    ${invoice.cufe ? ` · CUFE ${esc(invoice.cufe.slice(0, 12))}…` : ''}</div>
                </div>
                ${invoice.kind === 'electronic'
                  ? `<button class="btn btn-default btn-sm no-print" data-invoice-pdf="${esc(invoice.id)}">
                       Descargar PDF</button>` : ''}
              </div>`).join('')}
          </div>
        </div>` : ''}
      </div>

      <div>
        <div class="card">
          <div class="card-head">
            <h2>Diagnóstico y trabajo</h2>
            ${editable ? '<button class="btn btn-default btn-sm no-print" id="btn-diagnostic">+ Diagnóstico</button>' : ''}
          </div>
          <div class="card-body">
            <h3 class="muted small">Reporta el cliente</h3>
            <p class="small" style="margin:4px 0 16px;white-space:pre-wrap">${esc(order.complaint)}</p>

            ${order.diagnostics.length ? order.diagnostics.map((diagnostic) => `
              <div style="border-left:3px solid var(--violet);padding-left:12px;margin-bottom:14px">
                <div class="small strong">${esc(diagnostic.findings)}</div>
                ${diagnostic.tests_performed ? `<div class="faint">Pruebas: ${esc(diagnostic.tests_performed)}</div>` : ''}
                ${diagnostic.recommendations ? `<div class="faint">Recomienda: ${esc(diagnostic.recommendations)}</div>` : ''}
                <div class="faint">${date(diagnostic.created_at, true)}
                  ${diagnostic.mechanic_name ? ` · ${esc(diagnostic.mechanic_name)}` : ''}</div>
              </div>`).join('')
              : '<p class="faint" style="margin-bottom:14px">Todavía no hay diagnóstico registrado.</p>'}

            ${editable ? `
            <form id="work-form" style="border-top:1px solid var(--border);padding-top:14px">
              ${field('work_performed', 'Trabajo realizado', { rows: 3, value: order.work_performed || '' })}
              ${field('observations', 'Observaciones internas', { rows: 2, value: order.observations || '' })}
              <div class="row-3">
                ${field('mechanic_id', 'Mecánico', {
                  value: order.mechanic_id || '',
                  options: [['', 'Sin asignar'], ...mechanics.map((m) => [m.id, m.name])] })}
                ${field('discount', 'Descuento', { type: 'number', value: order.discount || 0, min: 0 })}
                ${field('tax_rate', 'IVA (%)', { type: 'number', value: order.tax_rate || 0, min: 0, step: '0.01' })}
              </div>
              <div class="row">
                ${field('next_service_mileage', 'Próximo servicio (km)',
                  { type: 'number', value: order.next_service_mileage || '' })}
                ${field('next_service_date', 'Próxima revisión',
                  { type: 'date', value: forInput(order.next_service_date) })}
              </div>
              <button type="submit" class="btn btn-primary btn-sm">Guardar</button>
            </form>` : ''}
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h2>Fotos</h2>
            ${editable ? `<div class="no-print">
              <input type="file" id="mas-fotos" accept="image/*" capture="environment"
                     multiple style="display:none">
              <button class="btn btn-default btn-sm" id="btn-mas-fotos">+ Agregar fotos</button>
            </div>` : ''}
          </div>
          <div class="card-body" id="fotos-orden">
            ${order.attachments.length
              ? '<div class="spinner"></div>'
              : '<p class="faint" style="margin:0">Sin fotos. Las de recepción son las que te respaldan en la entrega.</p>'}
          </div>
        </div>

        ${order.existing_damage || (order.accessories || []).length ? `
        <div class="card">
          <div class="card-head"><h2>Recepción</h2></div>
          <div class="card-body">
            ${(order.accessories || []).length ? `<div class="kv">
              <span class="k">Accesorios</span>
              <span class="v">${esc((order.accessories || []).join(', '))}</span></div>` : ''}
            ${order.existing_damage ? `<div class="kv">
              <span class="k">Daños previos</span>
              <span class="v">${esc(order.existing_damage)}</span></div>` : ''}
            ${order.reception_notes ? `<div class="kv">
              <span class="k">Notas</span><span class="v">${esc(order.reception_notes)}</span></div>` : ''}
          </div>
        </div>` : ''}

        <div class="card">
          <div class="card-head"><h2>Historial de la orden</h2></div>
          <div class="card-body">
            <div class="timeline">
              ${order.history.map((entry, index) => `
                <div class="tl-item ${index === order.history.length - 1 ? 'now' : 'done'}">
                  <div class="tl-t">${esc(ORDER_STATUS[entry.status]?.label || entry.status)}</div>
                  <div class="tl-d">${date(entry.created_at, true)}
                    ${entry.user_name ? ` · ${esc(entry.user_name)}` : ''}
                    ${entry.note ? ` · ${esc(entry.note)}` : ''}</div>
                </div>`).join('')}
            </div>
            ${order.motorcycle ? `<a class="btn btn-default btn-sm no-print" style="margin-top:14px"
              href="#/motos/${esc(order.motorcycle.id)}">Ver historial de esta moto</a>` : ''}
          </div>
        </div>
      </div>
    </div>`;
}
