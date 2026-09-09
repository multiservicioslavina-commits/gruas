import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Punto unico de sincronizacion Ridera -> HubSpot. Lo disparan triggers de
// Postgres (ver migracion 20260909_hubspot_sync_triggers.sql) despues de un
// INSERT en talleres, grueros, almacenes, clubs o riders -- no importa si esa
// fila la creo un edge function propio (registrar-gruero, registrar-club) o
// un INSERT directo con la llave anonima desde una pagina de WordPress que
// no vive en este repo (talleres, almacenes): el trigger dispara igual.
//
// Requiere el secret HUBSPOT_ACCESS_TOKEN (token de una App Privada de
// HubSpot, no el "API Key" viejo que HubSpot retiro en 2022). Sin ese
// secret, responde 200 con ok:false para no bloquear el INSERT que lo
// disparo (net.http_post es "fire and forget": la fila se guarda igual).
const HUBSPOT_TOKEN = Deno.env.get("HUBSPOT_ACCESS_TOKEN") ?? "";
const HUBSPOT_API = "https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

type Tipo = "taller" | "gruero" | "almacen" | "club" | "rider";

const TIPO_ALIADO: Record<Tipo, string> = {
  taller: "Taller",
  gruero: "Grúa",
  almacen: "Almacén",
  club: "Club",
  rider: "Motero",
};

// Cada tabla trae sus datos en columnas distintas (y en el caso de clubs,
// telefono y correo del lider viven dentro del jsonb 'datos'). Esta funcion
// homogeneiza todas a las propiedades que espera HubSpot.
function mapearPropiedades(tipo: Tipo, r: Record<string, any>): Record<string, string> | null {
  const datos = r.datos || {};
  let email = "";
  let phone = "";
  let firstname = "";
  let lastname = "";
  let city = "";
  let company = "";

  switch (tipo) {
    case "taller":
    case "almacen":
      email = r.email || "";
      phone = r.telefono || "";
      firstname = r.nombre || "";
      company = r.nombre || "";
      city = r.ciudad || "";
      break;
    case "gruero":
      email = r.email || "";
      phone = r.telefono || "";
      firstname = r.nombre || "";
      city = r.ciudad || "";
      break;
    case "club":
      email = datos.email || "";
      phone = datos.whatsapp || datos.lider_tel || "";
      firstname = datos.lider || r.nombre || "";
      company = r.nombre || "";
      city = r.ciudad || "";
      break;
    case "rider":
      email = r.correo || "";
      phone = r.telefono || "";
      firstname = r.nombre || "";
      lastname = r.apellido || "";
      city = r.ciudad || "";
      break;
  }

  // El upsert por email es el identificador: sin email no hay con que
  // decidir si es un contacto nuevo o uno que ya existe en HubSpot.
  if (!email) return null;

  const props: Record<string, string> = { email, tipo_aliado: TIPO_ALIADO[tipo] };
  if (phone) props.phone = phone;
  if (firstname) props.firstname = firstname;
  if (lastname) props.lastname = lastname;
  if (city) props.city = city;
  if (company) props.company = company;
  return props;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método no soportado" }, 405);

  const body = await req.json().catch(() => ({}));
  const tipo = (body.tipo || "").toString() as Tipo;
  const record = body.record || {};

  if (!TIPO_ALIADO[tipo]) return json({ ok: false, error: `Tipo desconocido: "${tipo}"` }, 400);

  if (!HUBSPOT_TOKEN) {
    console.error("hubspot-sync: falta el secret HUBSPOT_ACCESS_TOKEN");
    return json({ ok: false, error: "HUBSPOT_ACCESS_TOKEN no configurado" });
  }

  const propiedades = mapearPropiedades(tipo, record);
  if (!propiedades) {
    console.log(`hubspot-sync: ${tipo} sin correo, se omite (no hay con qué hacer upsert)`, { id: record.id });
    return json({ ok: false, omitido: true, error: "Sin correo, no se sincronizó" });
  }

  try {
    const res = await fetch(HUBSPOT_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs: [{ idProperty: "email", id: propiedades.email, properties: propiedades }],
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      // El error mas comun aqui: la propiedad personalizada "tipo_aliado" no
      // existe todavia en el portal de HubSpot (hay que crearla a mano una
      // vez, Ajustes > Propiedades > Contacto, antes de que esto funcione).
      console.error("hubspot-sync: HubSpot respondió error", { status: res.status, out, propiedades });
      return json({ ok: false, status: res.status, error: out }, 200);
    }
    console.log("hubspot-sync: contacto sincronizado", { tipo, email: propiedades.email });
    return json({ ok: true, hubspotStatus: res.status, out });
  } catch (e) {
    console.error("hubspot-sync: error de red hacia HubSpot", e);
    return json({ ok: false, error: String(e) });
  }
});
