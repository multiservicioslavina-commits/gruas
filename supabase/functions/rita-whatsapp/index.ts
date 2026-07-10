import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── Config ─────────────────────────────────────────────────────
const WA_TOKEN     = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const RITA_PHONE   = Deno.env.get("RITA_PHONE_ID") ?? "1238785075974458";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SB_URL       = Deno.env.get("SUPABASE_URL")!;
const SB_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH        = "https://graph.facebook.com/v25.0";
const WP_API       = "https://ridera.com.co/wp-json/wp/v2";

const supabase = createClient(SB_URL, SB_KEY);

// ─── Trámites (contexto para Claude, no respuesta hardcodeada) ───
const TRAMITES: Record<string, { titulo: string; emoji: string; links: { nombre: string; url: string }[] }> = {
  soat: {
    titulo: "Comprar SOAT",
    emoji: "🛡️",
    links: [
      { nombre: "Sura", url: "https://www.segurossura.com.co/paginas/soat.aspx" },
      { nombre: "Bolívar", url: "https://www.segurosbolivar.com/soat" },
      { nombre: "Liberty", url: "https://www.libertyseguros.co/soat" },
      { nombre: "Mundial", url: "https://www.mundialseguros.com.co/soat" },
      { nombre: "Solidaria", url: "https://www.lasolidaria.com.co/soat" },
    ],
  },
  simit: {
    titulo: "SIMIT – Consulta de multas",
    emoji: "🚦",
    links: [
      { nombre: "Consultar multas y comparendos", url: "https://www.simit.org.co" },
      { nombre: "Acuerdos de pago", url: "https://www.simit.org.co/acuerdos-de-pago" },
    ],
  },
  runt: {
    titulo: "RUNT – Historial vehicular",
    emoji: "📋",
    links: [
      { nombre: "Consultar historial", url: "https://www.runt.com.co/consultaCiudadana" },
    ],
  },
  impuestos: {
    titulo: "Impuestos vehiculares",
    emoji: "💰",
    links: [
      { nombre: "Antioquia", url: "https://impuestos.antioquia.gov.co" },
      { nombre: "Valle del Cauca", url: "https://www.valledelcauca.gov.co/hacienda/publicaciones/vehiculos" },
      { nombre: "Cundinamarca", url: "https://impuestos.cundinamarca.gov.co" },
      { nombre: "Bogotá", url: "https://www.shd.gov.co/shd/vehiculos" },
      { nombre: "Eje Cafetero (Risaralda)", url: "https://www.risaralda.gov.co/hacienda" },
    ],
  },
  transitos: {
    titulo: "Tránsitos",
    emoji: "🏛️",
    links: [
      { nombre: "Medellín", url: "https://www.medellin.gov.co/movilidad" },
      { nombre: "Envigado", url: "https://www.transitoenvigado.gov.co" },
      { nombre: "Itagüí", url: "https://www.transitoitagui.gov.co" },
      { nombre: "Bello", url: "https://www.transitobello.gov.co" },
      { nombre: "Rionegro", url: "https://www.ttrionegro.gov.co" },
    ],
  },
  tecnomecanica: {
    titulo: "Tecnomecánica – CDAs",
    emoji: "🔧",
    links: [
      { nombre: "Buscar CDA cercano (RUNT)", url: "https://www.runt.com.co/directorio-cda" },
      { nombre: "Requisitos y precios", url: "https://ridera.com.co/garage-tecnico/" },
    ],
  },
};

function detectTramites(msg: string): string | null {
  const m = norm(msg);
  if (/soat|seguro obligatorio/.test(m)) return "soat";
  if (/simit|multa|comparendo|infraccion|fotomulta/.test(m)) return "simit";
  if (/runt|historial/.test(m)) return "runt";
  if (/impuesto|rodamiento|tribut/.test(m)) return "impuestos";
  if (/transito|licencia|traspa/.test(m)) return "transitos";
  if (/tecno\s?mecanica|revision|cda/.test(m)) return "tecnomecanica";
  if (/tramite|papele|documento|legal/.test(m)) return "all";
  return null;
}

// ─── Helpers ────────────────────────────────────────────────────
function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const REGION_MAP: Record<string, string[]> = {
  suroeste:   ["jardin","jerico","andes","tamesis","concordia","fredonia"],
  oriente:    ["guatape","san rafael","marinilla","la ceja","rionegro","santuario"],
  norte:      ["santa rosa","don matias","san pedro","entrerrios","yarumal","campamento","belmira"],
  occidente:  ["santa fe","sopetran","olaya","liborina","buritica","caicedo"],
  magdalena:  ["puerto berrio","puerto nare","sonson"],
  bajo_cauca: ["caucasia","el bagre","zaragoza","nechi","taraza"],
  uraba:      ["apartado","turbo","chigorodo","carepa"],
  nordeste:   ["remedios","segovia","yali","cisneros","amalfi"],
  valle:      ["cali","palmira","buga","tulua","buenaventura"],
  eje:        ["pereira","armenia","manizales","filandia","quimbaya"],
};

const MARCAS = ["bmw","honda","yamaha","ktm","triumph","ducati","suzuki","kawasaki","aprilia","harley"];

// ─── Historial de conversación ──────────────────────────────────
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
  const { data: old } = await supabase
    .from("rita_messages")
    .select("id")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .range(20, 999);
  if (old && old.length > 0) {
    await supabase.from("rita_messages").delete().in("id", old.map(r => r.id));
  }
}

// ─── Conversation state (registro) ─────────────────────────────
async function getConvState(phone: string): Promise<{ state: string; data: any }> {
  const { data } = await supabase
    .from("rita_conversations")
    .select("state, data")
    .eq("phone", phone)
    .maybeSingle();
  return data || { state: "idle", data: {} };
}

async function setConvState(phone: string, state: string, convData: any = {}) {
  await supabase.from("rita_conversations").upsert({
    phone, state, data: convData, updated_at: new Date().toISOString(),
  }, { onConflict: "phone" });
}

async function clearConvState(phone: string) {
  await supabase.from("rita_conversations").delete().eq("phone", phone);
}

// ─── Rider lookup ───────────────────────────────────────────────
async function getRiderContext(phone: string): Promise<any> {
  try {
    const res = await fetch(`${SB_URL}/functions/v1/rita-rider-context`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}` },
      body: JSON.stringify({ telefono: phone }),
    });
    return await res.json();
  } catch { return { encontrado: false }; }
}

// ─── Search context ─────────────────────────────────────────────
async function fetchContext(message: string, phone: string): Promise<any> {
  const msg2 = norm(message);
  let searchTerm = "";

  for (const [_region, keywords] of Object.entries(REGION_MAP)) {
    const matched = keywords.find(k => msg2.includes(k));
    if (matched) { searchTerm = matched; break; }
  }
  if (!searchTerm) {
    const stop = new Set(["que","me","recomiendas","para","rutas","ruta","hay","el","la","los","las","una","un","de","en","por","como","cual","donde","puedo","ir","quiero","hola","rita","buenos","dias","buenas","tardes","noches","gracias","oye","hey","parce","mira"]);
    searchTerm = msg2.split(/[\s,.\-]+/).map(w => w.trim()).filter(w => w.length > 3 && !stop.has(w)).slice(0, 4).join(" ");
  }

  const isGarageQ = /aceite|filtro|freno|pastilla|cadena|llanta|bateria|abs|suspensi|ecu|mantenimiento|garage|motor|card[aá]n|transmisi|neumat|electri|diagn[oó]stic|taller|mecanico|servicio/.test(msg2);
  const isSimpleChat = /^(hola|buenos|buenas|hey|ey|que tal|como estas|gracias|ok|dale|listo|chao|nos vemos)/.test(msg2) && msg2.split(/\s+/).length <= 5;

  const fetches: Promise<any>[] = [];

  if (!isGarageQ && !isSimpleChat && searchTerm.length > 2) {
    const wpSearch = async (endpoint: string, tipo: string) => {
      try {
        const r = await fetch(`${WP_API}/${endpoint}?search=${encodeURIComponent(searchTerm)}&per_page=3&_fields=id,title,slug,excerpt,link`);
        if (!r.ok) return [];
        const items = await r.json();
        return (items || []).map((i: any) => ({
          tipo,
          titulo: (i.title?.rendered || "").replace(/&amp;/g, "&").replace(/&#8211;/g, "–"),
          resumen: (i.excerpt?.rendered || "").replace(/<[^>]+>/g, "").trim().slice(0, 300),
          link: i.link || "",
        }));
      } catch { return []; }
    };
    fetches.push(wpSearch("rutas", "ruta"));
    fetches.push(wpSearch("posts", "articulo"));
  } else {
    fetches.push(Promise.resolve([]));
    fetches.push(Promise.resolve([]));
  }

  fetches.push(
    fetch(`${SB_URL}/functions/v1/garage-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}` },
      body: JSON.stringify({ query: message }),
    }).then(r => r.json()).catch(() => ({ resultados: [] }))
  );

  const [rutas, posts, garageRes] = await Promise.all(fetches);

  const resultados = [
    ...(rutas || []),
    ...(posts || []),
    ...(garageRes?.resultados || []),
  ].filter((r: any) => r.titulo || r.resumen);

  const tramiteKey = detectTramites(message);
  let tramitesCtx = null;
  if (tramiteKey === "all") {
    tramitesCtx = TRAMITES;
  } else if (tramiteKey) {
    tramitesCtx = { [tramiteKey]: TRAMITES[tramiteKey] };
  }

  const marcaMencionada = MARCAS.find(m => msg2.includes(m)) || "";
  const isGrua = /grua|remolque|averia|varad/.test(msg2);

  return { resultados, tramitesCtx, marcaMencionada, isGrua, isGarageQ, searchTerm };
}

// ─── System prompt — personalidad de Rita ─────────────────────
function buildSystemPrompt(riderCtx: any): string {
  let riderInfo = "";
  if (riderCtx?.encontrado) {
    const p = riderCtx.perfil || {};
    const parts = [];
    if (p.nombre) parts.push(`Se llama ${p.nombre}`);
    if (p.moto) parts.push(`Moto: ${p.moto}`);
    if (p.ciudad) parts.push(`Ciudad: ${p.ciudad}`);
    if (p.placa) parts.push(`Placa: ${p.placa}`);
    if (riderCtx.pico_placa?.mensaje) parts.push(`Pico y placa: ${riderCtx.pico_placa.mensaje}`);
    if (riderCtx.documentos?.alertas?.length) parts.push(`Alertas docs: ${riderCtx.documentos.alertas.join(", ")}`);
    if (riderCtx.documentos?.soat) parts.push(`SOAT: ${riderCtx.documentos.soat}`);
    if (riderCtx.documentos?.tecno) parts.push(`Tecnomecánica: ${riderCtx.documentos.tecno}`);
    if (riderCtx.eventos_proximos?.length) parts.push(`Eventos próximos: ${riderCtx.eventos_proximos.map((e: any) => e.titulo || e).join(", ")}`);
    riderInfo = `\n\nDATOS DEL RIDER:\n${parts.join("\n")}`;
  }

  return `Eres Rita, la parcera motera de Ridera (ridera.com.co). Eres una motociclista colombiana apasionada que sabe de motos, rutas, mecánica y trámites. Hablas como una amiga cercana — natural, cálida, directa, con sabor paisa pero sin exagerar.

CÓMO HABLAS:
- Como en un chat de WhatsApp entre amigos moteros. Frases cortas, naturales.
- Usas expresiones como "parce", "dale", "pilas", "bacano", "uff" cuando fluyen natural, no forzadas.
- Emojis con moderación, como una persona real (1-3 por mensaje, no en cada frase).
- NO empiezas cada mensaje con "¡Hola!" ni con tu nombre. Varía cómo arrancas.
- Máximo 6-8 líneas. Si es un saludo simple, 1-3 líneas.
- NO uses listas con viñetas a menos que estés dando links o datos técnicos específicos.

QUÉ SABES HACER:
- Rutas y destinos moteros en Colombia
- Mecánica y mantenimiento (cuando hay datos del Garage Técnico)
- Trámites: SOAT, SIMIT, RUNT, impuestos, tecnomecánica, tránsitos
- Grúas: dirigir a gruas.ridera.com.co o botón SOS de la app
- Info personalizada si el rider está registrado (pico y placa, alertas de docs, etc.)

REGLAS CLAVE:
- SOLO usa información del CONTEXTO proporcionado. Si no hay datos, dilo natural: "Ahí sí no tengo info, pero échale un ojo a ridera.com.co"
- NUNCA inventes rutas, talleres, precios ni datos.
- Si hay datos del Garage Técnico, comparte el dato técnico + tip práctico + link.
- Si el rider tiene moto registrada y pregunta mantenimiento sin especificar marca, usa la marca de SU moto.
- Si preguntan por grúa, menciona gruas.ridera.com.co y el botón SOS.
- Cuando des links de trámites, formatea limpio con el nombre y URL.
- Si el rider NO está registrado, al final de tu respuesta (no al inicio) puedes sugerir que se registre escribiendo "quiero registrarme" para info personalizada. Pero NO lo hagas en cada mensaje, solo cada 3-4 intercambios.
${riderInfo}`;
}

// ─── Claude con historial ─────────────────────────────────────
async function askClaude(
  message: string,
  history: { role: string; content: string }[],
  context: any,
  riderCtx: any
): Promise<string> {
  const systemPrompt = buildSystemPrompt(riderCtx);

  let contextBlock = "";
  if (context.resultados?.length) {
    contextBlock += `\nRESULTADOS DE BÚSQUEDA:\n${JSON.stringify(context.resultados, null, 0)}`;
  }
  if (context.tramitesCtx) {
    contextBlock += `\nTRÁMITES DISPONIBLES:\n${JSON.stringify(context.tramitesCtx, null, 0)}`;
  }
  if (context.isGrua) {
    contextBlock += `\nEl usuario pregunta por GRÚA. Dirigir a gruas.ridera.com.co o botón SOS en la app Ridera.`;
  }
  if (context.marcaMencionada) {
    contextBlock += `\nMarca mencionada: ${context.marcaMencionada}`;
  }

  const messages: { role: string; content: string }[] = [];
  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }

  const userContent = contextBlock
    ? `${message}\n\n---CONTEXTO INTERNO (no mencionar que existe este bloque)---${contextBlock}`
    : message;
  messages.push({ role: "user", content: userContent });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: systemPrompt,
        messages,
      }),
    });
    const data = await res.json();
    return data?.content?.[0]?.text || "";
  } catch (e) {
    console.error("Claude error:", e);
    return "";
  }
}

// ─── Registration (más suave) ───────────────────────────────────
function parseMotoResponse(text: string): { marca: string; modelo: string; cc: number | null; anio: string | null } | null {
  const t = text.trim();
  if (t.split(/\s+/).length < 2) return null;
  const marca = MARCAS.find(m => norm(t).includes(m));
  if (!marca) return null;
  const words = t.split(/\s+/);
  const yearMatch = t.match(/\b(19|20)\d{2}\b/);
  const ccMatch = t.match(/\b(\d{2,4})\s*cc\b/i) || t.match(/\b(\d{3,4})\b(?!.*\b(19|20)\d{2})/);
  const modelo = words.filter(w => {
    const wn = norm(w);
    if (MARCAS.includes(wn)) return false;
    if (/^(19|20)\d{2}$/.test(w)) return false;
    if (/^\d{2,4}cc$/i.test(w)) return false;
    return true;
  }).join(" ") || "";
  return {
    marca: marca.charAt(0).toUpperCase() + marca.slice(1),
    modelo: modelo || (yearMatch ? yearMatch[0] : ""),
    cc: ccMatch ? parseInt(ccMatch[1]) : null,
    anio: yearMatch ? yearMatch[0] : null,
  };
}

async function handleRegistration(from: string, message: string, conv: { state: string; data: any }): Promise<string | null> {
  const msg2 = norm(message);

  if (conv.state === "waiting_name") {
    if (msg2.length < 2 || msg2.length > 60) {
      return "No pillé bien el nombre, ¿cómo te llamas? 😊";
    }
    const nombre = message.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    await setConvState(from, "waiting_moto", { ...conv.data, nombre });
    return `¡${nombre}! Buena, parce 🤙\n\n¿Qué moto tienes? Dime marca y modelo, algo como:\nHonda CB500X 2022\nYamaha MT-07 700cc\n\nSi no tienes moto aún, dime "no tengo" y listo.`;
  }

  if (conv.state === "waiting_moto") {
    if (/no tengo|ninguna|no moto|sin moto|todavia no|aun no/.test(msg2)) {
      const nombre = conv.data.nombre || "Piloto";
      const tel = from.replace(/^57/, "");
      await supabase.from("riders").insert({
        id: crypto.randomUUID(),
        nombre,
        telefono: tel,
        created_at: new Date().toISOString(),
      });
      await clearConvState(from);
      return `Listo ${nombre}, quedaste registrado 🏍️ Cuando tengas moto me cuentas y la agrego. ¿En qué te ayudo?`;
    }

    const moto = parseMotoResponse(message);
    if (!moto) {
      return "No pillé la moto 🤔 Intenta así: Honda CB500X 2022";
    }

    const nombre = conv.data.nombre || "Piloto";
    const tel = from.replace(/^57/, "");
    await supabase.from("riders").insert({
      id: crypto.randomUUID(),
      nombre,
      telefono: tel,
      moto_marca: moto.marca,
      moto_modelo: moto.anio || moto.modelo,
      moto_cc: moto.cc,
      tipo_moto: moto.modelo,
      created_at: new Date().toISOString(),
    });
    await clearConvState(from);

    const motoStr = [moto.marca, moto.modelo, moto.cc ? `${moto.cc}cc` : "", moto.anio].filter(Boolean).join(" ");
    return `Quedaste registrado con tu ${motoStr} 🔥\n\nAhora te puedo dar info de mantenimiento para tu moto, alertas de SOAT, pico y placa y más. ¿Qué necesitas?`;
  }

  if (conv.state === "waiting_city") {
    const tel = from.replace(/^57/, "");
    await supabase.from("riders")
      .update({ ciudad: message.trim() })
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`);
    await clearConvState(from);
    return `Dale, guardé tu ciudad 👍 ¿En qué te ayudo?`;
  }

  return null;
}

// ─── WhatsApp send ──────────────────────────────────────────────
async function sendWhatsApp(to: string, text: string): Promise<any> {
  const res = await fetch(`${GRAPH}/${RITA_PHONE}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WA_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  return res.json();
}

// ─── Main handler ───────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === "ridera_rita_2026") {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const entry = body?.entry?.[0];
      const change = entry?.changes?.[0]?.value;
      const msg = change?.messages?.[0];

      if (!msg || !msg.text?.body) {
        return new Response(JSON.stringify({ ok: true, skip: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      const from = msg.from || "";
      const message = msg.text.body || "";

      // Guardar mensaje del usuario
      await saveMessage(from, "user", message);

      // ── Check registro en curso ──
      const conv = await getConvState(from);
      if (conv.state !== "idle") {
        const regReply = await handleRegistration(from, message, conv);
        if (regReply) {
          await saveMessage(from, "assistant", regReply);
          await sendWhatsApp(from, regReply);
          return new Response(JSON.stringify({ ok: true, flow: "registration" }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }

      // ── Detectar intención de registro voluntario ──
      const msg2 = norm(message);
      if (/quiero registrarme|registrarme|registrame|inscribirme/.test(msg2)) {
        const riderCheck = await getRiderContext(from);
        if (!riderCheck?.encontrado) {
          await setConvState(from, "waiting_name", {});
          const reply = "¡Dale! Vamos a registrarte para darte info personalizada de tu moto 🏍️ ¿Cómo te llamas?";
          await saveMessage(from, "assistant", reply);
          await sendWhatsApp(from, reply);
          return new Response(JSON.stringify({ ok: true, flow: "start_registration" }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }

      // ── Obtener contexto en paralelo ──
      const [context, riderCtx, history] = await Promise.all([
        fetchContext(message, from),
        getRiderContext(from),
        getHistory(from, 10),
      ]);

      // ── Todo pasa por Claude con historial ──
      let reply = await askClaude(message, history, context, riderCtx);

      if (!reply) {
        reply = "Uy parce, algo se cruzó y no pude procesar eso. ¿Me lo repites? 🙏";
      }

      if (reply.length > 1600) {
        reply = reply.slice(0, 1580) + "...\n\nMás en ridera.com.co";
      }

      // Guardar respuesta de Rita
      await saveMessage(from, "assistant", reply);

      const waResult = await sendWhatsApp(from, reply);

      return new Response(JSON.stringify({ ok: true, wa: waResult }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("Rita error:", e);
      return new Response(JSON.stringify({ ok: false, error: String(e) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
