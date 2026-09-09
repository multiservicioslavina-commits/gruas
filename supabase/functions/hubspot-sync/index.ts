import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Punto unico de sincronizacion Ridera -> HubSpot. Lo disparan triggers de
// Postgres (ver migracion 20260909_hubspot_sync_triggers.sql) despues de un
// INSERT en talleres, grueros, almacenes, clubs o riders -- no importa si esa
// fila la creo un edge function propio (registrar-gruero, registrar-club) o
// un INSERT directo con la llave anonima desde una pagina de WordPress que
// no vive en este repo (talleres, almacenes): el trigger dispara igual.
//
// Requiere el secret HUBSPOT_ACCESS_TOKEN (token de una App Privada de
// HubSpot con scopes crm.objects.contacts.read/write y
// crm.objects.deals.write -- NO el "API Key" viejo que HubSpot retiro en
// 2022). Sin ese secret, responde 200 con ok:false para no bloquear el
// INSERT que lo disparo (net.http_post es "fire and forget": la fila se
// guarda igual en Supabase pase lo que pase aqui).
const HUBSPOT_TOKEN = Deno.env.get("HUBSPOT_ACCESS_TOKEN") ?? "";
const HUBSPOT_HEADERS = { Authorization: `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
const CONTACTS_UPSERT_URL = "https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert";
const DEALS_URL = "https://api.hubapi.com/crm/v3/objects/deals";

// Etapa del Sales Pipeline (unica pipeline que existe en el portal al momento
// de escribir esto) donde cae un lead nuevo de taller/grua. HubSpot no trae
// una etapa "Nuevo Lead" de fabrica -- la recomendacion fue renombrar la
// etiqueta de "Appointment Scheduled" a "Nuevo Lead" en Ajustes > Objetos >
// Negocios > Pipelines, lo cual NO cambia este valor interno. Si en cambio
// se crea una etapa nueva de verdad, hay que poner aqui su nombre interno
// via este secret opcional.
const HUBSPOT_DEAL_STAGE = Deno.env.get("HUBSPOT_DEAL_STAGE") || "appointmentscheduled";
const HUBSPOT_DEAL_PIPELINE = Deno.env.get("HUBSPOT_DEAL_PIPELINE") || "default";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

type Tipo = "taller" | "gruero" | "almacen" | "club" | "rider";

const TIPO_REGISTRO: Record<Tipo, string> = {
  taller: "Taller",
  gruero: "Grua",
  almacen: "Almacen",
  club: "Club",
  rider: "Motero",
};

// Tipos que ademas de contacto generan un Deal para seguimiento comercial.
const CREA_DEAL: Tipo[] = ["taller", "gruero"];

// Propiedades "de fabrica" de HubSpot que siempre existen -- estas nunca
// deberian fallar por "la propiedad no existe". Todo lo demas (tipo_registro,
// numero_miembros, whatsapp_link) es personalizado y puede que el portal
// todavia no lo tenga creado.
const PROPIEDADES_ESTANDAR = new Set(["email", "phone", "firstname", "lastname", "city", "company"]);

// Cada tabla trae sus datos en columnas distintas (y en el caso de clubs,
// telefono/correo del lider y cantidad de miembros viven dentro del jsonb
// 'datos'). Esta funcion homogeneiza todas a las propiedades que espera
// HubSpot.
function mapearPropiedades(tipo: Tipo, r: Record<string, any>): { email: string; props: Record<string, string> } | null {
  const datos = r.datos || {};
  let email = "";
  let phone = "";
  let firstname = "";
  let lastname = "";
  let city = "";
  let company = "";
  const extra: Record<string, string> = {};

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
    case "club": {
      email = datos.email || "";
      const wa = datos.whatsapp || datos.lider_tel || "";
      phone = wa;
      firstname = datos.lider || r.nombre || "";
      company = r.nombre || "";
      city = r.ciudad || "";
      if (datos.miembros) extra.numero_miembros = String(datos.miembros);
      if (wa) extra.whatsapp_link = `https://wa.me/${wa.replace(/\D/g, "")}`;
      break;
    }
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

  const props: Record<string, string> = { email, tipo_registro: TIPO_REGISTRO[tipo], ...extra };
  if (phone) props.phone = phone;
  if (firstname) props.firstname = firstname;
  if (lastname) props.lastname = lastname;
  if (city) props.city = city;
  if (company) props.company = company;
  return { email, props };
}

// HubSpot rechaza el objeto COMPLETO si cualquier propiedad enviada no
// existe en el portal (confirmado probandolo en vivo) -- no lo ignora en
// silencio. Sin este blindaje, mientras alguien no haya creado a mano
// "tipo_registro" (o "numero_miembros"/"whatsapp_link" para clubes) en
// HubSpot, NINGUN contacto se crearia, ni siquiera con los campos de
// fabrica. Por eso: si el error nombra una propiedad personalizada nuestra,
// se quita esa propiedad y se reintenta, hasta quedarse solo con las
// estandar si hace falta.
async function upsertContactoConReintento(props: Record<string, string>): Promise<{ id: string | null; dropped: string[]; status: number; out: unknown }> {
  let actuales = { ...props };
  const dropped: string[] = [];

  for (let intento = 0; intento < 5; intento++) {
    const res = await fetch(CONTACTS_UPSERT_URL, {
      method: "POST",
      headers: HUBSPOT_HEADERS,
      body: JSON.stringify({ inputs: [{ idProperty: "email", id: actuales.email, properties: actuales }] }),
    });
    const out = await res.json().catch(() => ({}));

    if (res.ok) {
      const id = (out as any)?.results?.[0]?.id ?? null;
      return { id, dropped, status: res.status, out };
    }

    const textoError = JSON.stringify(out);
    const candidato = Object.keys(actuales).find(
      (k) => !PROPIEDADES_ESTANDAR.has(k) && k !== "email" && textoError.includes(k),
    );
    if (!candidato) {
      // El error no es por una propiedad personalizada nuestra -- no hay
      // nada seguro que recortar, se reporta tal cual.
      return { id: null, dropped, status: res.status, out };
    }
    console.error(`hubspot-sync: propiedad "${candidato}" no existe en el portal, se omite y se reintenta`, { out });
    delete actuales[candidato];
    dropped.push(candidato);
  }
  return { id: null, dropped, status: 500, out: { error: "Se agotaron los reintentos quitando propiedades" } };
}

// Deal para seguimiento comercial de talleres/gruas nuevos. Falla "mejor
// esfuerzo": si el pipeline/etapa configurados no existen, se loguea el
// error pero NO se deshace el contacto que ya se creo arriba.
async function crearDeal(contactId: string, tipo: Tipo, nombre: string): Promise<{ ok: boolean; id?: string; error?: unknown }> {
  const dealname = `${TIPO_REGISTRO[tipo]} nuevo - ${nombre}`;
  const res = await fetch(DEALS_URL, {
    method: "POST",
    headers: HUBSPOT_HEADERS,
    body: JSON.stringify({
      properties: { dealname, pipeline: HUBSPOT_DEAL_PIPELINE, dealstage: HUBSPOT_DEAL_STAGE },
      associations: [
        {
          to: { id: contactId },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }],
        },
      ],
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("hubspot-sync: no se pudo crear el Deal", { status: res.status, out, pipeline: HUBSPOT_DEAL_PIPELINE, stage: HUBSPOT_DEAL_STAGE });
    return { ok: false, error: out };
  }
  return { ok: true, id: (out as any)?.id };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método no soportado" }, 405);

  const body = await req.json().catch(() => ({}));
  const tipo = (body.tipo || "").toString() as Tipo;
  const record = body.record || {};

  if (!TIPO_REGISTRO[tipo]) return json({ ok: false, error: `Tipo desconocido: "${tipo}"` }, 400);

  if (!HUBSPOT_TOKEN) {
    console.error("hubspot-sync: falta el secret HUBSPOT_ACCESS_TOKEN");
    return json({ ok: false, error: "HUBSPOT_ACCESS_TOKEN no configurado" });
  }

  const mapeado = mapearPropiedades(tipo, record);
  if (!mapeado) {
    console.log(`hubspot-sync: ${tipo} sin correo, se omite (no hay con qué hacer upsert)`, { id: record.id });
    return json({ ok: false, omitido: true, error: "Sin correo, no se sincronizó" });
  }

  try {
    const contacto = await upsertContactoConReintento(mapeado.props);
    if (!contacto.id) {
      console.error("hubspot-sync: HubSpot respondió error", { status: contacto.status, out: contacto.out, propiedades: mapeado.props });
      return json({ ok: false, status: contacto.status, error: contacto.out, propiedadesOmitidas: contacto.dropped }, 200);
    }
    console.log("hubspot-sync: contacto sincronizado", { tipo, email: mapeado.email, contactId: contacto.id, propiedadesOmitidas: contacto.dropped });

    let deal: { ok: boolean; id?: string; error?: unknown } | null = null;
    if (CREA_DEAL.includes(tipo)) {
      deal = await crearDeal(contacto.id, tipo, mapeado.props.firstname || mapeado.email);
    }

    return json({ ok: true, contactId: contacto.id, propiedadesOmitidas: contacto.dropped, deal });
  } catch (e) {
    console.error("hubspot-sync: error de red hacia HubSpot", e);
    return json({ ok: false, error: String(e) });
  }
});
