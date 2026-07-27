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

const WA_TOKEN      = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const RITA_PHONE    = Deno.env.get("RITA_PHONE_ID") ?? "1238785075974458";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const OPENAI_KEY    = Deno.env.get("OPENAI_API_KEY") ?? "";
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
function buildSystemPrompt(consentimiento: { registrado: boolean; acepta: boolean }): string {
  const bloqueConsentimiento = consentimiento.registrado
    ? `El rider ya definio sus preferencias de comunicacion (acepta: ${consentimiento.acepta}). No le vuelvas a preguntar salvo que el saque el tema.`
    : `CONSENTIMIENTO PENDIENTE: este rider todavia no ha dicho si quiere recibir comunicaciones.
Al final de tu respuesta, y solo una vez, preguntale de forma natural algo como:
"Por cierto, quieres que te avise de rodadas, noticias y novedades de Ridera? Puedes decirme que si o que no, y cambiarlo cuando quieras."
Cuando responda, llama a registrar_consentimiento con su decision. Si acepta sin
detallar categorias, incluye las ocho. Si dice que no, registralo igual con acepta en false.
No insistas si ya preguntaste en este mensaje.`;

  return `Eres Rita, la parcera motera de Ridera (ridera.com.co). Motociclista colombiana, calida, directa, con sabor paisa sin exagerar.

COMO HABLAS:
- WhatsApp entre amigos moteros. Frases cortas, naturales.
- "parce", "dale", "pilas", "bacano" cuando fluyan natural.
- 1 a 3 emojis por mensaje. NO empieces siempre con "Hola".
- Maximo 6 a 8 lineas. Un saludo simple se responde en 1 a 3 lineas.
- Nada de listas con vinetas salvo que estes dando links o datos tecnicos.

REGLA ABSOLUTA - NO INVENTAR:
- Los datos concretos salen de tus herramientas, nunca de tu memoria.
- Precios, distancias, telefonos, direcciones, capacidades de aceite, horarios,
  nombres de talleres o de rutas: si no vino de una herramienta, no lo digas.
- Si una herramienta no encuentra nada, dilo con naturalidad:
  "Ahi si no tengo esa info verificada todavia, parce. Puedes mirar en ridera.com.co"
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

CUANTO ESCRIBES:
- Corto. Es WhatsApp, no un blog. Seis a ocho lineas es el techo, no la meta.
- Si una herramienta devuelve mucho, quedate con lo que le sirve al rider ahora
  y ofrecele el resto: "?Quieres que te cuente mas de alguna?"
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
): Promise<string> {
  const system = buildSystemPrompt(consentimiento);
  const messages: Mensaje[] = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: "user", content: message },
  ];

  for (let ronda = 0; ronda < MAX_TOOL_ROUNDS; ronda++) {
    const respuesta = await llamarClaude(system, messages);
    const bloques = (respuesta.content ?? []) as Bloque[];

    if (respuesta.stop_reason !== "tool_use") {
      return textoDe(bloques);
    }

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

async function transcribir(audio: Uint8Array, mimeType: string): Promise<string> {
  const ext = mimeType.includes("mp4") ? "m4a" : "ogg";
  const form = new FormData();
  form.append("file", new Blob([audio], { type: mimeType }), `audio.${ext}`);
  form.append("model", "whisper-1");
  form.append("language", "es");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_KEY}` },
    body: form,
  });
  return (await res.json())?.text || "";
}

async function sintetizarVoz(texto: string): Promise<Uint8Array> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "tts-1", voice: "nova", input: texto, response_format: "opus" }),
  });
  return new Uint8Array(await res.arrayBuffer());
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

async function entregar(to: string, texto: string, conVoz: boolean): Promise<void> {
  if (conVoz && OPENAI_KEY) {
    try {
      await enviarAudio(to, await sintetizarVoz(texto));
      return;
    } catch (e) {
      console.error("Fallo el envio por voz, cae a texto:", e);
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
      if (!OPENAI_KEY) {
        await enviarTexto(from, "Parce, por ahora no puedo escuchar audios. Me lo escribes?");
        return json({ ok: true, skip: "sin OPENAI_KEY" });
      }
      try {
        message = await transcribir(
          await descargarMedia(msg.audio.id),
          msg.audio.mime_type || "audio/ogg",
        );
        conVoz = true;
      } catch (e) {
        console.error("Transcripcion fallo:", e);
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
      reply = await responder(message, history, from, consentimiento);
    } catch (e) {
      console.error("El motor fallo:", e);
    }
    if (!reply.trim()) reply = "Uy parce, algo se cruzo por aca. Me lo repites?";
    if (reply.length > 1600) reply = reply.slice(0, 1580) + "...\n\nMas en ridera.com.co";

    await saveMessage(from, "assistant", reply);
    await entregar(from, reply, conVoz);

    return json({ ok: true });
  } catch (e) {
    console.error("Rita v2 error:", e);
    // Devolvemos 200 para que Meta no reintente en bucle.
    return json({ ok: false, error: String(e) });
  }
});
