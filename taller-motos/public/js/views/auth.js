// Acceso y alta de un taller nuevo.
import { api, session } from '../api.js';
import { esc, field, errorBox, toast } from '../ui.js';
import { onMount } from '../app.js';

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
    <div class="centered">
      <div class="panel">
        <div class="panel-brand">TALLER MOTOS</div>
        <div class="card">
          <div class="card-body">
            <h1>Entra a tu taller</h1>
            <p class="muted small" style="margin:6px 0 20px">
              Órdenes de trabajo, clientes, inventario y caja.</p>
            <div id="login-error"></div>
            <form id="login-form">
              ${field('email', 'Correo', { type: 'email', required: true, placeholder: 'tu@taller.com' })}
              ${field('password', 'Contraseña', { type: 'password', required: true })}
              <button type="submit" class="btn btn-primary btn-block" style="margin-top:6px">Entrar</button>
            </form>
          </div>
        </div>
        <p class="center small muted">¿Aún no tienes taller registrado?
          <a href="#/registrar">Crea uno</a></p>
        <p class="center small muted" style="margin-top:10px">
          ¿Eres cliente y quieres ver tu moto? <a href="#/orden/">Consulta con tu código</a></p>
      </div>
    </div>`;
}

export async function registerView() {
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
    <div class="centered">
      <div class="panel wide">
        <div class="panel-brand">TALLER MOTOS</div>
        <div class="card">
          <div class="card-body">
            <h1>Registra tu taller</h1>
            <p class="muted small" style="margin:6px 0 20px">
              Creas el taller y tu usuario administrador. Después podrás sumar a tu equipo.</p>
            <div id="register-error"></div>
            <form id="register-form">
              ${field('workshop_name', 'Nombre del taller', { required: true, placeholder: 'Taller Motos del Sur' })}
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
        <p class="center small muted">¿Ya tienes cuenta? <a href="#/entrar">Entra aquí</a></p>
      </div>
    </div>`;
}
