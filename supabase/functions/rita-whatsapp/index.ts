import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── Config ─────────────────────────────────────────────────────
const WA_TOKEN     = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const RITA_PHONE   = Deno.env.get("RITA_PHONE_ID") ?? "1238785075974458";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY") ?? "";
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

// ─── Route detail lookup from rita_rutas ────────────────────────
async function fetchRutaDetail(message: string): Promise<any | null> {
  const msg2 = norm(message);
  if (!/ruta|viaje|viajar|ir a|destino|recorrido|como llego|llegar/.test(msg2) && msg2.split(/\s+/).length > 6) return null;

  const stopWords = new Set(["que","me","recomiendas","para","rutas","ruta","hay","el","la","los","las","una","un","de","en","por","como","cual","donde","puedo","ir","quiero","hola","rita","buenos","dias","buenas","tardes","noches","gracias","a","se"]);
  const keywords = msg2.split(/[\s,.\-]+/).map(w => w.trim()).filter(w => w.length > 2 && !stopWords.has(w));
  if (!keywords.length) return null;

  const orFilters = keywords.map(k => `destino.ilike.%${k}%,titulo.ilike.%${k}%,slug.ilike.%${k}%`).join(",");
  const { data } = await supabase
    .from("rita_rutas")
    .select("*")
    .or(orFilters)
    .limit(3);

  return data || null;
}

// ─── Municipio lookup from Supabase ──────────────────────────────
async function fetchMunicipioInfo(message: string): Promise<any[]> {
  const msg2 = norm(message);
  const stopWords = new Set(["que","me","recomiendas","para","hay","el","la","los","las","una","un","de","en","por","como","cual","donde","puedo","ir","quiero","hola","rita","buenos","dias","buenas","tardes","noches","gracias","a","se","conocer","visitar","municipio","pueblo","ciudad","info","informacion","sobre"]);
  const keywords = msg2.split(/[\s,.\-]+/).map(w => w.trim()).filter(w => w.length > 2 && !stopWords.has(w));
  if (!keywords.length) return [];

  const orFilters = keywords.map(k => `nombre.ilike.%${k}%`).join(",");
  const { data } = await supabase
    .from("municipios")
    .select("nombre, subregion, zona_dificultad, puntos_sello, historia")
    .or(orFilters)
    .limit(3);
  return data || [];
}

// ─── Talleres lookup from Supabase ───────────────────────────────
async function fetchTalleres(message: string): Promise<any[]> {
  const msg2 = norm(message);
  if (!/taller|mecanico|mecanic|servicio|reparar|arreglar|revision/.test(msg2)) return [];
  const cityKws = msg2.split(/[\s,.\-]+/).filter(w => w.length > 3);
  let query = supabase.from("talleres").select("nombre, ciudad, direccion, telefono, barrio").eq("aprobado", true);
  const cityMatch = cityKws.find(k => /medellin|envigado|bello|itagui|sabaneta|rionegro|pereira|bogota|cali/.test(k));
  if (cityMatch) query = query.ilike("ciudad", `%${cityMatch}%`);
  const { data } = await query.limit(5);
  return data || [];
}

// ─── Garage motos (datos técnicos verificados) ───────────────────
async function fetchGarageMoto(marca: string, modelo?: string): Promise<any | null> {
  let query = supabase.from("garage_motos").select("*").ilike("marca", `%${marca}%`);
  if (modelo) query = query.ilike("modelo", `%${modelo}%`);
  const { data } = await query.limit(1);
  return data?.[0] || null;
}

// ─── INVIAS — estado de vías (scraping RSS/API pública) ──────────
async function fetchEstadoVias(destino: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://www.invias.gov.co/index.php/red-vial/estado-de-la-red-vial`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) return null;
    const html = await r.text();
    const dest = norm(destino);
    const lines = html.replace(/<[^>]+>/g, " ").split(/\n/).filter(l => norm(l).includes(dest));
    if (lines.length === 0) return null;
    return lines.slice(0, 3).map(l => l.trim().slice(0, 200)).join(" | ");
  } catch { return null; }
}

// ─── Antioquia es Mágica — experiencias/destinos ─────────────────
async function fetchAntioquiaMagica(searchTerm: string): Promise<any[]> {
  try {
    const r = await fetch(
      `https://turismoantioquia.travel/wp-json/wp/v2/posts?search=${encodeURIComponent(searchTerm)}&per_page=3&_fields=title,excerpt,link`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!r.ok) return [];
    const items = await r.json();
    return (items || []).map((i: any) => ({
      fuente: "Antioquia es Mágica",
      titulo: (i.title?.rendered || "").replace(/&amp;/g, "&").replace(/&#8211;/g, "–"),
      resumen: (i.excerpt?.rendered || "").replace(/<[^>]+>/g, "").trim().slice(0, 250),
      link: i.link || "",
    }));
  } catch { return []; }
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
  const isViaQ = /via|carretera|estado.*via|como esta.*via|derrumbe|cierre|peaje|paso|transitable/.test(msg2);
  const isDestinoQ = /municipio|pueblo|visitar|conocer|turismo|que hay en|destino/.test(msg2);
  const isSimpleChat = /^(hola|buenos|buenas|hey|ey|que tal|como estas|gracias|ok|dale|listo|chao|nos vemos)/.test(msg2) && msg2.split(/\s+/).length <= 5;

  const fetches: Promise<any>[] = [];

  // WordPress ridera.com.co
  if (!isGarageQ && !isSimpleChat && searchTerm.length > 2) {
    const wpSearch = async (endpoint: string, tipo: string) => {
      try {
        const r = await fetch(`${WP_API}/${endpoint}?search=${encodeURIComponent(searchTerm)}&per_page=3&_fields=id,title,slug,excerpt,link`);
        if (!r.ok) return [];
        const items = await r.json();
        return (items || []).map((i: any) => ({
          tipo, fuente: "ridera.com.co",
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

  // Garage search (edge function)
  fetches.push(
    fetch(`${SB_URL}/functions/v1/garage-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}` },
      body: JSON.stringify({ query: message }),
    }).then(r => r.json()).catch(() => ({ resultados: [] }))
  );

  // Municipios de Supabase
  fetches.push(fetchMunicipioInfo(message));

  // Talleres de Supabase
  fetches.push(fetchTalleres(message));

  // Antioquia es Mágica (turismo verificado)
  if (!isSimpleChat && !isGarageQ && searchTerm.length > 2) {
    fetches.push(fetchAntioquiaMagica(searchTerm));
  } else {
    fetches.push(Promise.resolve([]));
  }

  // INVIAS estado de vías
  if (isViaQ && searchTerm.length > 2) {
    fetches.push(fetchEstadoVias(searchTerm));
  } else {
    fetches.push(Promise.resolve(null));
  }

  const [rutas, posts, garageRes, municipiosRes, talleresRes, antioquiaRes, inviasRes] = await Promise.all(fetches);

  const resultados = [
    ...(rutas || []),
    ...(posts || []),
    ...(garageRes?.resultados || []),
    ...(antioquiaRes || []),
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

  return {
    resultados,
    tramitesCtx,
    marcaMencionada,
    isGrua,
    isGarageQ,
    searchTerm,
    municipios: municipiosRes,
    talleres: talleresRes,
    estadoVias: inviasRes,
  };
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

  return `Eres Rita, la parcera motera de Ridera (ridera.com.co). Motociclista colombiana, cálida, directa, con sabor paisa sin exagerar.

CÓMO HABLAS:
- WhatsApp entre amigos moteros. Frases cortas, naturales.
- "parce", "dale", "pilas", "bacano" cuando fluyan natural.
- 1-3 emojis por mensaje. NO empezar con "¡Hola!" siempre.
- Máximo 6-8 líneas. Saludo simple: 1-3 líneas.
- NO listas con viñetas a menos que des links o datos técnicos.

⚠️ REGLA ABSOLUTA — NO INVENTAR:
- SOLO responde con datos que aparezcan en el CONTEXTO proporcionado abajo.
- Si NO hay datos en el contexto para responder, di EXACTAMENTE algo como:
  "Ahí sí no tengo esa info verificada todavía, parce. Puedes consultar en ridera.com.co o escribirme después cuando la tenga actualizada 🙏"
- NUNCA inventes nombres de talleres, restaurantes, hoteles, precios, distancias, tiempos, horarios ni datos técnicos.
- NUNCA inventes rutas que no estén en el contexto.
- NUNCA digas "según mis datos" ni "generalmente" para introducir datos que NO están en el contexto.
- Si el contexto tiene datos parciales, comparte SOLO lo que hay y aclara qué falta.
- Prefiere decir "no sé" a inventar. Un dato falso hace más daño que no responder.

FUENTES QUE CONSULTO (solo estas):
- Supabase: rutas (rita_rutas), municipios, talleres aprobados, garage_motos (datos técnicos)
- WordPress: ridera.com.co (artículos y rutas publicadas)
- Antioquia es Mágica: turismo verificado de turismoantioquia.travel
- INVIAS: estado de vías (cuando está disponible)
- Trámites: SOAT, SIMIT, RUNT, impuestos, tecnomecánica (links oficiales)
- Grúas: gruas.ridera.com.co o botón SOS de la app

REGLAS DE DATOS:
- Si hay datos del Garage Técnico en el contexto, comparte dato técnico + tip + link.
- Si el rider tiene moto registrada y pregunta sin marca, usa SU moto.
- Grúa → gruas.ridera.com.co y botón SOS.
- Links de trámites: formatea limpio con nombre y URL.
- Talleres: SOLO los que aparezcan en el contexto (tabla talleres aprobados).
- Rider NO registrado: sugerir "quiero registrarme" cada 3-4 intercambios, no siempre.
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
  const hasAnyData = context.resultados?.length || context.tramitesCtx || context.isGrua ||
    context.municipios?.length || context.talleres?.length || context.estadoVias || context.rutaDetail;

  if (!hasAnyData && !context.marcaMencionada) {
    contextBlock += `\nSIN DATOS DISPONIBLES: No se encontró información verificada para esta consulta. NO inventes datos. Responde que no tienes esa información todavía.`;
  }

  if (context.resultados?.length) {
    contextBlock += `\nRESULTADOS VERIFICADOS (fuentes: ridera.com.co, Antioquia es Mágica):\n${JSON.stringify(context.resultados, null, 0)}`;
  }
  if (context.municipios?.length) {
    contextBlock += `\nMUNICIPIOS (datos Supabase verificados):\n${JSON.stringify(context.municipios, null, 0)}`;
  }
  if (context.talleres?.length) {
    contextBlock += `\nTALLERES APROBADOS (datos Supabase verificados):\n${JSON.stringify(context.talleres, null, 0)}`;
  }
  if (context.estadoVias) {
    contextBlock += `\nESTADO DE VÍAS (INVIAS):\n${context.estadoVias}`;
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
  if (context.rutaDetail) {
    const rutas = Array.isArray(context.rutaDetail) ? context.rutaDetail : [context.rutaDetail];
    for (const r of rutas) {
      contextBlock += `\nRUTA VERIFICADA (Supabase rita_rutas):\nDestino: ${r.destino} (${r.departamento})\nDistancia: ${r.km}km | Duración: ${r.duracion} | Dificultad: ${r.dificultad}\nSuperficie: ${r.superficie}\nMejor época: ${r.mejor_epoca}\nMoto recomendada: ${r.moto_recomendada}\nResumen: ${r.resumen}\nTips: ${r.tips}\nGasolina: ${r.gasolina_tip}\nHospedaje: ${r.hospedaje}\nGastronomía: ${r.gastronomia}\nLink: ${r.wp_link}`;
    }
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

    // Si el usuario claramente NO está respondiendo sobre su moto, salir del flujo
    const looksLikeMotoAnswer = MARCAS.some(m => msg2.includes(m)) || /\d{3,4}\s*cc/i.test(msg2) || /\b(moto|tiene|tengo|manejo|ando en)\b/.test(msg2);
    if (!looksLikeMotoAnswer && msg2.split(/\s+/).length > 3) {
      // Registrar sin moto y dejar que Claude responda
      const nombre = conv.data.nombre || "Piloto";
      const tel = from.replace(/^57/, "");
      await supabase.from("riders").insert({
        id: crypto.randomUUID(),
        nombre,
        telefono: tel,
        created_at: new Date().toISOString(),
      });
      await clearConvState(from);
      return null; // null = pasar al flujo normal de Claude
    }

    const moto = parseMotoResponse(message);
    if (!moto) {
      return "No pillé la moto 🤔 Intenta así: Honda CB500X 2022\n\nO si quieres saltarte eso, dime \"no tengo\" y seguimos 🤙";
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

// ─── Audio: descargar media de WhatsApp ────────────────────────
async function downloadWhatsAppMedia(mediaId: string): Promise<Uint8Array> {
  const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { "Authorization": `Bearer ${WA_TOKEN}` },
  });
  const meta = await metaRes.json();
  const audioRes = await fetch(meta.url, {
    headers: { "Authorization": `Bearer ${WA_TOKEN}` },
  });
  return new Uint8Array(await audioRes.arrayBuffer());
}

// ─── Audio: transcribir con Whisper ────────────────────────────
async function transcribeAudio(audioBytes: Uint8Array, mimeType: string): Promise<string> {
  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "ogg";
  const form = new FormData();
  form.append("file", new Blob([audioBytes], { type: mimeType }), `audio.${ext}`);
  form.append("model", "whisper-1");
  form.append("language", "es");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_KEY}` },
    body: form,
  });
  const data = await res.json();
  return data?.text || "";
}

// ─── Audio: texto a voz con OpenAI TTS ─────────────────────────
async function textToSpeech(text: string): Promise<Uint8Array> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: "nova",
      input: text,
      response_format: "opus",
    }),
  });
  return new Uint8Array(await res.arrayBuffer());
}

// ─── Audio: subir media y enviar nota de voz por WhatsApp ──────
async function sendWhatsAppAudio(to: string, audioBytes: Uint8Array): Promise<any> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "audio/ogg; codecs=opus");
  form.append("file", new Blob([audioBytes], { type: "audio/ogg; codecs=opus" }), "rita.ogg");

  const uploadRes = await fetch(`${GRAPH}/${RITA_PHONE}/media`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${WA_TOKEN}` },
    body: form,
  });
  const uploadData = await uploadRes.json();
  const mediaId = uploadData?.id;
  if (!mediaId) throw new Error(`Media upload failed: ${JSON.stringify(uploadData)}`);

  const sendRes = await fetch(`${GRAPH}/${RITA_PHONE}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WA_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "audio",
      audio: { id: mediaId },
    }),
  });
  return sendRes.json();
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

      if (!msg) {
        return new Response(JSON.stringify({ ok: true, skip: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      const from = msg.from || "";
      const isAudio = msg.type === "audio";
      let message = "";
      let respondWithVoice = false;

      if (isAudio && msg.audio) {
        if (!OPENAI_KEY) {
          await sendWhatsApp(from, "Parce, por ahora no puedo escuchar audios 🎧 ¿Me lo escribes?");
          return new Response(JSON.stringify({ ok: true, skip: "no_openai_key" }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        try {
          const audioBytes = await downloadWhatsAppMedia(msg.audio.id);
          const mimeType = msg.audio.mime_type || "audio/ogg";
          message = await transcribeAudio(audioBytes, mimeType);
          respondWithVoice = true;
        } catch (e) {
          console.error("Transcription error:", e);
          await sendWhatsApp(from, "No pude escuchar ese audio 😅 ¿Me lo mandas de nuevo o me escribes?");
          return new Response(JSON.stringify({ ok: true, error: "transcription_failed" }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (!message.trim()) {
          await sendWhatsApp(from, "Uy, no pillé qué dijiste en el audio 🤔 ¿Me lo repites?");
          return new Response(JSON.stringify({ ok: true, skip: "empty_transcription" }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      } else if (msg.text?.body) {
        message = msg.text.body;
      } else {
        return new Response(JSON.stringify({ ok: true, skip: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // Guardar mensaje del usuario
      await saveMessage(from, "user", message);

      // ── Check registro en curso ──
      const conv = await getConvState(from);
      if (conv.state !== "idle") {
        const regReply = await handleRegistration(from, message, conv);
        if (regReply) {
          await saveMessage(from, "assistant", regReply);
          if (respondWithVoice && OPENAI_KEY) {
            try {
              const speechBytes = await textToSpeech(regReply);
              await sendWhatsAppAudio(from, speechBytes);
            } catch { await sendWhatsApp(from, regReply); }
          } else {
            await sendWhatsApp(from, regReply);
          }
          return new Response(JSON.stringify({ ok: true, flow: "registration" }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }

      // ── Detectar intención de registro voluntario ──
      const msg2 = norm(message);
      if (/quiero registrarme|registrarme|registrame|inscribirme/.test(msg2)) {
        const riderCheck = await getRiderContext(from);
        if (!riderCheck?.encontrado) {
          await setConvState(from, "waiting_name", {});
          const regStartReply = "¡Dale! Vamos a registrarte para darte info personalizada de tu moto 🏍️ ¿Cómo te llamas?";
          await saveMessage(from, "assistant", regStartReply);
          if (respondWithVoice && OPENAI_KEY) {
            try {
              const speechBytes = await textToSpeech(regStartReply);
              await sendWhatsAppAudio(from, speechBytes);
            } catch { await sendWhatsApp(from, regStartReply); }
          } else {
            await sendWhatsApp(from, regStartReply);
          }
          return new Response(JSON.stringify({ ok: true, flow: "start_registration" }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }

      // ── Obtener contexto en paralelo ──
      const [context, riderCtx, history, rutaDetail] = await Promise.all([
        fetchContext(message, from),
        getRiderContext(from),
        getHistory(from, 10),
        fetchRutaDetail(message),
      ]);

      // ── Todo pasa por Claude con historial ──
      if (rutaDetail) context.rutaDetail = rutaDetail;
      let reply = await askClaude(message, history, context, riderCtx);

      if (!reply) {
        reply = "Uy parce, algo se cruzó y no pude procesar eso. ¿Me lo repites? 🙏";
      }

      if (reply.length > 1600) {
        reply = reply.slice(0, 1580) + "...\n\nMás en ridera.com.co";
      }

      // Guardar respuesta de Rita
      await saveMessage(from, "assistant", reply);

      let waResult;
      if (respondWithVoice && OPENAI_KEY) {
        try {
          const speechBytes = await textToSpeech(reply);
          waResult = await sendWhatsAppAudio(from, speechBytes);
        } catch (e) {
          console.error("TTS/audio send error:", e);
          waResult = await sendWhatsApp(from, reply);
        }
      } else {
        waResult = await sendWhatsApp(from, reply);
      }

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
