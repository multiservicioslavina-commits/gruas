import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const WA_TOKEN     = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const RITA_PHONE   = Deno.env.get("RITA_PHONE_ID") ?? "3234846550";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY") ?? "";
const SB_URL       = Deno.env.get("SUPABASE_URL")!;
const SB_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH        = "https://graph.facebook.com/v25.0";

const supabase = createClient(SB_URL, SB_KEY);

const TRAMITES: Record<string, { titulo: string; emoji: string; links: { nombre: string; url: string }[] }> = {
  soat: { titulo: "Comprar SOAT", emoji: "shield", links: [
    { nombre: "Sura", url: "https://www.segurossura.com.co/paginas/soat.aspx" },
    { nombre: "Bolívar", url: "https://www.segurosbolivar.com/soat" },
    { nombre: "Liberty", url: "https://www.libertyseguros.co/soat" },
    { nombre: "Mundial", url: "https://www.mundialseguros.com.co/soat" },
    { nombre: "Solidaria", url: "https://www.lasolidaria.com.co/soat" },
  ]},
  simit: { titulo: "SIMIT – Multas", emoji: "semaphore", links: [
    { nombre: "Consultar multas", url: "https://www.simit.org.co" },
    { nombre: "Acuerdos de pago", url: "https://www.simit.org.co/acuerdos-de-pago" },
  ]},
  runt: { titulo: "RUNT – Historial", emoji: "clipboard", links: [
    { nombre: "Consultar historial", url: "https://www.runt.com.co/consultaCiudadana" },
  ]},
  impuestos: { titulo: "Impuestos vehiculares", emoji: "money", links: [
    { nombre: "Antioquia", url: "https://impuestos.antioquia.gov.co" },
    { nombre: "Valle del Cauca", url: "https://www.valledelcauca.gov.co/hacienda/publicaciones/vehiculos" },
    { nombre: "Cundinamarca", url: "https://impuestos.cundinamarca.gov.co" },
    { nombre: "Bogotá", url: "https://www.shd.gov.co/shd/vehiculos" },
    { nombre: "Eje Cafetero", url: "https://www.risaralda.gov.co/hacienda" },
  ]},
  transitos: { titulo: "Tránsitos", emoji: "building", links: [
    { nombre: "Medellín", url: "https://www.medellin.gov.co/movilidad" },
    { nombre: "Envigado", url: "https://www.transitoenvigado.gov.co" },
    { nombre: "Itagüí", url: "https://www.transitoitagui.gov.co" },
    { nombre: "Bello", url: "https://www.transitobello.gov.co" },
    { nombre: "Rionegro", url: "https://www.ttrionegro.gov.co" },
  ]},
  tecnomecanica: { titulo: "Tecnomecánica – CDAs", emoji: "wrench", links: [
    { nombre: "Buscar CDA (RUNT)", url: "https://www.runt.com.co/directorio-cda" },
    { nombre: "Requisitos y precios", url: "https://ridera.com.co/garage-tecnico/" },
  ]},
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

function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const REGION_MAP: Record<string, string[]> = {
  suroeste:   ["jardin","jerico","andes","tamesis","concordia","fredonia"],
  oriente:    ["guatape","san rafael","marinilla","la ceja","rionegro","santuario"],
  norte:      ["santa rosa","don matias","san pedro","entrerrios","yarumal","campamento","belmira"],
  occidente:  ["santa fe","sopetran","olaya","liborina","buritica","caicedo","heliconia"],
  magdalena:  ["puerto berrio","puerto nare","sonson"],
  bajo_cauca: ["caucasia","el bagre","zaragoza","nechi","taraza"],
  uraba:      ["apartado","turbo","chigorodo","carepa","arboletes"],
  nordeste:   ["remedios","segovia","yali","cisneros","amalfi","yolombo"],
  valle:      ["cali","palmira","buga","tulua","buenaventura"],
  eje:        ["pereira","armenia","manizales","filandia","quimbaya"],
};

const MARCAS = ["bmw","honda","yamaha","ktm","triumph","ducati","suzuki","kawasaki","aprilia","harley","royal enfield","bajaj","tvs","hero","benelli","cfmoto","zongshen"];

function wmoDesc(code: number): string {
  if (code === 0) return "Cielo despejado";
  if (code <= 3) return "Parcialmente nublado";
  if (code <= 48) return "Niebla/bruma";
  if (code <= 57) return "Llovizna";
  if (code <= 67) return "Lluvia";
  if (code <= 77) return "Precipitacion solida";
  if (code <= 82) return "Aguacero";
  if (code <= 86) return "Aguacero fuerte";
  if (code <= 99) return "Tormenta electrica";
  return "Sin datos";
}

function riesgoMoto(code: number, rain: number): string {
  if (code >= 95) return "PELIGRO: tormenta, no salir";
  if (code >= 80 || rain > 5) return "PRECAUCION: piso mojado, reduce velocidad";
  if (code >= 51 || rain > 0) return "LLOVIZNA: ten cuidado con curvas";
  return "Condiciones OK para rodar";
}

async function fetchClimaOpenMeteo(lat: number, lon: number, lugar: string): Promise<string | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,rain,weathercode,windspeed_10m,relative_humidity_2m&hourly=precipitation_probability&timezone=America%2FBogota&forecast_days=1`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const data = await r.json();
    const c = data.current;
    if (!c) return null;
    const hora = new Date().getHours();
    const probLluvia = data.hourly?.precipitation_probability?.[hora] ?? "sin dato";
    const desc = wmoDesc(c.weathercode);
    const riesgo = riesgoMoto(c.weathercode, c.rain || 0);
    return `CLIMA EN ${lugar.toUpperCase()} (tiempo real):\n${desc} | ${c.temperature_2m}C | Lluvia: ${c.rain || 0}mm | Humedad: ${c.relative_humidity_2m}% | Viento: ${c.windspeed_10m}km/h | Prob lluvia: ${probLluvia}%\nRiesgo motero: ${riesgo}`;
  } catch (e) {
    console.error("OpenMeteo error:", e);
    return null;
  }
}

async function fetchAlertasSIATA(): Promise<string | null> {
  const endpoints = [
    "https://siata.gov.co/siata_nuevo/index.php/alerta/getAlertasActivas",
    "https://siata.gov.co/descarga/index.php/api/getAlertas",
    "https://siata.gov.co/siata_nuevo/index.php/ws/getAlerts",
  ];
  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers: { "Accept": "application/json", "User-Agent": "RideraBot/1.0" },
      });
      if (!r.ok) continue;
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("json")) {
        const data = await r.json();
        if (data && typeof data === "object") {
          const alerts = Array.isArray(data) ? data : data.alertas || data.data || [];
          if (alerts.length > 0) {
            return "SIATA ALERTAS ACTIVAS:\n" + alerts.slice(0, 5).map((a: any) =>
              `${a.nivel || a.color || ""} ${a.zona || a.municipio || a.nombre || ""}: ${a.descripcion || a.mensaje || ""}`
            ).join("\n");
          }
          return "SIATA: Sin alertas activas en este momento";
        }
      }
      const html = await r.text();
      if (html.length > 100) {
        const nivelMatch = html.match(/alerta[\s-]*(amarilla|naranja|roja|verde)/i);
        if (nivelMatch) return `SIATA: Alerta ${nivelMatch[1].toUpperCase()} activa en Antioquia`;
        if (/sin alerta|no hay alerta|normalidad/i.test(html)) return "SIATA: Sin alertas activas";
      }
    } catch { continue; }
  }
  return null;
}

async function fetchEstadoViasINVIAS(destino: string): Promise<string | null> {
  const dest = norm(destino);
  const endpoints = [
    "https://www.invias.gov.co/index.php/red-vial/estado-de-la-red-vial",
    "https://www.invias.gov.co/index.php/component/content/article/3-principal/5823-estado-de-vias",
  ];
  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; RideraBot/1.0)", "Accept": "text/html,application/xhtml+xml" },
      });
      if (!r.ok) continue;
      const html = await r.text();
      if (html.length < 500) continue;
      const scriptRe = new RegExp("<script[^>]*>[\\s\\S]*?</script>", "gi");
      const styleRe = new RegExp("<style[^>]*>[\\s\\S]*?</style>", "gi");
      const texto = html
        .replace(scriptRe, " ")
        .replace(styleRe, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ").trim();
      const lineas = texto.split(/[.!?\n]/).filter(l => l.trim().length > 20);
      const relevantes = lineas.filter(l => { const ln = norm(l); return ln.includes(dest) || ln.includes("antioquia") || ln.includes("medellin"); });
      if (relevantes.length > 0) return "INVIAS estado de vias:\n" + relevantes.slice(0, 4).map(l => l.trim()).join(". ");
      const alertas = lineas.filter(l => /cierre|derrumbe|restriccion|inhabilitad|intervencion|mantenimiento/.test(norm(l)));
      if (alertas.length > 0) return "INVIAS alertas:\n" + alertas.slice(0, 3).map(l => l.trim()).join(". ");
    } catch { continue; }
  }
  return `INVIAS: consulta en https://www.invias.gov.co/index.php/red-vial/estado-de-la-red-vial o llama gratis: 018000 910 010`;
}

async function getCoordsForDestino(mensaje: string): Promise<{ lat: number; lon: number; nombre: string } | null> {
  const msg2 = norm(mensaje);
  const stopWords = new Set(["que","me","para","hay","el","la","los","las","una","un","de","en","por","como","cual","donde","ir","quiero","hola","clima","tiempo","lluvia","calor","frio","temperatura","esta","hace"]);
  const keywords = msg2.split(/[\s,.\-]+/).filter(w => w.length > 2 && !stopWords.has(w));
  if (!keywords.length) return null;
  const orFilters = keywords.map(k => `nombre.ilike.%${k}%`).join(",");
  const { data } = await supabase.from("rita_municipios").select("nombre, coordenadas").or(orFilters).limit(1);
  const m = data?.[0];
  if (!m?.coordenadas) return null;
  return { lat: m.coordenadas.lat, lon: m.coordenadas.lng, nombre: m.nombre };
}

async function getHistory(phone: string, limit = 10): Promise<{ role: string; content: string }[]> {
  const { data } = await supabase.from("rita_messages").select("role, content").eq("phone", phone).order("created_at", { ascending: false }).limit(limit);
  return (data || []).reverse();
}

async function saveMessage(phone: string, role: "user" | "assistant", content: string) {
  await supabase.from("rita_messages").insert({ phone, role, content });
  const { data: old } = await supabase.from("rita_messages").select("id").eq("phone", phone).order("created_at", { ascending: false }).range(20, 999);
  if (old?.length) await supabase.from("rita_messages").delete().in("id", old.map(r => r.id));
}

async function getConvState(phone: string): Promise<{ state: string; data: any }> {
  const { data } = await supabase.from("rita_conversations").select("state, data").eq("phone", phone).maybeSingle();
  return data || { state: "idle", data: {} };
}
async function setConvState(phone: string, state: string, convData: any = {}) {
  await supabase.from("rita_conversations").upsert({ phone, state, data: convData, updated_at: new Date().toISOString() }, { onConflict: "phone" });
}
async function clearConvState(phone: string) {
  await supabase.from("rita_conversations").delete().eq("phone", phone);
}

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

async function fetchRutaDetail(message: string): Promise<any | null> {
  const msg2 = norm(message);
  const stopWords = new Set(["que","me","recomiendas","para","rutas","ruta","hay","el","la","los","las","una","un","de","en","por","como","cual","donde","puedo","ir","quiero","hola","rita","buenos","dias","buenas","tardes","noches","gracias","a","se","viajar","llegar","destino","recorrido","viaje"]);
  const keywords = msg2.split(/[\s,.\-]+/).map(w => w.trim()).filter(w => w.length > 2 && !stopWords.has(w));
  if (!keywords.length) return null;
  const orFilters = keywords.map(k => `destino.ilike.%${k}%,titulo.ilike.%${k}%,slug.ilike.%${k}%`).join(",");
  const { data } = await supabase.from("rita_rutas").select("*").or(orFilters).limit(3);
  return data?.length ? data : null;
}

async function fetchMunicipioInfo(message: string): Promise<any[]> {
  const msg2 = norm(message);
  const stopWords = new Set(["que","me","recomiendas","para","hay","el","la","los","las","una","un","de","en","por","como","cual","donde","puedo","ir","quiero","hola","rita","buenos","dias","buenas","tardes","noches","gracias","a","se","conocer","visitar","municipio","pueblo","ciudad","info","informacion","sobre"]);
  const keywords = msg2.split(/[\s,.\-]+/).map(w => w.trim()).filter(w => w.length > 2 && !stopWords.has(w));
  if (!keywords.length) return [];
  const orFilters = keywords.map(k => `nombre.ilike.%${k}%`).join(",");
  const { data } = await supabase.from("rita_municipios").select("nombre, subregion, altitud_msnm, temperatura_c, distancia_medellin_km, tiempo_medellin, como_llegar, historia, atractivos, gastronomia, festividades, tipo_via, dificultad_moto, tips_moto, notas_adicionales").or(orFilters).limit(3);
  return data || [];
}

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

async function fetchGarageMoto(marca: string, modelo?: string): Promise<any | null> {
  let query = supabase.from("garage_motos").select("*").ilike("marca", `%${marca}%`);
  if (modelo) query = query.ilike("modelo", `%${modelo}%`);
  const { data } = await query.limit(2);
  return data?.length ? data : null;
}

const NIVELES_SELLO = [
  { min: 0, nombre: "Novato", icono: "🔰" },
  { min: 50, nombre: "Explorador", icono: "🧭" },
  { min: 150, nombre: "Trotamundos", icono: "🗺️" },
  { min: 350, nombre: "Leyenda Motera", icono: "🏆" },
  { min: 700, nombre: "Maestro de las Rutas", icono: "👑" },
];
function nivelForPuntos(puntos: number) {
  let n = NIVELES_SELLO[0];
  for (const x of NIVELES_SELLO) if (puntos >= x.min) n = x;
  return n;
}

async function fetchSellosRider(phone: string): Promise<any | null> {
  try {
    const tel = phone.replace(/^57/, "");
    const { data: rider } = await supabase.from("riders").select("id, nombre").or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`).maybeSingle();
    if (!rider) return null;
    const { data: sellos } = await supabase.from("sellos").select("municipio_id, created_at, estado").eq("rider_id", rider.id).eq("estado", "aprobado");
    const { data: municipios } = await supabase.from("municipios").select("id, puntos_sello");
    const puntosByMuni = new Map((municipios || []).map((m: any) => [m.id, m.puntos_sello || 10]));
    const puntos = (sellos || []).reduce((acc: number, s: any) => acc + (puntosByMuni.get(s.municipio_id) || 10), 0);
    const nivel = nivelForPuntos(puntos);
    return {
      nombre: rider.nombre,
      total: sellos?.length || 0,
      municipios: sellos?.map((s: any) => s.municipio_id) || [],
      puntos,
      nivel: nivel.nombre,
      nivel_icono: nivel.icono,
    };
  } catch { return null; }
}

async function fetchAntioquiaMagica(searchTerm: string): Promise<any[]> {
  try {
    const r = await fetch(`https://turismoantioquia.travel/wp-json/wp/v2/posts?search=${encodeURIComponent(searchTerm)}&per_page=3&_fields=title,excerpt,link`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return [];
    const items = await r.json();
    return (items || []).map((i: any) => ({
      fuente: "Antioquia es Magica",
      titulo: (i.title?.rendered || "").replace(/&amp;/g, "&").replace(/&#8211;/g, "-"),
      resumen: (i.excerpt?.rendered || "").replace(/<[^>]+>/g, "").trim().slice(0, 250),
      link: i.link || "",
    }));
  } catch { return []; }
}

// --- Busqueda semantica sobre ridera_content (posts, paginas y rutas de
// ridera.com.co, embebidos con Voyage AI via wp-content-sync) ---
const VOYAGE_MODEL = "voyage-3";
let cachedVoyageKey: string | null = null;

async function getVoyageKey(): Promise<string | null> {
  if (cachedVoyageKey) return cachedVoyageKey;
  try {
    const { data } = await supabase.rpc("get_vault_secret", { secret_name: "voyage_api_key" });
    cachedVoyageKey = (data as string) || null;
    return cachedVoyageKey;
  } catch { return null; }
}

async function fetchRideraSemantic(message: string): Promise<any[]> {
  try {
    const apiKey = await getVoyageKey();
    if (!apiKey) return [];
    const embRes = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: [message], model: VOYAGE_MODEL, input_type: "query" }),
      signal: AbortSignal.timeout(8000),
    });
    if (!embRes.ok) return [];
    const embData = await embRes.json();
    const vector = embData?.data?.[0]?.embedding;
    if (!vector) return [];
    const { data, error } = await supabase.rpc("match_ridera_content", {
      query_embedding: vector,
      match_count: 4,
      match_threshold: 0.3,
    });
    if (error) { console.error("match_ridera_content error:", error); return []; }
    return (data || []).map((r: any) => ({
      tipo: r.categoria,
      fuente: "ridera.com.co",
      titulo: r.titulo,
      resumen: r.chunk_text,
      link: r.url,
    }));
  } catch (e) {
    console.error("fetchRideraSemantic error:", e);
    return [];
  }
}

async function fetchSaludMotero(message: string, categoria: string): Promise<any[]> {
  try {
    const msg2 = norm(message);
    const { data } = await supabase.from("salud_motero_kb").select("tema, palabras_clave, contenido").eq("categoria", categoria);
    return (data || []).filter((row: any) => (row.palabras_clave || []).some((kw: string) => msg2.includes(norm(kw))));
  } catch { return []; }
}

async function fetchContext(message: string, phone: string): Promise<any> {
  const msg2 = norm(message);
  let searchTerm = "";
  for (const [_r, kws] of Object.entries(REGION_MAP)) {
    const m = kws.find(k => msg2.includes(k));
    if (m) { searchTerm = m; break; }
  }
  if (!searchTerm) {
    const stop = new Set(["que","me","recomiendas","para","rutas","ruta","hay","el","la","los","las","una","un","de","en","por","como","cual","donde","puedo","ir","quiero","hola","rita","buenos","dias","buenas","tardes","noches","gracias","oye","hey","parce","mira"]);
    searchTerm = msg2.split(/[\s,.\-]+/).filter(w => w.length > 3 && !stop.has(w)).slice(0, 4).join(" ");
  }

  const isGarageQ  = /aceite|filtro|freno|pastilla|cadena|llanta|bateria|abs|suspensi|ecu|mantenimiento|garage|motor|card[aá]n|transmisi|neumat|electri|diagn[oó]stic|taller|mecanico|servicio/.test(msg2);
  const isViaQ     = /\bvia\b|carretera|estado.*via|como esta.*via|derrumbe|cierre|peaje|paso|transitable|invias|condicion.*via/.test(msg2);
  const isClimaQ   = /clima|tiempo|llueve|lluvia|temperatura|calor|frio|siata|nublado|aguacero|tormenta|niebla|condicion.*clima|va a llover|esta lloviendo/.test(msg2);
  const isSimpleChat = /^(hola|buenos|buenas|hey|ey|que tal|como estas|gracias|ok|dale|listo|chao|nos vemos)/.test(msg2) && msg2.split(/\s+/).length <= 5;
  const isSellosQ  = /sello|pasaporte|cuantos|llevo|municipio.*llevo|progreso|avance/.test(msg2);
  const isGrua     = /grua|remolque|averia|varad/.test(msg2);
  const isPicoPlacaQ = /pico.*placa|placa.*pico|restriccion.*vehic|dia.*sin.*carro|puedo.*circular|no.*circular|exent|via.*exent/.test(msg2);
  const isEmergenciaQ = /accidente|choque|choco|me cai|se cayo|atropell|volco|no respira|no responde|inconsciente|desmayado|no reacciona|sangre|sangrando|sangrado|hemorragia|herida abierta|fractura|se quebro|hueso roto|no puede mover|deformidad|quemadura|quemado|me queme|ataque de asma|crisis asmatica|se ahoga|no puede respirar/.test(msg2);
  const isSaludViajeQ = /frio|helado|calor|sudando|deshidrat|insolacion|gripa|gripe|resfriado|tos\b|fiebre|garganta|ronco|ronquera|ojos|ojo rojo|ardor ojos|vision borrosa|espalda|lumbar|lumbago|piernas|entumecid|hormigueo|hemorroides|almorranas|sueño|cansado|fatiga|bostezando|dolor de cabeza|cervical|casco aprieta|picadura|pico un insecto|abeja|avispa|mordida|mordedura|mal de paramo|soroche|calambre|muñecas|dolor de manos|quemadura solar|protector solar|rozadura|alergia al casco|colico|menstru|oidos|zumbido|pitido en el oido|no he comido|mareo por hambre|medicamento|antihistaminico|nariz tapada|congestion nasal|mucosidad|boca seca|labios partidos|tos seca|humo|smog|pecho apretado/.test(msg2);
  const isCuidadosManejoQ = /manejar en lluvia|manejo en lluvia|niebla|neblina|distancia de seguridad|punto ciego|animal en la via|ganado en la via|trocha|via destapada|equipo de proteccion|casco certificado|sobrecargad|celular manejando|revision antes de salir|chequeo antes de viajar|consejos.*manejar|cuidados.*conducir|precaucion.*manejar/.test(msg2);

  const fetches: Promise<any>[] = [];

  fetches.push(!isGarageQ && !isSimpleChat ? fetchRideraSemantic(message) : Promise.resolve([]));

  fetches.push(
    fetch(`${SB_URL}/functions/v1/garage-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}` },
      body: JSON.stringify({ query: message }),
    }).then(r => r.json()).catch(() => ({ resultados: [] }))
  );

  fetches.push(fetchMunicipioInfo(message));
  fetches.push(fetchTalleres(message));
  fetches.push(!isSimpleChat && !isGarageQ && searchTerm.length > 2 ? fetchAntioquiaMagica(searchTerm) : Promise.resolve([]));
  fetches.push(isSellosQ ? fetchSellosRider(phone) : Promise.resolve(null));
  fetches.push(isClimaQ ? getCoordsForDestino(message).then(async (coords) => {
    const [climaData, siataData] = await Promise.all([
      coords ? fetchClimaOpenMeteo(coords.lat, coords.lon, coords.nombre) : fetchClimaOpenMeteo(6.2442, -75.5812, "Medellin"),
      fetchAlertasSIATA(),
    ]);
    return { climaData, siataData };
  }) : Promise.resolve(null));
  fetches.push(isViaQ && searchTerm.length > 2 ? fetchEstadoViasINVIAS(searchTerm) : Promise.resolve(null));
  fetches.push(isEmergenciaQ ? fetchSaludMotero(message, "primeros_auxilios") : Promise.resolve([]));
  fetches.push(!isEmergenciaQ && isSaludViajeQ ? fetchSaludMotero(message, "salud_viaje") : Promise.resolve([]));
  fetches.push(!isEmergenciaQ && isCuidadosManejoQ ? fetchSaludMotero(message, "cuidados_manejo") : Promise.resolve([]));

  const [rideraSemantic, garageRes, municipiosRes, talleresRes, antioquiaRes, sellosRes, climaRes, inviasRes, emergenciaRes, saludViajeRes, cuidadosManejoRes] = await Promise.all(fetches);

  const resultados = [
    ...(rideraSemantic || []),
    ...(garageRes?.resultados || []),
    ...(antioquiaRes || []),
  ].filter((r: any) => r.titulo || r.resumen);

  const tramiteKey = detectTramites(message);
  let tramitesCtx = null;
  if (tramiteKey === "all") tramitesCtx = TRAMITES;
  else if (tramiteKey) tramitesCtx = { [tramiteKey]: TRAMITES[tramiteKey] };

  const marcaMencionada = MARCAS.find(m => msg2.includes(m)) || "";
  let garageMotoData = null;
  if (marcaMencionada && isGarageQ) {
    const words = msg2.split(/\s+/);
    const marcaIdx = words.findIndex(w => w === marcaMencionada.split(" ")[0]);
    const posibleModelo = words.slice(marcaIdx + 1, marcaIdx + 3).join(" ");
    garageMotoData = await fetchGarageMoto(marcaMencionada, posibleModelo || undefined);
  }

  return { resultados, tramitesCtx, marcaMencionada, garageMotoData, isGrua, isGarageQ, isClimaQ, isViaQ, isPicoPlacaQ, isEmergenciaQ, searchTerm, municipios: municipiosRes, talleres: talleresRes, sellos: sellosRes, clima: climaRes, estadoVias: inviasRes, emergencia: emergenciaRes, saludViaje: saludViajeRes, cuidadosManejo: cuidadosManejoRes };
}

function getPicoPlacaPromptBlock(): string {
  const ahora = new Date();
  const inicioS2 = new Date("2026-08-03T00:00:00-05:00");
  const esS2 = ahora >= inicioS2;

  if (esS2) {
    return `PICO Y PLACA - MEDELLIN Y AREA METROPOLITANA (2do Semestre 2026):
Rotacion vigente desde lunes 3 de agosto 2026.
Horario: 5:00 a.m. a 8:00 p.m.
Carros particulares, camperos, motocarros y cuatrimotos (ULTIMO numero de la placa):
- Lunes: 5 y 8
- Martes: 1 y 4
- Miercoles: 0 y 2
- Jueves: 3 y 6
- Viernes: 7 y 9
Motos de 2 y 4 tiempos, mototriciclos, tricimotos y ciclomotores (PRIMER numero de la placa):
- Lunes: 5 y 8
- Martes: 1 y 4
- Miercoles: 0 y 2
- Jueves: 3 y 6
- Viernes: 7 y 9`;
  }

  return `PICO Y PLACA - MEDELLIN Y AREA METROPOLITANA (1er Semestre 2026):
Rotacion vigente desde 2 de febrero 2026 hasta 31 de julio 2026.
NUEVA ROTACION el 3 de agosto 2026.
Horario: 5:00 a.m. a 8:00 p.m.
Carros particulares, camperos, motocarros y cuatrimotos (ULTIMO numero de la placa):
- Lunes: 1 y 7
- Martes: 0 y 3
- Miercoles: 4 y 6
- Jueves: 5 y 9
- Viernes: 2 y 8
Motos de 2 y 4 tiempos, mototriciclos, tricimotos y ciclomotores (PRIMER numero de la placa):
- Lunes: 1 y 7
- Martes: 0 y 3
- Miercoles: 4 y 6
- Jueves: 5 y 9
- Viernes: 2 y 8`;
}

function buildSystemPrompt(riderCtx: any): string {
  let riderInfo = "";
  if (riderCtx?.encontrado) {
    const p = riderCtx.perfil || {};
    const parts: string[] = [];
    if (p.nombre) parts.push(`Se llama ${p.nombre}`);
    if (p.moto) parts.push(`Moto: ${p.moto}`);
    if (p.ciudad) parts.push(`Ciudad: ${p.ciudad}`);
    if (p.placa) parts.push(`Placa: ${p.placa}`);
    if (riderCtx.pico_placa?.mensaje) parts.push(`Pico y placa: ${riderCtx.pico_placa.mensaje}`);
    if (riderCtx.documentos?.alertas?.length) parts.push(`Alertas docs: ${riderCtx.documentos.alertas.join(", ")}`);
    if (riderCtx.documentos?.soat) parts.push(`SOAT: ${riderCtx.documentos.soat}`);
    if (riderCtx.documentos?.tecno) parts.push(`Tecnomecanica: ${riderCtx.documentos.tecno}`);
    if (riderCtx.eventos_proximos?.length) parts.push(`Eventos: ${riderCtx.eventos_proximos.map((e: any) => e.titulo || e).join(", ")}`);
    riderInfo = `\n\nDATOS DEL RIDER:\n${parts.join("\n")}`;
  }

  const picoPlacaBlock = getPicoPlacaPromptBlock();

  return `Eres Rita, la parcera motera de Ridera (ridera.com.co). Motociclista colombiana, calida, directa, con sabor paisa sin exagerar.

COMO HABLAS:
- WhatsApp entre amigos moteros. Frases cortas, naturales.
- "parce", "dale", "pilas", "bacano" cuando fluyan natural.
- 1-3 emojis por mensaje. NO empezar con Hola! siempre.
- Maximo 6-8 lineas. Saludo simple: 1-3 lineas.
- NO listas con vinetas a menos que des links o datos tecnicos.

REGLA ABSOLUTA NO INVENTAR:
- SOLO responde con datos que aparezcan en el CONTEXTO proporcionado.
- Si no hay datos, di: "Ahi si no tengo esa info verificada todavia, parce. Puedes consultar en ridera.com.co"
- NUNCA inventes datos tecnicos, precios, distancias, talleres, hoteles, horarios.
- Si el contexto tiene datos parciales, comparte SOLO lo que hay.

${picoPlacaBlock}
Sabado y domingo: NO hay pico y placa.

VIAS EXENTAS (se puede circular con pico y placa):
- Avenida Regional (en jurisdiccion de Medellin)
- Autopista Sur (en jurisdiccion de Medellin)
- Via Las Palmas
- Via 4.1 al Occidente Antioqueno (conexion vial Aburra-Rio Cauca)
- Conexion Avenida 33 entre Autopista Sur y Avenida Las Palmas
- Calle 10 entre el eje vial del rio y la Terminal del Sur
- Corregimientos de Medellin

VEHICULOS EXENTOS (no les aplica pico y placa):
- Vehiculos electricos de cero emisiones
- Vehiculos dedicados a gas combustible
- Vehiculos hibridos registrados en el RUNT

Fuente: Area Metropolitana del Valle de Aburra / www.medellin.gov.co

FUENTES:
- rita_rutas: rutas verificadas con km, duracion, dificultad, tips
- rita_municipios: info completa de destinos (atractivos, gastronomia, historia, tips moto)
- garage_motos: datos tecnicos de motos (55 modelos)
- ridera_content: busqueda semantica sobre TODO el contenido publicado de ridera.com.co (posts, paginas, rutas)
- Open-Meteo: clima en tiempo real por coordenadas GPS
- SIATA: alertas de lluvia y clima Antioquia (si disponible)
- INVIAS: estado de carreteras nacionales (si disponible)
- Talleres: talleres aprobados por Ridera
- Pasaporte 125: sellos acumulados del rider
- Tramites: SOAT, SIMIT, RUNT, impuestos, tecnomecanica (links oficiales)
- Gruas: gruas.ridera.com.co o boton SOS

REGLAS DE RESPUESTA:
- Rutas: incluir km, duracion, dificultad y link ridera.com.co al final.
- CLIMA: si hay datos de Open-Meteo, dar temperatura, lluvia y nivel de riesgo para motero. Si hay alerta SIATA, mencionarla primero.
- INVIAS: si hay datos de vias, compartirlos. Si fallo, dar el enlace directo de INVIAS y el telefono gratuito.
- Municipios: usar atractivos, gastronomia y tips_moto del contexto.
- Sellos: si el rider pregunta cuantos lleva, responder con total/125 y animo.
- Grua -> gruas.ridera.com.co y boton SOS.
- PICO Y PLACA: usa SIEMPRE la tabla de arriba. Para motos usa el PRIMER digito de la placa. Para carros el ULTIMO. Indica el dia y horario. Si preguntan por vias o vehiculos exentos, usar la info de arriba.
- Rider NO registrado: sugerir registro cada 3-4 intercambios.
- Si el mensaje empieza con "[Foto recibida]": es una descripcion de una imagen que el usuario mando. Responde de forma natural sobre lo que se ve (documento, moto, daño, ruta) como si tu la hubieras visto, sin mencionar que "recibiste una descripcion".
- EMERGENCIAS Y SALUD: si el contexto interno trae una guia de EMERGENCIA, esa es tu maxima prioridad sobre cualquier otro tema de la conversacion. Nunca actues como medico ni des diagnostico: solo guia con los pasos de primeros auxilios basicos que te dan, siempre insistiendo primero en llamar al 123. Para temas de salud del motero (frio, calor, dolor, etc, sin ser emergencia), da el consejo practico de forma breve y cercana, y recomienda ver a un medico si persiste.
${riderInfo}`;
}

async function askClaude(message: string, history: { role: string; content: string }[], context: any, riderCtx: any): Promise<string> {
  const systemPrompt = buildSystemPrompt(riderCtx);
  let contextBlock = "";

  const hasData = context.resultados?.length || context.tramitesCtx || context.isGrua ||
    context.municipios?.length || context.talleres?.length || context.rutaDetail ||
    context.garageMotoData || context.sellos || context.clima || context.estadoVias || context.isPicoPlacaQ ||
    context.emergencia?.length || context.saludViaje?.length || context.cuidadosManejo?.length;

  if (!hasData && !context.marcaMencionada) {
    contextBlock += `\nSIN DATOS DISPONIBLES. NO inventes. Di que no tienes esa info.`;
  }

  if (context.isPicoPlacaQ) {
    contextBlock += `\nPICO Y PLACA: El usuario pregunta sobre pico y placa. Usa la tabla del system prompt para responder. Recuerda: motos usan el PRIMER digito, carros el ULTIMO. Si pregunta por vias exentas o vehiculos exentos, usa esa info tambien.`;
  }

  if (context.emergencia?.length) {
    contextBlock += `\n\n🚨 EMERGENCIA DETECTADA — PRIORIDAD MAXIMA. Responde con extrema calma y firmeza, en pasos numerados cortos y claros (mensajes de WhatsApp, no parrafos largos). SIEMPRE lo PRIMERO en tu respuesta debe ser: "Llama YA al 123" (o confirma que ya llamaron). Nunca des diagnostico medico. Usa esta guia:\n${context.emergencia.map((e: any) => `[${e.tema}]\n${e.contenido}`).join("\n\n")}\nSi el usuario manda una foto de la persona lesionada, descibe solo lo objetivamente visible (sangrado, si luce consciente, deformidad aparente) para reforzar las instrucciones, SIN diagnosticar. Sigue preguntando "sigue respirando?", "el sangrado para con presion?", etc. y ofrece mantenerte en la conversacion hasta que llegue la ambulancia.`;
  }
  if (context.saludViaje?.length) {
    contextBlock += `\nCUIDADOS DE SALUD DEL MOTERO (no es emergencia, da consejo practico y breve, y sugiere ver un medico si persiste o empeora):\n${context.saludViaje.map((e: any) => `[${e.tema}]\n${e.contenido}`).join("\n\n")}`;
  }
  if (context.cuidadosManejo?.length) {
    contextBlock += `\nPRECAUCIONES DE MANEJO (consejos de seguridad vial, da respuesta practica y breve):\n${context.cuidadosManejo.map((e: any) => `[${e.tema}]\n${e.contenido}`).join("\n\n")}`;
  }
  if (context.clima) {
    if (context.clima.siataData) contextBlock += `\n${context.clima.siataData}`;
    if (context.clima.climaData) contextBlock += `\n${context.clima.climaData}`;
    if (!context.clima.siataData && !context.clima.climaData) contextBlock += `\nCLIMA: Sin datos. Sugiere consultar siata.gov.co`;
  }
  if (context.estadoVias) contextBlock += `\n${context.estadoVias}`;

  if (context.rutaDetail) {
    const rutas = Array.isArray(context.rutaDetail) ? context.rutaDetail : [context.rutaDetail];
    for (const r of rutas) {
      contextBlock += `\nRUTA: ${r.titulo} | ${r.km}km | ${r.duracion} | ${r.dificultad} | Moto: ${r.moto_recomendada || "Cualquier moto"} | Superficie: ${r.superficie} | Mejor epoca: ${r.mejor_epoca}\nResumen: ${r.resumen}\nTips: ${r.tips}\nGasolina: ${r.gasolina_tip}\nHospedaje: ${r.hospedaje}\nGastronomia: ${r.gastronomia}\nLink: ${r.wp_link}\n`;
    }
  }
  if (context.municipios?.length) contextBlock += `\nMUNICIPIOS: ${JSON.stringify(context.municipios, null, 0)}`;
  if (context.garageMotoData) contextBlock += `\nGARAGE (${context.marcaMencionada}): ${JSON.stringify(context.garageMotoData, null, 0)}`;
  if (context.resultados?.length) contextBlock += `\nWEB: ${JSON.stringify(context.resultados, null, 0)}`;
  if (context.talleres?.length) contextBlock += `\nTALLERES: ${JSON.stringify(context.talleres, null, 0)}`;
  if (context.tramitesCtx) contextBlock += `\nTRAMITES: ${JSON.stringify(context.tramitesCtx, null, 0)}`;
  if (context.sellos) contextBlock += `\nPASAPORTE 125: ${context.sellos.nombre} lleva ${context.sellos.total}/125 sellos, ${context.sellos.puntos} puntos, nivel ${context.sellos.nivel_icono} ${context.sellos.nivel}. Puede ver el ranking completo en gruas.ridera.com.co/leaderboard.html`;
  if (context.isGrua) contextBlock += `\nGRUA: gruas.ridera.com.co y boton SOS.`;
  if (context.marcaMencionada && !context.garageMotoData) contextBlock += `\nMarca: ${context.marcaMencionada} (sin datos en Garage).`;

  const messages: { role: string; content: string }[] = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: "user", content: contextBlock ? `${message}\n\n---CONTEXTO INTERNO---\n${contextBlock}` : message },
  ];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 800, system: systemPrompt, messages }),
    });
    const data = await res.json();
    return data?.content?.[0]?.text || "";
  } catch (e) {
    console.error("Claude error:", e);
    return "";
  }
}

function parseMotoResponse(text: string): { marca: string; modelo: string; cc: number | null; anio: string | null } | null {
  const t = text.trim();
  if (t.split(/\s+/).length < 2) return null;
  const marca = MARCAS.find(m => norm(t).includes(m));
  if (!marca) return null;
  const words = t.split(/\s+/);
  const yearMatch = t.match(/\b(19|20)\d{2}\b/);
  const ccMatch = t.match(/\b(\d{2,4})\s*cc\b/i) || t.match(/\b(\d{3,4})\b(?!.*\b(19|20)\d{2})/);
  const modelo = words.filter(w => { const wn = norm(w); return !MARCAS.some(m => m.split(" ")[0] === wn) && !/^(19|20)\d{2}$/.test(w) && !/^\d{2,4}cc$/i.test(w); }).join(" ") || "";
  return { marca: marca.charAt(0).toUpperCase() + marca.slice(1), modelo, cc: ccMatch ? parseInt(ccMatch[1]) : null, anio: yearMatch ? yearMatch[0] : null };
}

async function handleRegistration(from: string, message: string, conv: { state: string; data: any }): Promise<string | null> {
  const msg2 = norm(message);
  if (conv.state === "waiting_name") {
    if (msg2.length < 2 || msg2.length > 60) return "No pille bien el nombre, como te llamas?";
    const nombre = message.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    await setConvState(from, "waiting_moto", { ...conv.data, nombre });
    return `${nombre}! Buena, parce. Que moto tienes? Dime marca y modelo:\nHonda CB500X 2022\nYamaha MT-07 700cc\n\nSi no tienes moto aun, dime "no tengo" y listo.`;
  }
  if (conv.state === "waiting_moto") {
    if (/no tengo|ninguna|no moto|sin moto|todavia no|aun no/.test(msg2)) {
      const nombre = conv.data.nombre || "Piloto";
      await supabase.from("riders").insert({ id: crypto.randomUUID(), nombre, telefono: from.replace(/^57/, ""), created_at: new Date().toISOString() });
      await clearConvState(from);
      return `Listo ${nombre}, quedaste registrado! En que te ayudo?`;
    }
    const looksLike = MARCAS.some(m => msg2.includes(m.split(" ")[0])) || /\d{3,4}\s*cc/i.test(msg2);
    if (!looksLike && msg2.split(/\s+/).length > 3) {
      await supabase.from("riders").insert({ id: crypto.randomUUID(), nombre: conv.data.nombre || "Piloto", telefono: from.replace(/^57/, ""), created_at: new Date().toISOString() });
      await clearConvState(from);
      return null;
    }
    const moto = parseMotoResponse(message);
    if (!moto) return "No pille la moto. Intenta: Honda CB500X 2022\n\nO dime no tengo y seguimos";
    const motoStr = [moto.marca, moto.modelo, moto.cc ? `${moto.cc}cc` : "", moto.anio].filter(Boolean).join(" ");
    await supabase.from("riders").insert({ id: crypto.randomUUID(), nombre: conv.data.nombre || "Piloto", telefono: from.replace(/^57/, ""), moto_marca: moto.marca, moto_modelo: moto.anio || moto.modelo, moto_cc: moto.cc, tipo_moto: moto.modelo, created_at: new Date().toISOString() });
    await clearConvState(from);
    return `Quedaste registrado con tu ${motoStr}! Ahora te doy info de mantenimiento, alertas de SOAT y mas. Que necesitas?`;
  }
  if (conv.state === "waiting_city") {
    const tel = from.replace(/^57/, "");
    await supabase.from("riders").update({ ciudad: message.trim() }).or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`);
    await clearConvState(from);
    return `Dale, guarde tu ciudad. En que te ayudo?`;
  }
  return null;
}

async function downloadWhatsAppMedia(mediaId: string): Promise<Uint8Array> {
  const metaRes = await fetch(`${GRAPH}/${mediaId}`, { headers: { "Authorization": `Bearer ${WA_TOKEN}` } });
  const meta = await metaRes.json();
  const audioRes = await fetch(meta.url, { headers: { "Authorization": `Bearer ${WA_TOKEN}` } });
  return new Uint8Array(await audioRes.arrayBuffer());
}
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function describeImage(imageBytes: Uint8Array, mimeType: string): Promise<string> {
  const base64 = toBase64(imageBytes);
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe esta imagen en español para una motociclista colombiana llamada Rita. " +
                "Si es un documento (SOAT, tecnomecánica, licencia, factura, multa), extrae fecha de vencimiento, " +
                "numero de placa, valores y cualquier dato clave visible. Si es una moto o un daño/problema mecánico, " +
                "describe qué se ve, la parte afectada y cualquier sintoma visible (fugas, oxido, desgaste, piezas rotas). " +
                "Si es una ruta, paisaje o lugar, describelo brevemente. Se conciso, maximo 5 lineas.",
            },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

async function transcribeAudio(audioBytes: Uint8Array, mimeType: string): Promise<string> {
  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "ogg";
  const form = new FormData();
  form.append("file", new Blob([audioBytes], { type: mimeType }), `audio.${ext}`);
  form.append("model", "whisper-1");
  form.append("language", "es");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { "Authorization": `Bearer ${OPENAI_KEY}` }, body: form });
  return (await res.json())?.text || "";
}
async function textToSpeech(text: string): Promise<Uint8Array> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "tts-1", voice: "nova", input: text, response_format: "opus" }),
  });
  return new Uint8Array(await res.arrayBuffer());
}
async function sendWhatsAppAudio(to: string, audioBytes: Uint8Array): Promise<any> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "audio/ogg; codecs=opus");
  form.append("file", new Blob([audioBytes], { type: "audio/ogg; codecs=opus" }), "rita.ogg");
  const uploadRes = await fetch(`${GRAPH}/${RITA_PHONE}/media`, { method: "POST", headers: { "Authorization": `Bearer ${WA_TOKEN}` }, body: form });
  const { id: mediaId } = await uploadRes.json();
  if (!mediaId) throw new Error("Media upload failed");
  const res = await fetch(`${GRAPH}/${RITA_PHONE}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "audio", audio: { id: mediaId } }),
  });
  return res.json();
}
async function sendWhatsApp(to: string, text: string): Promise<any> {
  const res = await fetch(`${GRAPH}/${RITA_PHONE}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  });
  return res.json();
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === "ridera_rita_2026") return new Response(challenge, { status: 200 });
    return new Response("Forbidden", { status: 403 });
  }
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!msg) return new Response(JSON.stringify({ ok: true, skip: true }), { status: 200, headers: { "Content-Type": "application/json" } });

      if (msg.type === "interactive") {
        const buttonReply = msg.interactive?.button_reply;
        const replyId = buttonReply?.id || "";
        const match = /^enc:([0-9a-f-]{36}):(\d+)$/.exec(replyId);
        if (match) {
          const [, encuestaId, opcionIndexStr] = match;
          const { data: encuesta } = await supabase.from("encuestas").select("opciones").eq("id", encuestaId).maybeSingle();
          const opcion = encuesta?.opciones?.[Number(opcionIndexStr)];
          if (opcion) {
            await supabase.from("encuesta_respuestas").upsert({
              encuesta_id: encuestaId,
              phone_number: msg.from,
              opcion_id: String(opcionIndexStr),
              opcion_label: opcion.label || buttonReply.title || "",
            }, { onConflict: "encuesta_id,phone_number" });
            await sendWhatsApp(msg.from, "¡Gracias por responder! 🏍️");
          }
        }
        return new Response(JSON.stringify({ ok: true, flow: "survey_reply" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      const from = msg.from || "";
      let message = "";
      let respondWithVoice = false;

      const imageMedia = msg.type === "image" && msg.image
        ? { id: msg.image.id, mime_type: msg.image.mime_type || "image/jpeg", caption: msg.image.caption }
        : msg.type === "document" && msg.document && (msg.document.mime_type || "").startsWith("image/")
        ? { id: msg.document.id, mime_type: msg.document.mime_type, caption: msg.document.caption }
        : null;

      if (msg.type === "audio" && msg.audio) {
        if (!OPENAI_KEY) { await sendWhatsApp(from, "Parce, por ahora no puedo escuchar audios. Me lo escribes?"); return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }); }
        try { message = await transcribeAudio(await downloadWhatsAppMedia(msg.audio.id), msg.audio.mime_type || "audio/ogg"); respondWithVoice = true; }
        catch { await sendWhatsApp(from, "No pude escuchar ese audio. Me lo repites?"); return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }); }
        if (!message.trim()) { await sendWhatsApp(from, "Uy, no pille que dijiste. Me lo repites?"); return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }); }
      } else if (imageMedia) {
        if (!OPENAI_KEY) { await sendWhatsApp(from, "Parce, por ahora no puedo ver fotos. Cuentame que necesitas por texto?"); return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }); }
        let description = "";
        try { description = await describeImage(await downloadWhatsAppMedia(imageMedia.id), imageMedia.mime_type); }
        catch { await sendWhatsApp(from, "No pude ver bien esa foto. Me la mandas de nuevo o me cuentas por texto?"); return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }); }
        if (!description.trim()) { await sendWhatsApp(from, "No distingui bien esa foto, parce. Me la mandas con mas luz o me cuentas por texto?"); return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }); }
        message = imageMedia.caption
          ? `[Foto recibida] ${description}\n\nMensaje junto a la foto: "${imageMedia.caption}"`
          : `[Foto recibida] ${description}`;
      } else if (msg.type === "document" && msg.document) {
        await sendWhatsApp(from, "Por ahora no puedo leer PDFs directamente, parce. Si me mandas una foto de lo que necesitas (SOAT, factura, tecnomecanica) si te ayudo.");
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      } else if (msg.text?.body) {
        message = msg.text.body;
      } else {
        return new Response(JSON.stringify({ ok: true, skip: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      await saveMessage(from, "user", message);

      const refMatch = /\bREF[\s-]?([A-Za-z0-9]{4,12})\b/i.exec(message);
      if (refMatch) {
        try {
          const codigo = refMatch[1].toUpperCase();
          const { data: referidor } = await supabase.from("riders").select("id").eq("codigo_referido", codigo).maybeSingle();
          const { data: yaRider } = await supabase.from("riders").select("id").or(`telefono.eq.${from},telefono.eq.${from.replace(/^57/, "")}`).maybeSingle();
          if (referidor && !yaRider) {
            await supabase.from("referidos").upsert({
              codigo, referidor_id: referidor.id, telefono_invitado: from, estado: "pendiente",
            }, { onConflict: "codigo,telefono_invitado" });
          }
        } catch { /* no bloquea el flujo normal */ }
      }

      const conv = await getConvState(from);
      if (conv.state !== "idle") {
        const regReply = await handleRegistration(from, message, conv);
        if (regReply) {
          await saveMessage(from, "assistant", regReply);
          respondWithVoice && OPENAI_KEY ? (async () => { try { await sendWhatsAppAudio(from, await textToSpeech(regReply)); } catch { await sendWhatsApp(from, regReply); } })() : await sendWhatsApp(from, regReply);
          return new Response(JSON.stringify({ ok: true, flow: "registration" }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }

      const msg2 = norm(message);
      if (/invitar|referir|mi codigo|codigo de referido|codigo referido/.test(msg2)) {
        const { data: yo } = await supabase.from("riders").select("id, nombre, codigo_referido, telefono").or(`telefono.eq.${from},telefono.eq.${from.replace(/^57/, "")}`).maybeSingle();
        if (yo?.codigo_referido) {
          const link = `https://wa.me/573117896717?text=REF%20${encodeURIComponent(yo.codigo_referido)}`;
          const r = `🏍️ Invita a un amigo y ambos ganan +50 puntos en el ranking Ridera. Comparte este link:\n\n${link}\n\nCuando escriba y se registre, les llega la recompensa automático.`;
          await saveMessage(from, "assistant", r);
          await sendWhatsApp(from, r);
          return new Response(JSON.stringify({ ok: true, flow: "invite_link" }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }
      if (/quiero registrarme|registrarme|registrame|inscribirme/.test(msg2)) {
        const riderCheck = await getRiderContext(from);
        if (!riderCheck?.encontrado) {
          await setConvState(from, "waiting_name", {});
          const r = "Dale! Vamos a registrarte para darte info personalizada de tu moto. Como te llamas?";
          await saveMessage(from, "assistant", r);
          await sendWhatsApp(from, r);
          return new Response(JSON.stringify({ ok: true, flow: "start_registration" }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }

      const [context, riderCtx, history, rutaDetail] = await Promise.all([
        fetchContext(message, from),
        getRiderContext(from),
        getHistory(from, 10),
        fetchRutaDetail(message),
      ]);

      if (rutaDetail) context.rutaDetail = rutaDetail;
      let reply = await askClaude(message, history, context, riderCtx);
      if (!reply) reply = "Uy parce, algo se cruzo. Me lo repites?";
      if (reply.length > 1600) reply = reply.slice(0, 1580) + "...\n\nMas en ridera.com.co";

      await saveMessage(from, "assistant", reply);

      if (respondWithVoice && OPENAI_KEY) {
        try { await sendWhatsAppAudio(from, await textToSpeech(reply)); }
        catch { await sendWhatsApp(from, reply); }
      } else {
        await sendWhatsApp(from, reply);
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e) {
      console.error("Rita error:", e);
      return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  }
  return new Response("Method not allowed", { status: 405 });
});
