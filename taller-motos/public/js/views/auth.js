// Acceso y alta de un taller nuevo.
import { api, session } from '../api.js';
import { esc, field, errorBox, toast } from '../ui.js';
import { onMount } from '../app.js';

const GEAR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4M4.9 4.9l2.9 2.9m8.4 8.4l2.9 2.9M1 12h4m14 0h4M4.9 19.1l2.9-2.9m8.4-8.4l2.9-2.9"/></svg>`;

function afterLogin(result) {
  session.token = result.token;
  session.user = result.user;
  session.workshop = result.workshop || null;
  const next = sessionStorage.getItem('taller_motos_next');
  sessionStorage.removeItem('taller_motos_next');
  location.hash = `#${next && next !== '/entrar' ? next : '/'}`;
}

export async function loginView() {
  onMount(() => {
    document.getElementById('forgot-link').addEventListener('click', (event) => {
      event.preventDefault();
      const slot = document.getElementById('login-error');
      slot.innerHTML = `<div class="alert alert-info">
        <b>¿Olvidaste tu contraseña?</b><br>
        Pídele al administrador de tu taller que la restablezca desde
        <b>Configuración → Equipo</b>. Si tú eres el administrador,
        contacta a quien te entregó el software.</div>`;
    });

    const form = document.getElementById('login-form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('[type=submit]');
      const slot = document.getElementById('login-error');
      button.disabled = true;
      button.textContent = 'Entrando...';
      slot.innerHTML = '';
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        afterLogin(await api.post('/auth/login', data, { anonymous: true }));
      } catch (err) {
        slot.innerHTML = errorBox(err.message);
        button.disabled = false;
        button.textContent = 'Entrar';
      }
    });
  });

  return `
    <div class="auth-page">
      <div class="auth-brand">
        <div class="auth-brand-logo">
          <div class="auth-brand-icon">${GEAR_SVG}</div>
          <div class="auth-brand-title">TALLER<b>MOTOS</b></div>
        </div>
        <div class="auth-brand-sub">Gestiona tu taller de motos de forma profesional:<br>
          órdenes de trabajo, clientes, inventario y caja.</div>
      </div>
      <div class="auth-form">
        <div class="auth-inner">
          <h1>Entra a tu taller</h1>
          <p class="subtitle">Gestión de órdenes, clientes, inventario y caja.</p>
          <div class="card">
            <div class="card-body">
              <div id="login-error"></div>
              <form id="login-form">
                ${field('email', 'Correo', { type: 'email', required: true, placeholder: 'tu@taller.com' })}
                ${field('password', 'Contraseña', { type: 'password', required: true })}
                <button type="submit" class="btn btn-primary btn-block" style="margin-top:6px">Entrar</button>
              </form>
            </div>
          </div>
          <div class="auth-links"><a href="#" id="forgot-link">¿Olvidaste tu contraseña?</a></div>
          <div class="auth-links">¿Aún no tienes taller registrado?
            <a href="#/registrar">Crea uno</a></div>
          <div class="auth-links">¿Eres cliente y quieres ver tu moto?
            <a href="#/orden/">Consulta con tu código</a></div>
        </div>
      </div>
    </div>`;
}

export async function registerView() {
  // Una instalación puede no exigir código (por ejemplo, la del propio taller
  // que la aloja). Preguntar por él en ese caso sólo estorbaría.
  const exigeCodigo = await api.get('/health', { anonymous: true })
    .then((r) => Boolean(r.license_required))
    .catch(() => false);

  onMount(() => {
    const form = document.getElementById('register-form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('[type=submit]');
      const slot = document.getElementById('register-error');
      button.disabled = true;
      button.textContent = 'Creando...';
      slot.innerHTML = '';

      const data = Object.fromEntries(new FormData(form).entries());
      if (data.password !== data.password2) {
        slot.innerHTML = errorBox('Las contraseñas no coinciden');
        button.disabled = false;
        button.textContent = 'Crear mi taller';
        return;
      }
      delete data.password2;
      data.tax_rate = Number(data.tax_rate || 0);

      try {
        afterLogin(await api.post('/auth/register', data, { anonymous: true }));
        toast('Taller creado. ¡Bienvenido!');
      } catch (err) {
        slot.innerHTML = errorBox(err.message);
        button.disabled = false;
        button.textContent = 'Crear mi taller';
      }
    });
  });

  return `
    <div class="auth-page">
      <div class="auth-brand">
        <div class="auth-brand-logo">
          <div class="auth-brand-icon">${GEAR_SVG}</div>
          <div class="auth-brand-title">TALLER<b>MOTOS</b></div>
        </div>
        <div class="auth-brand-sub">Software profesional para talleres de motos.<br>
          Empieza en minutos.</div>
      </div>
      <div class="auth-form">
        <div class="auth-inner">
          <h1>Registra tu taller</h1>
          <p class="subtitle">Creas el taller y tu usuario administrador. Después podrás sumar a tu equipo.</p>
          <div class="card">
            <div class="card-body">
              <div id="register-error"></div>
              <form id="register-form">
                ${exigeCodigo ? field('license_code', 'Código de activación', {
                  required: true,
                  placeholder: 'TM1....',
                  hint: 'Te lo entregó quien te dio el software. Cópialo completo.' }) : ''}
                ${field('business_type', '¿Qué tipo de negocio tienes?', {
                  options: [
                    ['taller', 'Taller de reparación'],
                    ['almacen', 'Almacén de repuestos y accesorios']
                  ],
                  value: 'taller',
                  hint: 'Ajusta qué módulos ves en el menú. Puedes cambiarlo después en Configuración.' })}
                ${field('workshop_name', 'Nombre del taller o almacén', { required: true, placeholder: 'Taller Motos del Sur' })}
                <div class="row">
                  ${field('city', 'Ciudad', { placeholder: 'Medellín' })}
                  ${field('phone', 'Teléfono', { type: 'tel', placeholder: '+57 300 000 0000' })}
                </div>
                ${field('tax_rate', 'IVA por defecto (%)', { type: 'number', value: '19', min: 0, step: '0.01',
                  hint: 'Puedes cambiarlo después, y ajustarlo orden por orden.' })}
                <fieldset style="margin-top:20px">
                  <legend>Tu usuario</legend>
                  ${field('name', 'Tu nombre', { required: true })}
                  ${field('email', 'Correo', { type: 'email', required: true })}
                  <div class="row">
                    ${field('password', 'Contraseña', { type: 'password', required: true, hint: 'Mínimo 8 caracteres' })}
                    ${field('password2', 'Repite la contraseña', { type: 'password', required: true })}
                  </div>
                </fieldset>
                <button type="submit" class="btn btn-primary btn-block">Crear mi taller</button>
              </form>
            </div>
          </div>
          <div class="auth-links">¿Ya tienes cuenta? <a href="#/entrar">Entra aquí</a></div>
        </div>
      </div>
    </div>`;
}
