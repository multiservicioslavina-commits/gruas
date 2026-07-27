// ─────────────────────────────────────────────────────────────────
// Rita v2 — Asistente motero de Ridera con tool use
//
// A diferencia de v1, que consultaba nueve fuentes en cada mensaje y
// volcaba todo al prompt, aqui Claude decide que herramienta usar y
// solo se consulta lo que hace falta. Eso permite que Rita ademas
// ejecute acciones, no solo responda.
// ─────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { TOOL_SCHEMAS, ejecutarHerramienta, estadoConsentimiento, norm } from "./tools.ts";
import { puedeEscuchar, puedeHablar, sintetizar, transcribir } from "./voz.ts";

const WA_TOKEN      = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const RITA_PHONE    = Deno.env.get("RITA_PHONE_ID") ?? "1238785075974458";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const VERIFY_TOKEN  = Deno.env.get("RITA_VERIFY_TOKEN") ?? "ridera_rita_2026";
const SB_URL        = Deno.env.get("SUPABASE_URL")!;
const SB_KEY        = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH         = "https://graph.facebook.com/v25.0";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOOL_ROUNDS = 4;

const supabase = createClient(SB_URL, SB_KEY);

// ─── Memoria de conversacion ────────────────────────────────────
async function getHistory(phone: string, limit = 10): Promise<{ role: string; content: string }[]> {
  const { data } = await supabase
    .from("rita_messages")
    .select("role, content")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data || []).reverse();
}

async function saveMessage(phone: string, role: "user" | "assistant", content: string) {
  await supabase.from("rita_messages").insert({ phone, role, content });
  const { data: viejos } = await supabase
    .from("rita_messages")
    .select("id")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .range(20, 999);
  if (viejos?.length) {
    await supabase.from("rita_messages").delete().in("id", viejos.map(r => r.id));
  }
}

// ─── Registro guiado ────────────────────────────────────────────
const MARCAS = ["bmw","honda","yamaha","ktm","triumph","ducati","suzuki","kawasaki","aprilia","harley","royal enfield","bajaj","tvs","hero","benelli","cfmoto","zongshen"];

async function getConvState(phone: string): Promise<{ state: string; data: Record<string, string> }> {
  const { data } = await supabase
    .from("rita_conversations")
    .select("state, data")
    .eq("phone", phone)
    .maybeSingle();
  return data || { state: "idle", data: {} };
}

async function setConvState(phone: string, state: string, convData: Record<string, string> = {}) {
  await supabase.from("rita_conversations").upsert(
    { phone, state, data: convData, updated_at: new Date().toISOString() },
    { onConflict: "phone" },
  );
}

async function clearConvState(phone: string) {
  await supabase.from("rita_conversations").delete().eq("phone", phone);
}

function parseMoto(text: string): { marca: string; modelo: string; cc: number | null; anio: string | null } | null {
  const t = text.trim();
  if (t.split(/\s+/).length < 2) return null;
  const marca = MARCAS.find(m => norm(t).includes(m));
  if (!marca) return null;
  const anio = t.match(/\b(19|20)\d{2}\b/);
  const cc = t.match(/\b(\d{2,4})\s*cc\b/i) || t.match(/\b(\d{3,4})\b(?!.*\b(19|20)\d{2})/);
  const modelo = t.split(/\s+/).filter(w => {
    const wn = norm(w);
    return !MARCAS.some(m => m.split(" ")[0] === wn)
      && !/^(19|20)\d{2}$/.test(w)
      && !/^\d{2,4}cc$/i.test(w);
  }).join(" ");
  return {
    marca: marca.charAt(0).toUpperCase() + marca.slice(1),
    modelo,
    cc: cc ? parseInt(cc[1]) : null,
    anio: anio ? anio[0] : null,
  };
}

async function handleRegistration(
  phone: string,
  message: string,
  conv: { state: string; data: Record<string, string> },
): Promise<string | null> {
  const m = norm(message);

  if (conv.state === "waiting_name") {
    if (m.length < 2 || m.length > 60) return "No pille bien el nombre, como te llamas?";
    const nombre = message.trim().split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    await setConvState(phone, "waiting_moto", { ...conv.data, nombre });
    return `${nombre}! Buena, parce. Que moto tienes? Dime marca y modelo:\nHonda CB500X 2022\nYamaha MT-07 700cc\n\nSi no tienes moto aun, dime "no tengo" y listo.`;
  }

  if (conv.state === "waiting_moto") {
    const nombre = conv.data.nombre || "Piloto";
    const telefono = phone.replace(/^57/, "");

    if (/no tengo|ninguna|no moto|sin moto|todavia no|aun no/.test(m)) {
      await supabase.from("riders").insert({
        id: crypto.randomUUID(), nombre, telefono, created_at: new Date().toISOString(),
      });
      await clearConvState(phone);
      return `Listo ${nombre}, quedaste registrado! En que te ayudo?`;
    }

    const pareceMoto = MARCAS.some(mm => m.includes(mm.split(" ")[0])) || /\d{3,4}\s*cc/i.test(m);
    if (!pareceMoto && m.split(/\s+/).length > 3) {
      await supabase.from("riders").insert({
        id: crypto.randomUUID(), nombre, telefono, created_at: new Date().toISOString(),
      });
      await clearConvState(phone);
      return null; // se sale del flujo y responde Claude
    }

    const moto = parseMoto(message);
    if (!moto) return "No pille la moto. Intenta: Honda CB500X 2022\n\nO dime \"no tengo\" y seguimos";

    await supabase.from("riders").insert({
      id: crypto.randomUUID(),
      nombre,
      telefono,
      moto_marca: moto.marca,
      moto_modelo: moto.anio || moto.modelo,
      moto_cc: moto.cc,
      tipo_moto: moto.modelo,
      created_at: new Date().toISOString(),
    });
    await clearConvState(phone);
    const motoStr = [moto.marca, moto.modelo, moto.cc ? `${moto.cc}cc` : "", moto.anio].filter(Boolean).join(" ");
    return `Quedaste registrado con tu ${motoStr}! Ahora te doy info de mantenimiento, alertas de SOAT y mas. Que necesitas?`;
  }

  if (conv.state === "waiting_city") {
    const tel = phone.replace(/^57/, "");
    await supabase.from("riders").update({ ciudad: message.trim() })
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`);
    await clearConvState(phone);
    return "Dale, guarde tu ciudad. En que te ayudo?";
  }

  return null;
}

// ─── Fecha y hora actual: Claude no la sabe por si solo ──────────
function bloqueFechaHora(): string {
  const ahora = new Date();
  const fecha = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(ahora);
  const hora = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(ahora);

  return `FECHA Y HORA ACTUAL EN COLOMBIA:
Hoy es ${fecha}. Son las ${hora}.
Si te preguntan que dia es hoy o que hora es, responde directo con este dato, nunca digas que no sabes.
Usalo tambien para: pico y placa de hoy sin que te den placa (identifica el dia de la
semana aqui y busca esa fila en la tabla de rotacion), y para calcular fechas relativas
("manana", "el viernes", "en 3 dias") al crear un recordatorio.`;
}

// ─── Pico y placa: dato estatico, no necesita consulta ──────────
function bloquePicoPlaca(): string {
  const esSegundoSemestre = new Date() >= new Date("2026-08-03T00:00:00-05:00");
  const rotacion = esSegundoSemestre
    ? ["Lunes: 5 y 8", "Martes: 1 y 4", "Miercoles: 0 y 2", "Jueves: 3 y 6", "Viernes: 7 y 9"]
    : ["Lunes: 1 y 7", "Martes: 0 y 3", "Miercoles: 4 y 6", "Jueves: 5 y 9", "Viernes: 2 y 8"];
  const vigencia = esSegundoSemestre
    ? "Rotacion vigente desde el 3 de agosto de 2026."
    : "Rotacion vigente del 2 de febrero al 31 de julio de 2026. Cambia el 3 de agosto de 2026.";

  return `PICO Y PLACA - MEDELLIN Y AREA METROPOLITANA
${vigencia}
Horario: 5:00 a.m. a 8:00 p.m. Sabados y domingos NO aplica.

COMO LEER LA PLACA (importante, las placas colombianas mezclan letras y numeros):
- Moto: formato tres letras, dos numeros y una letra. Ej: TQK12F.
  Ignora las letras y toma el PRIMER numero. En TQK12F el primer numero es 1.
- Carro: formato tres letras y tres numeros. Ej: ABC123.
  Ignora las letras y toma el ULTIMO numero. En ABC123 el ultimo numero es 3.
Nunca digas que la placa no tiene numeros por empezar con letras: siempre los tiene.

Rotacion (aplica igual a motos y carros, cambia solo cual digito se mira):
${rotacion.map(r => `- ${r}`).join("\n")}

Si el rider te da una placa, NO resuelvas la tabla de cabeza: llama a
consultar_pico_placa y repite el dia que te devuelva, ese y ninguno mas.
Esta tabla queda aqui solo para explicar la regla general.

Si pregunta "que pico y placa es hoy" SIN darte una placa, no le pidas la
placa de una: usa el dia de la semana del bloque FECHA Y HORA ACTUAL de
arriba y dile que digitos (de moto y de carro) estan restringidos hoy segun
la rotacion. Solo pide la placa si quiere saber si a ELLA especificamente le
toca.

VIAS EXENTAS (se puede circular):
Avenida Regional y Autopista Sur (en Medellin), Via Las Palmas, Via 4.1 al
Occidente Antioqueno, conexion Avenida 33 entre Autopista Sur y Las Palmas,
Calle 10 entre el eje vial del rio y la Terminal del Sur, y los corregimientos
de Medellin.

VEHICULOS EXENTOS:
Electricos de cero emisiones, dedicados a gas combustible, e hibridos
registrados en el RUNT.

Fuente: Area Metropolitana del Valle de Aburra / medellin.gov.co`;
}

// ─── System prompt ──────────────────────────────────────────────
function buildSystemPrompt(consentimiento: { registrado: boolean; acepta: boolean }, conVoz = false): string {
  const bloqueEstilo = conVoz
    ? `COMO HABLAS (MODO VOZ - esta conversacion es por audio, tu respuesta se convierte a voz):
- Esta es la regla mas importante de este mensaje: NUNCA uses asteriscos, guiones, vinetas, encabezados ni URLs en tu respuesta. Nada de eso se puede escuchar, y si lo escribes se lee literal ("asterisco", "guion") sonando fatal.
- Escribe como si estuvieras charlando de frente con el parcero, en frases cortas y corridas, una idea detras de otra.
- Si hay un link que le sirve (ruta, tramite), no lo escribas: dile que te lo manda tambien por escrito y nombra solo el sitio (ej. "te lo mando por ridera.com.co"), nunca la direccion completa.
- Maximo 3 a 4 frases. Hablando toma mas tiempo que leyendo.
- Los numeros dilos como se dirian hablando (ej. "ciento treinta y ocho kilometros", no "138 km").`
    : `COMO HABLAS:
- WhatsApp entre amigos moteros. Frases cortas, naturales.
- "parce", "dale", "pilas", "bacano" cuando fluyan natural.
- 1 a 3 emojis por mensaje. NO empieces siempre con "Hola".
- Maximo 6 a 8 lineas. Un saludo simple se responde en 1 a 3 lineas.
- Nada de listas con vinetas salvo que estes dando links o datos tecnicos.`;

  const bloqueConsentimiento = consentimiento.registrado
    ? `El rider ya definio sus preferencias de comunicacion (acepta: ${consentimiento.acepta}). No le vueltas a preguntar salvo que el saque el tema.`
    : `CONSENTIMIENTO PENDIENTE: este rider todavia no ha dicho si quiere recibir comunicaciones.
Al final de tu respuesta, y solo una vez, preguntale de forma natural algo como:
"Por cierto, quieres que te avise de rodadas, noticias y novedades de Ridera? Puedes decirme que si o que no, y cambiarlo cuando quieras."
Cuando responda, llama a registrar_consentimiento con su decision. Si acepta sin
detallar categorias, incluye las ocho. Si dice que no, registralo igual con acepta en false.
No insistas si ya preguntaste en este mensaje.

REGLA DURA: si el rider contesta si o no a esa pregunta, tu PRIMERA accion es
llamar a registrar_consentimiento. Nunca escribas "anotado", "listo" ni nada
parecido sin haber llamado la herramienta: seria decirle que quedo guardado
cuando no quedo nada, y ese registro es un requisito legal, no un detalle.`;

  return `Eres Rita, la parcera motera de Ridera (ridera.com.co). Motociclista colombiana, calida, directa, con sabor paisa sin exagerar.

${bloqueFechaHora()}

${bloqueEstilo}

REGLA ABSOLUTA - NO INVENTAR:
- Los datos concretos salen de tus herramientas, nunca de tu memoria.
- Precios, distancias, telefonos, direcciones, capacidades de aceite, horarios,
  nombres de talleres o de rutas: si no vino de una herramienta, no lo digas.
- Si una herramienta no encuentra nada:
  1. Prueba otras herramientas relacionadas (ej. si buscar_ruta falla, usa buscar_en_ridera)
  2. Si nada funciona y el rider lo necesita urgente, usa buscar_web_verificado
     pero SIEMPRE verifica que sea fuente oficial (.gov.co, .edu.co, noticias
     establecidas) y CITA LA FUENTE completa en tu respuesta.
  3. Si no hay fuente verificada, dilo con naturalidad: "Ahi si no tengo esa
     info verificada todavia, parce. Consulta directamente en [sitio oficial]"
- Un dato falso hace mas dano que un "no se". Prefiere siempre el "no se".

COMO USAS LAS HERRAMIENTAS:
- Llama solo las que hagan falta para lo que te pidieron. No consultes de mas.
- Si te preguntan por su moto o sus documentos sin dar detalles, usa mi_perfil primero.
- Si el rider tiene moto registrada y pregunta de mantenimiento sin decir cual,
  usa la suya.
- Antes de recomendar rutas o planes, mira consultar_preferencias para personalizar.
- Cuando ejecutes una accion (recordatorio, preferencia, consentimiento),
  confirmasela en una linea, sin ceremonia.
- Para saludos, charla y preguntas generales de moto no necesitas herramientas.
- info_tramites te devuelve URLs oficiales: PEGALAS TAL CUAL en tu respuesta,
  una por linea con el nombre de la entidad. De nada sirve decir "entra a la
  pagina de la aseguradora" sin dar el link que ya tienes en la mano.
- RUTAS - REGLA DURA: buscar_ruta solo consulta una base interna que NO se
  actualiza sola; ridera.com.co sube rutas nuevas todos los dias y esa base
  se puede quedar atras. Si buscar_ruta no encuentra la ruta que piden,
  SIEMPRE llama tambien a buscar_en_ridera con el nombre del destino antes de
  decirle al rider que no la tienes. Solo despues de que las DOS fallen le
  dices que no esta documentada todavia.
- BUSQUEDA WEB VERIFICADA: si ninguna herramienta especifica encuentra respuesta
  y el rider necesita informacion urgente, puedes llamar a buscar_web_verificado.
  SIEMPRE verifica que la fuente sea confiable (.gov.co/.edu.co para datos
  oficiales, Wikipedia para generales, noticias establecidas para actualidad).
  SIEMPRE cita la fuente en tu respuesta. Si no encuentras fuente verificada,
  dile al rider que no tienes esa info y que consulte directamente en la fuente oficial.

CUANTO ESCRIBES:
- Corto. Es WhatsApp, no un blog. Seis a ocho lineas es el techo, no la meta.
- Si una herramienta devuelve mucho, quedate con lo que le sirve al rider ahora
  y ofrecele el resto: "¿Quieres que te cuente mas de alguna?"
- Rutas: destino, km, duracion, dificultad, un tip y el link. Nada mas.
- Listados (motos, talleres): maximo tres, en una linea cada uno.

${bloquePicoPlaca()}

OTROS TEMAS:
- Grua o moto varada: gruas.ridera.com.co o el boton SOS de la app Ridera.
- Rider no registrado: sugierele registrarse cada 3 o 4 intercambios, sin insistir.

${bloqueConsentimiento}`;
}

// ─── Bucle agentico ─────────────────────────────────────────────
type Bloque = { type: string; [k: string]: unknown };
type Mensaje = { role: string; content: string | Bloque[] };

async function llamarClaude(system: string, messages: Mensaje[]): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: TOOL_SCHEMAS,
      messages,
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return await res.json();
}

function textoDe(bloques: Bloque[]): string {
  return bloques
    .filter(b => b.type === "text")
    .map(b => String(b.text ?? ""))
    .join("\n")
    .trim();
}

async function responder(
  message: string,
  history: { role: string; content: string }[],
  phone: string,
  consentimiento: { registrado: boolean; acepta: boolean },
  conVoz = false,
): Promise<string> {
  const system = buildSystemPrompt(consentimiento, conVoz);
  const messages: Mensaje[] = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: "user", content: message },
  ];

  let huboHerramientas = false;

  for (let ronda = 0; ronda < MAX_TOOL_ROUNDS; ronda++) {
    const respuesta = await llamarClaude(system, messages);
    const bloques = (respuesta.content ?? []) as Bloque[];

    if (respuesta.stop_reason !== "tool_use") {
      const texto = textoDe(bloques);
      if (texto) return texto;
      if (!huboHerramientas) return "";
      // Cerro sin escribir nada, cosa que suele pasar despues de ejecutar
      // una accion. El rider quedaria sin respuesta, asi que se le pide el
      // cierre en lugar de devolver vacio.
      const cierre = await llamarClaude(
        `${system}\n\nYa ejecutaste lo que hacia falta. Escribe ahora la respuesta para el rider y confirmale en una linea lo que hiciste.`,
        messages,
      );
      return textoDe((cierre.content ?? []) as Bloque[]);
    }

    huboHerramientas = true;
    const llamadas = bloques.filter(b => b.type === "tool_use");
    messages.push({ role: "assistant", content: bloques });

    const resultados = await Promise.all(
      llamadas.map(async (llamada) => ({
        type: "tool_result",
        tool_use_id: String(llamada.id),
        content: await ejecutarHerramienta(
          String(llamada.name),
          (llamada.input ?? {}) as Record<string, never>,
          phone,
        ),
      })),
    );

    messages.push({ role: "user", content: resultados as Bloque[] });
  }

  // Se agotaron las rondas: pedimos el cierre sin mas herramientas.
  const cierre = await llamarClaude(
    system + "\n\nYa consultaste suficientes herramientas. Responde ahora con lo que tienes, sin llamar mas.",
    messages,
  );
  return textoDe((cierre.content ?? []) as Bloque[]);
}

// ─── WhatsApp: entrada y salida ─────────────────────────────────
async function descargarMedia(mediaId: string): Promise<Uint8Array> {
  const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { "Authorization": `Bearer ${WA_TOKEN}` },
  });
  const meta = await metaRes.json();
  const audioRes = await fetch(meta.url, { headers: { "Authorization": `Bearer ${WA_TOKEN}` } });
  return new Uint8Array(await audioRes.arrayBuffer());
}

async function enviarTexto(to: string, texto: string): Promise<unknown> {
  const res = await fetch(`${GRAPH}/${RITA_PHONE}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: texto } }),
  });
  return res.json();
}

async function enviarAudio(to: string, audio: Uint8Array): Promise<unknown> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "audio/ogg; codecs=opus");
  form.append("file", new Blob([audio], { type: "audio/ogg; codecs=opus" }), "rita.ogg");

  const upload = await fetch(`${GRAPH}/${RITA_PHONE}/media`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${WA_TOKEN}` },
    body: form,
  });
  const { id: mediaId } = await upload.json();
  if (!mediaId) throw new Error("No se pudo subir el audio a WhatsApp");

  const res = await fetch(`${GRAPH}/${RITA_PHONE}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "audio", audio: { id: mediaId } }),
  });
  return res.json();
}

// Limpia el markdown de WhatsApp antes de sintetizar: leido en voz alta,
// "asterisco asterisco" y URLs completas suenan robotico, no conversacional.
function textoParaVoz(texto: string): string {
  return texto
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[_~`#]/g, "")
    .replace(/^[-•]\s*/gm, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ". ")
    .replace(/\s{2,}/g, " ")
    .replace(/\.\s*\./g, ".")
    .trim();
}

async function entregar(to: string, texto: string, conVoz: boolean): Promise<void> {
  if (conVoz && puedeHablar()) {
    try {
      await enviarAudio(to, await sintetizar(textoParaVoz(texto)));
      return;
    } catch (e) {
      console.error("Fallo el envio por voz, cae a texto:", e);
      await supabase.from("rita_acciones_log").insert({
        telefono: to,
        herramienta: "sintesis_debug",
        parametros: {},
        ok: false,
        error: String(e instanceof Error ? e.message : e).slice(0, 500),
      });
    }
  }
  await enviarTexto(to, texto);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// ─── Handler ────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(url.searchParams.get("hub.challenge"), { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const body = await req.json();

    // Modo prueba: permite ejercitar el motor sin pasar por WhatsApp.
    if (body?.test === true) {
      const phone = String(body.phone ?? "573000000000");
      const texto = String(body.message ?? "");
      const [history, consentimiento] = await Promise.all([
        getHistory(phone, 10),
        estadoConsentimiento(phone),
      ]);
      const reply = await responder(texto, history, phone, consentimiento);
      return json({ ok: true, reply });
    }

    const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return json({ ok: true, skip: "sin mensaje" });

    const from = String(msg.from ?? "");
    let message = "";
    let conVoz = false;

    if (msg.type === "audio" && msg.audio) {
      if (!puedeEscuchar()) {
        await enviarTexto(from, "Parce, por ahora no puedo escuchar audios. Me lo escribes?");
        return json({ ok: true, skip: "sin proveedor de voz" });
      }
      try {
        message = await transcribir(
          await descargarMedia(msg.audio.id),
          msg.audio.mime_type || "audio/ogg",
        );
        conVoz = true;
      } catch (e) {
        console.error("Transcripcion fallo:", e);
        await supabase.from("rita_acciones_log").insert({
          telefono: from,
          herramienta: "transcripcion_debug",
          parametros: {},
          ok: false,
          error: String(e instanceof Error ? e.message : e).slice(0, 500),
        });
        await enviarTexto(from, "No pude escuchar ese audio. Me lo repites?");
        return json({ ok: true, error: "transcripcion" });
      }
      if (!message.trim()) {
        await enviarTexto(from, "Uy, no pille que dijiste. Me lo repites?");
        return json({ ok: true, skip: "audio vacio" });
      }
    } else if (msg.text?.body) {
      message = msg.text.body;
    } else {
      return json({ ok: true, skip: "tipo no soportado" });
    }

    await saveMessage(from, "user", message);

    // El registro guiado tiene prioridad sobre el bucle de herramientas.
    const conv = await getConvState(from);
    if (conv.state !== "idle") {
      const respuestaRegistro = await handleRegistration(from, message, conv);
      if (respuestaRegistro) {
        await saveMessage(from, "assistant", respuestaRegistro);
        await entregar(from, respuestaRegistro, conVoz);
        return json({ ok: true, flujo: "registro" });
      }
    }

    if (/quiero registrarme|registrarme|registrame|inscribirme/.test(norm(message))) {
      const { data: yaExiste } = await supabase
        .from("riders")
        .select("id")
        .or(`telefono.eq.${from.replace(/^57/, "")},telefono.eq.${from}`)
        .maybeSingle();
      if (!yaExiste) {
        await setConvState(from, "waiting_name", {});
        const saludo = "Dale! Vamos a registrarte para darte info personalizada de tu moto. Como te llamas?";
        await saveMessage(from, "assistant", saludo);
        await entregar(from, saludo, conVoz);
        return json({ ok: true, flujo: "inicio_registro" });
      }
    }

    const [history, consentimiento] = await Promise.all([
      getHistory(from, 10),
      estadoConsentimiento(from),
    ]);

    let reply = "";
    try {
      reply = await responder(message, history, from, consentimiento, conVoz);
    } catch (e) {
      console.error("El motor fallo:", e);
    }
    if (!reply.trim()) reply = "Uy parce, algo se cruzo por aca. Me lo repites?";
    if (reply.length > 1600) reply = reply.slice(0, 1580) + ".\n.\nMas en ridera.com.co";

    await saveMessage(from, "assistant", reply);
    await entregar(from, reply, conVoz);

    return json({ ok: true });
  } catch (e) {
    console.error("Rita v2 error:", e);
    // Devolvemos 200 para que Meta no reintente en bucle.
    return json({ ok: false, error: String(e) });
  }
});
