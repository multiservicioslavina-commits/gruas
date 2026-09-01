import { session, loadSession, logout } from './api.js';
import { esc, spinner, errorBox, toast, date } from './ui.js';

import { loginView, registerView } from './views/auth.js';
import { trackView, approveView } from './views/public.js';
import { dashboardView } from './views/dashboard.js';
import { ordersView, receptionView, orderDetailView } from './views/orders.js';
import { customersView, customerDetailView, motorcycleHistoryView } from './views/customers.js';
import { inventoryView } from './views/inventory.js';
import { agendaView } from './views/agenda.js';
import { reportsView } from './views/reports.js';
import { settingsView } from './views/settings.js';

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

function ni(d) {
  return `<svg class="ni" viewBox="0 0 24 24">${d}</svg>`;
}

const NAV = [
  ['panel',      '/',           'Panel',
    ni('<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/>')],
  ['ordenes',    '/ordenes',    'Órdenes',
    ni('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8m8 4H8m2-8H8"/>')],
  ['agenda',     '/agenda',     'Agenda',
    ni('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>')],
  ['clientes',   '/clientes',   'Clientes',
    ni('<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>')],
  ['inventario', '/inventario',  'Inventario',
    ni('<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>')],
  ['reportes',   '/reportes',   'Reportes',
    ni('<path d="M18 20V10M12 20V4M6 20v-6"/>')],
  ['ajustes',    '/ajustes',    'Configuración',
    ni('<path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6M9 8h6m2 8h6"/>')]
];

const GEAR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4M4.9 4.9l2.9 2.9m8.4 8.4l2.9 2.9M1 12h4m14 0h4M4.9 19.1l2.9-2.9m8.4-8.4l2.9-2.9"/></svg>`;

const LOGOUT_SVG = `<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;

const root = document.getElementById('app');

function currentPath() {
  const hash = location.hash.replace(/^#/, '');
  return hash || '/';
}

function avisoLicencia() {
  const vence = session.workshop?.license_expires_at;
  if (!vence) return '';
  const dias = Math.ceil((new Date(vence) - Date.now()) / 86400000);
  if (dias > 10) return '';
  if (dias < 0) {
    return `<div class="alert alert-error" style="margin:0 0 16px;border-radius:8px">
      <b>Tu licencia venció.</b> Puedes seguir consultando y exportando tu
      información, pero para registrar trabajo nuevo necesitas un código vigente.
      Pídeselo a quien te entregó el software.</div>`;
  }
  return `<div class="alert alert-warn" style="margin:0 0 16px;border-radius:8px">
    Tu licencia vence ${dias === 0 ? 'hoy' : (dias === 1 ? 'mañana' : `en ${dias} días`)}.
    Pide un código nuevo para no quedarte sin registrar trabajo.</div>`;
}

function workshopFooter() {
  const w = session.workshop;
  if (!w) return '';
  let plan = '';
  if (w.license_plan) plan = `<div class="sw-plan">Plan ${esc(w.license_plan)}</div>`;
  let exp = '';
  if (w.license_expires_at) exp = `<div class="sw-exp">Vence ${esc(date(w.license_expires_at))}</div>`;
  return `<div class="sidebar-workshop">
    <div class="sw-name">${esc(w.name || 'Mi taller')}</div>
    ${plan}${exp}
  </div>`;
}

function shell(active, content) {
  const firstName = (session.user?.name || '').split(' ')[0];
  const initial = (firstName || '?')[0].toUpperCase();

  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <div class="brand-icon">${GEAR_SVG}</div>
        <div class="brand-text">TALLER<b>MOTOS</b></div>
      </div>
      <nav class="sidebar-nav">
        ${NAV.map(([key, href, label, icon]) =>
          `<a href="#${href}" class="nav-item${active === key ? ' on' : ''}" data-key="${key}">
            ${icon}<span>${label}</span></a>`).join('')}
      </nav>
      <div class="sidebar-footer">
        ${workshopFooter()}
        <button class="sidebar-logout" id="btn-logout">
          ${LOGOUT_SVG} Cerrar sesión
        </button>
      </div>
    </aside>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
    <div class="main-wrap">
      <header class="topbar">
        <button class="hamburger" id="hamburger" type="button" aria-label="Menú">
          <span></span><span></span><span></span>
        </button>
        <div class="topbar-brand">TALLER<b>MOTOS</b></div>
        <div class="topbar-spacer"></div>
        <div class="topbar-user">
          <div class="topbar-avatar">${esc(initial)}</div>
          <div>
            <div class="topbar-name">${esc(firstName)}</div>
            <div class="topbar-shop">${esc(session.workshop?.name || '')}</div>
          </div>
        </div>
      </header>
      <main id="view">
        ${avisoLicencia()}
        ${content}
      </main>
    </div>`;
}

function bindShellEvents() {
  document.getElementById('btn-logout')?.addEventListener('click', logout);

  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const hamburger = document.getElementById('hamburger');

  function closeSidebar() {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('show');
  }

  hamburger?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    overlay?.classList.toggle('show');
  });
  overlay?.addEventListener('click', closeSidebar);
  sidebar?.querySelectorAll('.nav-item').forEach((a) =>
    a.addEventListener('click', closeSidebar));
}

function paint(route, html) {
  if (route.bare) {
    root.innerHTML = html;
    return;
  }
  const view = document.getElementById('view');
  if (view && root.dataset.layout === 'sidebar') {
    view.innerHTML = avisoLicencia() + html;
    document.querySelectorAll('.nav-item').forEach((a) =>
      a.classList.toggle('on', a.dataset.key === route.nav));
    return;
  }
  root.innerHTML = shell(route.nav, html);
  root.dataset.layout = 'sidebar';
  bindShellEvents();
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

  if (route.open && session.user && ['/entrar', '/registrar'].includes(path)) {
    location.hash = '#/';
    return;
  }

  paint(route, spinner());
  const target = route.bare ? root : document.getElementById('view');

  try {
    const html = await route.view(...params.slice(1));
    if (currentPath() !== path) return;
    if (route.bare) root.innerHTML = html;
    else target.innerHTML = avisoLicencia() + html;

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

export function onMount(fn) { window.__mount = fn; }
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
    return;
  }
  render();
})();

window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.message) toast(event.reason.message, true);
});
