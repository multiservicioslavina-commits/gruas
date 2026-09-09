import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Punto unico de sincronizacion Ridera -> HubSpot. Lo disparan triggers de
// Postgres (ver migracion 20260909_hubspot_sync_triggers.sql) despues de un
// INSERT en talleres, grueros, almacenes, clubs o riders -- no importa si esa
// fila la creo un edge function propio (registrar-gruero, registrar-club) o
// un INSERT directo con la llave anonima desde una pagina de WordPress que
// no vive en este repo (talleres, almacenes): el trigger dispara igual.
//
// Requiere el secret HUBSPOT_ACCESS_TOKEN (token de una App Privada de
// HubSpot). Sin ese secret, responde 200 con ok:false para no bloquear el
// INSERT que lo disparo (net.http_post es "fire and forget": la fila se
// guarda igual en Supabase pase lo que pase aqui).
//
// Scopes que necesita esa App Privada:
//   crm.objects.contacts.read / crm.objects.contacts.write  (upsert de contactos)
//   crm.objects.deals.write                                 (crear Deals)
//   crm.schemas.contacts.write                              (crear las propiedades
//     personalizadas de abajo la primera vez que hacen falta -- sin este scope
//     el servicio sigue funcionando, simplemente omite el campo que no pudo
//     crear en vez de bloquear el contacto)
const HUBSPOT_TOKEN = Deno.env.get("HUBSPOT_ACCESS_TOKEN") ?? "";
const HUBSPOT_HEADERS = { Authorization: `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
const CONTACTS_UPSERT_URL = "https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert";
const CONTACT_PROPERTIES_URL = "https://api.hubapi.com/crm/v3/properties/contacts";
const DEALS_URL = "https://api.hubapi.com/crm/v3/objects/deals";
const DEAL_PIPELINES_URL = "https://api.hubapi.com/crm/v3/pipelines/deals";

// Nombre de negocio del pipeline/etapa donde cae un registro nuevo de
// Taller/Grua/Almacen. Si no existen en el portal, se crean solos la primera
// vez que hace falta un Deal (ver asegurarPipeline). No son IDs: HubSpot usa
// IDs internos para pipeline/dealstage, así que se resuelven por nombre en
// cada Deal -- evita depender de un secret con un ID que se rompa si alguien
// edita el pipeline a mano.
const PIPELINE_LABEL = "Pipeline de Afiliaciones de Ridera";
const STAGE_LABEL = "Registro Recibido / Por Contactar";

// Monto por defecto del Deal (en la moneda del portal). Vacío = sin monto.
// Configurable sin tocar código vía el secret opcional HUBSPOT_DEAL_AMOUNT.
const HUBSPOT_DEAL_AMOUNT = Deno.env.get("HUBSPOT_DEAL_AMOUNT") || "";

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
  gruero: "Grua",
  almacen: "Almacen",
  club: "Club",
  rider: "Motero",
};

// Tipos que ademas de contacto generan un Deal para seguimiento comercial.
const CREA_DEAL: Tipo[] = ["taller", "gruero", "almacen"];

// Propiedades "de fabrica" de HubSpot que siempre existen -- estas nunca
// deberian fallar por "la propiedad no existe".
const PROPIEDADES_ESTANDAR = new Set(["email", "phone", "firstname", "lastname", "city", "company"]);

// Definicion de las propiedades personalizadas que este servicio usa, para
// poder crearlas por API la primera vez que HubSpot dice que no existen (en
// vez de simplemente omitirlas). Objeto: Contacto.
const PROPERTY_DEFS: Record<string, { label: string; type: string; fieldType: string; options?: { label: string; value: string; displayOrder: number }[] }> = {
  tipo_aliado: {
    label: "Tipo de aliado",
    type: "enumeration",
    fieldType: "select",
    options: (["Taller", "Grua", "Almacen", "Club", "Motero"] as const).map((v, i) => ({ label: v, value: v, displayOrder: i })),
  },
  municipio_cobertura: { label: "Municipio de cobertura", type: "string", fieldType: "text" },
  modelo_moto: { label: "Modelo de moto", type: "string", fieldType: "text" },
  nombre_club: { label: "Nombre del club", type: "string", fieldType: "text" },
  total_miembros_club: { label: "Total de miembros del club", type: "number", fieldType: "number" },
};

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
      if (r.nombre) extra.nombre_club = r.nombre;
      if (datos.miembros) extra.total_miembros_club = String(datos.miembros);
      break;
    }
    case "rider": {
      email = r.correo || "";
      phone = r.telefono || "";
      firstname = r.nombre || "";
      lastname = r.apellido || "";
      city = r.ciudad || "";
      const modelo = [r.moto_marca, r.moto_modelo].filter(Boolean).join(" ").trim();
      if (modelo) extra.modelo_moto = modelo;
      break;
    }
  }

  // El upsert por email es el identificador: sin email no hay con que
  // decidir si es un contacto nuevo o uno que ya existe en HubSpot.
  if (!email) return null;

  if (city) extra.municipio_cobertura = city;

  const props: Record<string, string> = { email, tipo_aliado: TIPO_ALIADO[tipo], ...extra };
  if (phone) props.phone = phone;
  if (firstname) props.firstname = firstname;
  if (lastname) props.lastname = lastname;
  if (city) props.city = city;
  if (company) props.company = company;
  return { email, props };
}

// Crea una propiedad personalizada del objeto Contacto vía API si esta
// definida en PROPERTY_DEFS. Devuelve true si quedo creada (o ya existia),
// false si no se pudo (por ejemplo, falta el scope crm.schemas.contacts.write).
async function crearPropiedadSiFalta(name: string): Promise<boolean> {
  const def = PROPERTY_DEFS[name];
  if (!def) return false; // propiedad estandar mal escrita u otra cosa: no hay nada que crear.

  const res = await fetch(CONTACT_PROPERTIES_URL, {
    method: "POST",
    headers: HUBSPOT_HEADERS,
    body: JSON.stringify({ name, groupName: "contactinformation", ...def }),
  });
  if (res.ok) {
    console.log(`hubspot-sync: propiedad "${name}" creada en el portal de HubSpot`);
    return true;
  }
  const out = await res.json().catch(() => ({}));
  // Si ya existia (carrera entre dos syncs concurrentes) no es un error real.
  if (res.status === 409) return true;
  console.error(`hubspot-sync: no se pudo crear la propiedad "${name}" (¿falta el scope crm.schemas.contacts.write?)`, { status: res.status, out });
  return false;
}

// HubSpot rechaza el objeto COMPLETO si cualquier propiedad enviada no
// existe en el portal (confirmado probandolo en vivo) -- no lo ignora en
// silencio. Por eso: si el error nombra una propiedad personalizada nuestra,
// se intenta crearla por API y reintentar CON ella puesta; si no se pudo
// crear (falta el scope), se quita y se reintenta solo con lo que quede.
async function upsertContactoConReintento(props: Record<string, string>): Promise<{ id: string | null; dropped: string[]; status: number; out: unknown }> {
  let actuales = { ...props };
  const dropped: string[] = [];
  const yaIntentadoCrear = new Set<string>();

  for (let intento = 0; intento < 6; intento++) {
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

    if (!yaIntentadoCrear.has(candidato)) {
      yaIntentadoCrear.add(candidato);
      const creada = await crearPropiedadSiFalta(candidato);
      if (creada) continue; // reintentar con la misma propiedad, ahora deberia existir
    }

    console.error(`hubspot-sync: propiedad "${candidato}" no existe y no se pudo crear -- se omite y se reintenta`, { out });
    delete actuales[candidato];
    dropped.push(candidato);
  }
  return { id: null, dropped, status: 500, out: { error: "Se agotaron los reintentos con las propiedades personalizadas" } };
}

// Busca el pipeline/etapa de afiliaciones por nombre y, si no existe, lo
// crea. Se resuelve por nombre (no por ID fijo) para no depender de un
// secret que se rompa si alguien edita el pipeline a mano en HubSpot.
async function asegurarPipeline(): Promise<{ pipelineId: string; stageId: string } | null> {
  const res = await fetch(DEAL_PIPELINES_URL, { headers: HUBSPOT_HEADERS });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("hubspot-sync: no se pudo leer los pipelines de Deals", res.status, JSON.stringify(out));
    return null;
  }

  const existente = (out as any)?.results?.find((p: any) => p.label === PIPELINE_LABEL);
  if (existente) {
    const stage = existente.stages?.find((s: any) => s.label === STAGE_LABEL) || existente.stages?.[0];
    if (stage) return { pipelineId: existente.id, stageId: stage.id };
  }

  const crear = await fetch(DEAL_PIPELINES_URL, {
    method: "POST",
    headers: HUBSPOT_HEADERS,
    body: JSON.stringify({
      label: PIPELINE_LABEL,
      displayOrder: 0,
      stages: [{ label: STAGE_LABEL, displayOrder: 0, metadata: { probability: "0.1" } }],
    }),
  });
  const outCrear = await crear.json().catch(() => ({}));
  if (!crear.ok) {
    console.error("hubspot-sync: no se pudo crear el pipeline de afiliaciones", crear.status, JSON.stringify(outCrear));
    return null;
  }
  const stage = (outCrear as any)?.stages?.[0];
  return stage ? { pipelineId: (outCrear as any).id, stageId: stage.id } : null;
}

// Deal para seguimiento comercial de talleres/gruas/almacenes nuevos. Falla
// "mejor esfuerzo": si el pipeline no se pudo resolver o crear, se loguea el
// error pero NO se deshace el contacto que ya se creo arriba.
async function crearDeal(contactId: string, tipo: Tipo, nombre: string): Promise<{ ok: boolean; id?: string; error?: unknown }> {
  const pipeline = await asegurarPipeline();
  if (!pipeline) return { ok: false, error: "No se pudo resolver ni crear el pipeline de afiliaciones" };

  const dealname = `${TIPO_ALIADO[tipo]} nuevo - ${nombre}`;
  const properties: Record<string, string> = { dealname, pipeline: pipeline.pipelineId, dealstage: pipeline.stageId };
  if (HUBSPOT_DEAL_AMOUNT) properties.amount = HUBSPOT_DEAL_AMOUNT;

  const res = await fetch(DEALS_URL, {
    method: "POST",
    headers: HUBSPOT_HEADERS,
    body: JSON.stringify({
      properties,
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
    console.error("hubspot-sync: no se pudo crear el Deal", { status: res.status, out, pipeline });
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

  if (!TIPO_ALIADO[tipo]) return json({ ok: false, error: `Tipo desconocido: "${tipo}"` }, 400);

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
