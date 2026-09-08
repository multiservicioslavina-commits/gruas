// Facturación electrónica DIAN vía Factus (https://developers.factus.com.co).
//
// Cada taller tiene su propia cuenta de Factus (client_id/secret + usuario y
// clave), porque cada uno factura bajo su propio NIT — a diferencia de
// WhatsApp, aquí no existe un modo "cuenta compartida". El token de acceso
// se cachea en memoria por taller y se renueva solo; si el proceso se
// reinicia, se vuelve a pedir en la siguiente llamada.
import { badRequest, ApiError } from './errors.js';

const BASE_URLS = {
  sandbox:    'https://api-sandbox.factus.com.co',
  production: 'https://api.factus.com.co'
};

// token cache: workshop_id -> { accessToken, refreshToken, expiresAt }
const tokens = new Map();

export function credentialsFor(workshop) {
  const { factus_client_id, factus_client_secret, factus_username, factus_password } = workshop;
  if (!factus_client_id || !factus_client_secret || !factus_username || !factus_password) return null;
  return {
    clientId: factus_client_id,
    clientSecret: factus_client_secret,
    username: factus_username,
    password: factus_password,
    baseUrl: BASE_URLS[workshop.factus_environment] || BASE_URLS.sandbox
  };
}

async function fetchToken(baseUrl, body) {
  const formBody = new URLSearchParams(body);
  const res = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: formBody
  });
  if (!res.ok) {
    throw new ApiError(502, `Factus rechazó las credenciales de facturación: ${await res.text()}`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000
  };
}

async function ensureToken(workshopId, creds) {
  const cached = tokens.get(workshopId);
  if (cached && Date.now() < cached.expiresAt) return cached.accessToken;

  const state = await fetchToken(creds.baseUrl, {
    grant_type: 'password',
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    username: creds.username,
    password: creds.password
  });
  tokens.set(workshopId, state);
  return state.accessToken;
}

// Traduce los errores de validación de Factus (campo -> motivo) a un solo
// mensaje legible, en vez de un objeto que nadie va a leer en un toast.
function readableError(payload) {
  const errors = payload?.data?.errors;
  if (errors && typeof errors === 'object') {
    return Object.values(errors).join(' ');
  }
  return payload?.data?.message || payload?.message || 'Factus rechazó la factura';
}

async function request(workshop, method, path, body) {
  const creds = credentialsFor(workshop);
  if (!creds) throw badRequest('Este taller no tiene configurada su cuenta de Factus. Configúrala en Ajustes.');

  let token = await ensureToken(workshop.id, creds);
  const doFetch = (bearer) => fetch(`${creds.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  let res = await doFetch(token);
  if (res.status === 401) {
    tokens.delete(workshop.id);
    token = await ensureToken(workshop.id, creds);
    res = await doFetch(token);
  }

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status === 422 ? 400 : 502, readableError(payload));
  }
  return payload;
}

// Crea y valida una factura de venta electrónica ante la DIAN en un solo
// paso. Si algo no cumple las reglas de la DIAN, Factus responde 422 con el
// detalle exacto de qué campo falló — ese mensaje es el que le llega al
// usuario, para que sepa qué corregir.
export function createBill(workshop, input) {
  return request(workshop, 'POST', '/v2/bills/validate', input);
}

// Descarga el PDF ya generado, como base64. `documentNumber` es el que
// asigna Factus (ej. "SETP990000001"), no el consecutivo interno del taller.
export function downloadPdf(workshop, documentNumber) {
  return request(workshop, 'GET', `/v2/bills/${documentNumber}/download-pdf`);
}

// Rangos de numeración (resoluciones DIAN) que el taller tiene registrados
// en Factus. Se usa en Ajustes para que elija con cuál factura.
export function listNumberingRanges(workshop) {
  return request(workshop, 'GET', '/v2/numbering-ranges?per_page=100');
}
