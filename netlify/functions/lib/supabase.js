// lib/supabase.js
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  "Content-Type": "application/json",
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
};

// Busca talleres/almacenes/gruas publicados cuyo titulo o contenido
// coincida con el termino de busqueda (ej. nombre de ciudad).
async function searchDirectory(type, term) {
  const url =
    `${SUPABASE_URL}/rest/v1/wp_sync_content` +
    `?type=eq.${encodeURIComponent(type)}` +
    `&status=eq.publish` +
    `&or=(title.ilike.*${encodeURIComponent(term)}*,content.ilike.*${encodeURIComponent(term)}*)` +
    `&select=title,content,excerpt,link,meta` +
    `&limit=5`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Supabase search falló (${res.status})`);
  return res.json();
}

// Busca productos en almacenes Supabase por nombre, categoria o descripcion.
// Retorna lista de {nombre, categoria, precio, stock, almacen_nombre, ciudad, telefono}.
async function searchProductos(term, limit = 8) {
  const url =
    `${SUPABASE_URL}/rest/v1/almacen_productos` +
    `?select=nombre,categoria,precio,stock,almacen_id,almacenes(nombre,ciudad,telefono)` +
    `&almacenes.status=eq.activo` +
    `&or=(nombre.ilike.*${encodeURIComponent(term)}*,categoria.ilike.*${encodeURIComponent(term)}*,descripcion.ilike.*${encodeURIComponent(term)}*)` +
    `&limit=${limit}`;

  const res = await fetch(url, { headers });
  if (!res.ok) return [];

  const rows = await res.json();
  return rows.map((p) => ({
    nombre: p.nombre,
    categoria: p.categoria,
    precio: p.precio,
    stock: p.stock !== null ? p.stock : "disponible",
    almacen: p.almacenes?.[0]?.nombre || "Almacén",
    ciudad: p.almacenes?.[0]?.ciudad || "",
    telefono: p.almacenes?.[0]?.telefono || "",
  }));
}

async function logMessage(phoneNumber, role, content, intent = null) {
  const url = `${SUPABASE_URL}/rest/v1/rita_messages`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone: phoneNumber, role, content }),
  });
  if (!res.ok) {
    // No detenemos el flujo si falla el log, solo lo reportamos
    console.error("No se pudo loggear mensaje:", await res.text());
  }
}

async function getRecentHistory(phoneNumber, limit = 6) {
  const url =
    `${SUPABASE_URL}/rest/v1/rita_messages` +
    `?phone=eq.${encodeURIComponent(phoneNumber)}` +
    `&select=role,content&order=created_at.desc&limit=${limit}`;

  const res = await fetch(url, { headers });
  if (!res.ok) return [];
  const rows = await res.json();
  return rows.reverse(); // orden cronologico
}

// Cuenta cuantos mensajes ha enviado este numero HOY (control de presupuesto).
// Usa Prefer: count=exact y Range para pedir 0 filas y solo leer el header.
async function countMessagesToday(phoneNumber) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const url =
    `${SUPABASE_URL}/rest/v1/rita_messages` +
    `?phone=eq.${encodeURIComponent(phoneNumber)}` +
    `&role=eq.user` +
    `&created_at=gte.${startOfDay.toISOString()}` +
    `&select=id`;

  const res = await fetch(url, {
    headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
  });
  if (!res.ok) return 0;

  const contentRange = res.headers.get("content-range"); // ej: "0-0/13"
  const total = contentRange ? parseInt(contentRange.split("/")[1], 10) : 0;
  return Number.isNaN(total) ? 0 : total;
}

module.exports = {
  searchDirectory,
  searchProductos,
  logMessage,
  getRecentHistory,
  countMessagesToday,
  upsertContact,
  listOptedInContacts,
  setOptOut,
  getContact,
  setPreferredName,
  checkConsent,
  saveConsent,
};

// Trae el contacto tal como esta ANTES de tocarlo (util para saber si es
// la primera vez que escribe, o si estabamos esperando que dijera su nombre).
async function getContact(phoneNumber) {
  const url =
    `${SUPABASE_URL}/rest/v1/rita_contacts` +
    `?phone_number=eq.${encodeURIComponent(phoneNumber)}` +
    `&select=phone_number,preferred_name,awaiting_name,opted_in`;

  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

// Guarda el nombre que la persona quiere que usemos y marca que ya no
// hay que volver a preguntarlo.
async function setPreferredName(phoneNumber, name) {
  const url = `${SUPABASE_URL}/rest/v1/rita_contacts?phone_number=eq.${encodeURIComponent(phoneNumber)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ preferred_name: name, awaiting_name: false }),
  });
  if (!res.ok) {
    console.error("No se pudo guardar el nombre:", await res.text());
  }
}

// Registra/actualiza que este numero le escribio a Rita (para poder incluirlo
// en broadcasts). Se llama automaticamente en cada mensaje entrante.
async function upsertContact(phoneNumber) {
  const url = `${SUPABASE_URL}/rest/v1/rita_contacts?on_conflict=phone_number`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      whatsapp_number: phoneNumber,
      phone_number: phoneNumber,
      last_seen_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    console.error("No se pudo registrar contacto:", await res.text());
  }
}

// Marca a alguien como dado de baja (ej. escribio BAJA/STOP) para excluirlo
// de futuros broadcasts. No afecta que le siga hablando normal a Rita.
async function setOptOut(phoneNumber, optedIn) {
  const url = `${SUPABASE_URL}/rest/v1/rita_contacts?phone_number=eq.${encodeURIComponent(phoneNumber)}`;
  await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ opted_in: optedIn }),
  });
}

async function checkConsent(phoneNumber) {
  const url =
    `${SUPABASE_URL}/rest/v1/rita_consentimiento` +
    `?telefono=eq.${encodeURIComponent(phoneNumber)}` +
    `&select=acepta`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  const rows = await res.json();
  if (!rows.length) return null;
  return rows[0].acepta;
}

async function saveConsent(phoneNumber, acepta) {
  const now = new Date().toISOString();
  const body = {
    telefono: phoneNumber,
    acepta,
    canal: 'whatsapp',
    categorias: acepta ? ['noticias', 'rodadas', 'marketplace', 'eventos', 'mantenimiento', 'promociones', 'novedades'] : [],
    fecha_consentimiento: acepta ? now : null,
    fecha_revocacion: acepta ? null : now,
    updated_at: now,
  };
  const url = `${SUPABASE_URL}/rest/v1/rita_consentimiento?on_conflict=telefono`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error('saveConsent failed:', await res.text());

  // Sync opted_in in rita_contacts
  await fetch(
    `${SUPABASE_URL}/rest/v1/rita_contacts?phone_number=eq.${encodeURIComponent(phoneNumber)}`,
    { method: 'PATCH', headers, body: JSON.stringify({ opted_in: acepta }) },
  );
}

async function listOptedInContacts() {
  const url = `${SUPABASE_URL}/rest/v1/rita_contacts?opted_in=eq.true&select=phone_number`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Supabase listContacts falló (${res.status})`);
  return res.json();
}
