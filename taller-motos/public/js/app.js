// Enrutador y estructura general de la aplicación.
//
// Una sola página con rutas por hash: no necesita servidor de desarrollo ni
// paso de compilación, y funciona igual servida desde cualquier sitio.
import { session, loadSession, logout } from './api.js';
import { esc, spinner, errorBox, toast } from './ui.js';

import { loginView, registerView } from './views/auth.js';
import { trackView, approveView } from './views/public.js';
import { dashboardView } from './views/dashboard.js';
import { ordersView, receptionView, orderDetailView } from './views/orders.js';
import { customersView, customerDetailView, motorcycleHistoryView } from './views/customers.js';
import { inventoryView } from './views/inventory.js';
import { agendaView } from './views/agenda.js';
import { reportsView } from './views/reports.js';
import { settingsView } from './views/settings.js';

// Cada ruta declara si necesita sesión y qué vista pinta.
const ROUTES = [
  { path: /^\/entrar$/,             view: loginView,      open: true, bare: true },
  { path: /^\/registrar$/,          view: registerView,   open: true, bare: true },
  { path: /^\/orden\/([^/]+)$/,     view: trackView,      open: true, bare: true },
  { path: /^\/aprobar\/([^/]+)$/,   view: approveView,    open: true, bare: true },

  { path: /^\/$/,                   view: dashboardView,  nav: 'panel' },
  { path: /^\/ordenes$/,            view: ordersView,     nav: 'ordenes' },
  { path: /^\/ordenes\/nueva$/,     view: receptionView,  nav: 'ordenes' },
  { path: /^\/ordenes\/([^/]+)$/,   view: orderDetailView, nav: 'ordenes' },
  { path: /^\/agenda$/,             view: agendaView,     nav: 'agenda' },
  { path: /^\/clientes$/,           view: customersView,  nav: 'clientes' },
  { path: /^\/clientes\/([^/]+)$/,  view: customerDetailView, nav: 'clientes' },
  { path: /^\/motos\/([^/]+)$/,     view: motorcycleHistoryView, nav: 'clientes' },
  { path: /^\/inventario$/,         view: inventoryView,  nav: 'inventario' },
  { path: /^\/reportes$/,           view: reportsView,    nav: 'reportes' },
  { path: /^\/ajustes$/,            view: settingsView,   nav: 'ajustes' }
];

const NAV = [
  ['panel',      '/',            'Panel'],
  ['ordenes',    '/ordenes',     'Órdenes'],
  ['agenda',     '/agenda',      'Agenda'],
  ['clientes',   '/clientes',    'Clientes'],
  ['inventario', '/inventario',  'Inventario'],
  ['reportes',   '/reportes',    'Reportes'],
  ['ajustes',    '/ajustes',     'Ajustes']
];

const root = document.getElementById('app');

function currentPath() {
  const hash = location.hash.replace(/^#/, '');
  return hash || '/';
}

// Aviso de licencia: discreto cuando faltan días, imposible de ignorar
// cuando ya venció.
function avisoLicencia() {
  const vence = session.workshop?.license_expires_at;
  if (!vence) return '';

  const dias = Math.ceil((new Date(vence) - Date.now()) / 86400000);
  if (dias > 10) return '';

  if (dias < 0) {
    return `<div class="alert alert-error" style="margin:14px 16px 0;border-radius:8px">
      <b>Tu licencia venció.</b> Puedes seguir consultando y exportando tu
      información, pero para registrar trabajo nuevo necesitas un código vigente.
      Pídeselo a quien te entregó el software.</div>`;
  }
  return `<div class="alert alert-warn" style="margin:14px 16px 0;border-radius:8px">
    Tu licencia vence ${dias === 0 ? 'hoy' : (dias === 1 ? 'mañana' : `en ${dias} días`)}.
    Pide un código nuevo para no quedarte sin registrar trabajo.</div>`;
}

function shell(active, content) {
  return `
    <div class="topbar">
      <div class="brand">TALLER<span>MOTOS</span></div>
      <div class="topbar-shop">${esc(session.workshop?.name || '')}</div>
      <div class="topbar-spacer"></div>
      <button class="btn btn-quiet btn-sm" id="btn-logout">Salir</button>
    </div>
    <nav class="nav">
      ${NAV.map(([key, href, label]) =>
        `<a href="#${href}" class="${active === key ? 'on' : ''}">${label}</a>`).join('')}
    </nav>
    ${avisoLicencia()}
    <main id="view">${content}</main>`;
}

// Sustituye sólo el contenido para no repintar la barra en cada navegación.
function paint(route, html) {
  if (route.bare) {
    root.innerHTML = html;
    return;
  }
  const view = document.getElementById('view');
  if (view && root.dataset.nav === route.nav) {
    view.innerHTML = html;
    return;
  }
  root.innerHTML = shell(route.nav, html);
  root.dataset.nav = route.nav;
  document.getElementById('btn-logout')?.addEventListener('click', logout);
}

async function render() {
  const path = currentPath();
  const match = ROUTES.map((route) => ({ route, params: path.match(route.path) }))
    .find((candidate) => candidate.params);

  if (!match) {
    root.innerHTML = `<div class="centered"><div class="panel card"><div class="card-body center">
      <h2>Página no encontrada</h2>
      <p class="muted" style="margin:10px 0 18px">La dirección <span class="mono">${esc(path)}</span> no existe.</p>
      <a class="btn btn-primary" href="#/">Ir al panel</a>
    </div></div></div>`;
    return;
  }

  const { route, params } = match;

  if (!route.open && !session.user) {
    const ok = await loadSession();
    if (!ok) {
      sessionStorage.setItem('taller_motos_next', path);
      location.hash = '#/entrar';
      return;
    }
  }

  // Con sesión abierta, las pantallas de acceso no tienen sentido.
  if (route.open && session.user && ['/entrar', '/registrar'].includes(path)) {
    location.hash = '#/';
    return;
  }

  paint(route, spinner());
  const target = route.bare ? root : document.getElementById('view');

  try {
    const html = await route.view(...params.slice(1));
    if (currentPath() !== path) return;   // el usuario ya navegó a otra parte
    if (route.bare) root.innerHTML = html;
    else target.innerHTML = html;

    // Cada vista puede dejar una función de arranque para enlazar eventos.
    if (typeof window.__mount === 'function') {
      const mount = window.__mount;
      window.__mount = null;
      await mount();
    }
    if (!route.bare) window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    const html = errorBox(err.message || 'No se pudo cargar esta pantalla');
    if (route.bare) root.innerHTML = `<div class="centered"><div class="panel">${html}
      <a class="btn btn-default btn-block" href="#/">Volver</a></div></div>`;
    else target.innerHTML = html;
  }
}

// Las vistas registran aquí el código que necesitan correr tras pintarse.
export function onMount(fn) { window.__mount = fn; }

// Recarga la vista actual (después de guardar algo).
export function refresh() { render(); }

export function go(path) {
  if (currentPath() === path) refresh();
  else location.hash = `#${path}`;
}

window.addEventListener('hashchange', render);

(async function start() {
  await loadSession();
  if (!location.hash) {
    location.hash = session.user ? '#/' : '#/entrar';
    return;   // el cambio de hash dispara render()
  }
  render();
})();

// Aviso global para errores no capturados en acciones de usuario.
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.message) toast(event.reason.message, true);
});
