// Cliente de la API y estado de sesión.
const TOKEN_KEY = 'taller_motos_token';

export const session = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  set token(value) {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  },
  user: null,
  workshop: null,
  get role() { return this.user?.role; },
  can(...roles) { return this.role === 'admin' || roles.includes(this.role); },
  // Un taller sin plan asignado (instalación sin código, o activado antes de
  // que existiera esta distinción) tiene acceso completo: igual que en el
  // backend (requirePlan), nunca se le cierra una función a quien nunca
  // compró un plan.
  hasPlan(minPlan) {
    const plan = this.workshop?.license_plan;
    if (!plan) return true;
    const rank = { basico: 0, completo: 1, premium: 2 };
    return (rank[plan] ?? rank.completo) >= rank[minPlan];
  }
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, body, options = {}) {
  const headers = {};
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (session.token && !options.anonymous) headers.Authorization = `Bearer ${session.token}`;

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined
        : (body instanceof FormData ? body : JSON.stringify(body))
    });
  } catch {
    throw new ApiError(0, 'Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.');
  }

  if (response.status === 204) return null;

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }

  if (!response.ok) {
    // El token venció o el usuario dejó de estar activo: de vuelta al acceso.
    if (response.status === 401 && session.token && !options.anonymous) {
      session.token = null;
      session.user = null;
      location.hash = '#/entrar';
    }
    throw new ApiError(response.status, data?.error || 'Ocurrió un error inesperado', data?.details);
  }
  return data;
}

export const api = {
  get:    (path, options)       => request('GET', path, undefined, options),
  post:   (path, body, options) => request('POST', path, body ?? {}, options),
  patch:  (path, body, options) => request('PATCH', path, body ?? {}, options),
  delete: (path, options)       => request('DELETE', path, undefined, options),
  upload: (path, formData)      => request('POST', path, formData)
};

// Carga el usuario y su taller a partir del token guardado.
export async function loadSession() {
  if (!session.token) return false;
  try {
    const me = await api.get('/auth/me');
    session.user = me.user;
    session.workshop = me.workshop;
    return true;
  } catch {
    session.token = null;
    return false;
  }
}

export function logout() {
  session.token = null;
  session.user = null;
  session.workshop = null;
  location.hash = '#/entrar';
}
