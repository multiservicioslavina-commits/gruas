import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ── Config ──────────────────────────────────────────────────────────────
const WA_TOKEN      = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const RITA_PHONE    = Deno.env.get("RITA_PHONE_ID") ?? "1238785075974458";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const OPENAI_KEY    = Deno.env.get("OPENAI_API_KEY") ?? "";
const SB_URL        = Deno.env.get("SUPABASE_URL")!;
const SB_KEY        = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH         = "https://graph.facebook.com/v25.0";
const WP_API        = "https://ridera.com.co/wp-json/wp/v2";

const supabase = createClient(SB_URL, SB_KEY);

// ── Helpers ─────────────────────────────────────────────────────────────
function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// ── Trámites ─────────────────────────────────────────────────────────────
const TRAMITES: Record<string, { titulo: string; emoji: string; links: { nombre: string; url: string }[] }> = {
  soat: {
    titulo: "Comprar SOAT", emoji: "🛡️",
    links: [
      { nombre: "Sura", url: "https://www.segurossura.com.co/paginas/soat.aspx" },
      { nombre: "Bolívar", url: "https://www.segurosbolivar.com/soat" },
      { nombre: "Liberty", url: "https://www.libertyseguros.co/soat" },
      { nombre: "Mundial", url: "https://www.mundialseguros.com.co/soat" },
      { nombre: "Solidaria", url: "https://www.lasolidaria.com.co/soat" },
    ],
  },
  simit: {
    titulo: "SIMIT – Consulta de multas", emoji: "🚦",
    links: [
      { nombre: "Consultar multas y comparendos", url: "https://www.simit.org.co" },
      { nombre: "Acuerdos de pago", url: "https://www.simit.org.co/acuerdos-de-pago" },
    ],
  },
  runt: {
    titulo: "RUNT – Historial vehicular", emoji: "📋",
    links: [{ nombre: "Consultar historial", url: "https://www.runt.com.co/consultaCiudadana" }],
  },
  impuestos: {
    titulo: "Impuestos vehiculares", emoji: "💰",
    links: [
      { nombre: "Antioquia", url: "https://impuestos.antioquia.gov.co" },
      { nombre: "Valle del Cauca", url: "https://www.valledelcauca.gov.co/hacienda/publicaciones/vehiculos" },
      { nombre: "Cundinamarca", url: "https://impuestos.cundinamarca.gov.co" },
      { nombre: "Bogotá", url: "https://www.shd.gov.co/shd/vehiculos" },
      { nombre: "Eje Cafetero (Risaralda)", url: "https://www.risaralda.gov.co/hacienda" },
    ],
  },
  transitos: {
    titulo: "Tránsitos", emoji: "🏗️",
    links: [
      { nombre: "Medellín", url: "https://www.medellin.gov.co/movilidad" },
      { nombre: "Envigado", url: "https://www.transitoenvigado.gov.co" },
      { nombre: "Itagüí", url: "https://www.transitoitagui.gov.co" },
      { nombre: "Bello", url: "https://www.transitobello.gov.co" },
      { nombre: "Rionegro", url: "https://www.ttrionegro.gov.co" },
    ],
  },
  tecnomecanica: {
    titulo: "Tecnomecánica – CDAs", emoji: "🔧",
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

// ── Garage data (inlined – sin HTTP) ────────────────────────────────────
const TOPIC_INFO: Record<string, any> = {
  aceite: { titulo: "Cambio de Aceite", interval: "6.000–10.000 km / 1 año",
    lede: "El aceite es la sangre de tu motor. Cambiarlo a tiempo es lo más barato y más importante.",
    detalle: "Lubrica piezas en movimiento, disipa calor, arrastra residuos. Siempre JASO MA/MA2 para embrague húmedo.",
    pasos: "1. Calienta motor 3–5 min. 2. Drena, cambia filtro. 3. Unta aceite en junta del filtro. 4. Llena, arranca 30s, verifica nivel.",
    señales: "Aceite oscuro en mirilla. Cambios duros. Embrague patina en pendiente.",
    tip: "Espera 2 min después de llenar antes de leer la mirilla.", link: "https://ridera.com.co/garage-tecnico/" },
  filtroaire: { titulo: "Filtro de Aire", interval: "~15.000 km (menos en destapado)",
    lede: "Filtro tapado = pérdida de potencia y más consumo.", señales: "Potencia gradual baja. Mayor consumo.", tip: "Golpea el filtro de canto para soltar polvo.",
    warn: "No soples filtro de papel con compresor a alta presión.", link: "https://ridera.com.co/garage-tecnico/" },
  frenos: { titulo: "Sistema de Frenos", interval: "Pastillas 15–25K km · líquido cada 2 años",
    lede: "El único sistema cuyo fallo no perdona.",
    señales: "Chirrido metálico = testigo de desgaste. Vibración = disco alabeado. Maneta esponjosa = aire en líquido.",
    tip: "Al cambiar pastillas, limpia y engrasa pasadores de la mordaza.", link: "https://ridera.com.co/garage-tecnico/" },
  abs: { titulo: "Sistema ABS", interval: "Revisión de sensores en cada servicio",
    lede: "El ABS evita bloqueo de ruedas para que sigas controlando al frenar fuerte.",
    señales: "Testigo ABS encendido = sistema desactivado. Causa #1: sensor con barro.",
    tip: "Después de lavar, si aparece el testigo limpia el sensor con limpiacontactos.", link: "https://ridera.com.co/garage-tecnico/" },
  suspension: { titulo: "Suspensión", interval: "Retenes: revisar siempre · service ~40K km",
    lede: "Mal ajustada, la moto rebota y pierdes confianza.",
    señales: "Línea de aceite en barras = retén dañado.", tip: "Calibra el sag: con tu peso debe hundirse un tercio del recorrido.",
    warn: "Retén con fuga de aceite cae sobre pastillas. Retén con fuga = no rodar.", link: "https://ridera.com.co/garage-tecnico/" },
  bateria: { titulo: "Batería", interval: "Vida útil 3–5 años",
    lede: "Batería débil genera fallas eléctricas raras.",
    señales: "Arranque lento. Luces tenues. Reloj se reinicia.",
    tip: "Mide voltaje en reposo (~12.6V) y a 3–4K rpm (debe subir a 13.5–14.5V).",
    warn: "Nunca arranques con cables de carro encendido.", link: "https://ridera.com.co/garage-tecnico/" },
  ecu: { titulo: "ECU y Diagnóstico", interval: "Escaneo ante cualquier testigo",
    lede: "La ECU guarda el motivo exacto de cada falla en un código DTC.",
    tip: "Lee el código antes de ir al taller.", warn: "Borrar el código no arregla la falla.", link: "https://ridera.com.co/garage-tecnico/" },
  llantas: { titulo: "Llantas y Neumáticos", interval: "Presión cada 2 semanas · vida 5–6 años",
    lede: "La presión es el ajuste gratis más importante.",
    señales: "Desgaste disparejo = presión incorrecta o suspensión mal ajustada.",
    tip: "Lee el código DOT (últimos 4 dígitos = semana+año). Presión siempre en frío.", link: "https://ridera.com.co/garage-tecnico/" },
  cadena: { titulo: "Cadena y Transmisión", interval: "Lubricar cada 500–800 km · kit 25–35K km",
    lede: "Cadena, piñón y catalina siempre se cambian juntos.",
    señales: "Eslabones que no flexionan. Dientes con forma de gancho.",
    tip: "Lubrica con motor templado.", warn: "No limpies con gasolina, disuelve los O-ring.", link: "https://ridera.com.co/garage-tecnico/" },
  cardan: { titulo: "Transmisión por Cardán", interval: "Aceite según fabricante ~20K km",
    lede: "Bajo mantenimiento no es cero mantenimiento.", tip: "Engrasa los estriados cada vez que desmontes la rueda trasera.",
    warn: "Clonk al abrir/cerrar gas = holgura en junta universal.", link: "https://ridera.com.co/garage-tecnico/" },
  electrico: { titulo: "Sistema Eléctrico", interval: "Revisión de conexiones en cada service",
    lede: "Fallas eléctricas casi siempre son conexión floja o húmeda.",
    tip: "Revisa puntos de masa oxidados.", link: "https://ridera.com.co/garage-tecnico/" },
  valvulas: { titulo: "Reglaje de Válvulas", interval: "15.000–24.000 km según marca",
    lede: "Válvulas fuera de ajuste = pérdida de potencia y daño al motor.",
    señales: "Ruido 'tic-tic' metálico. Arranque difícil en frío.",
    tip: "Guarda los valores antes de desmontar.", warn: "No postergues el reglaje: daña la cabeza del motor.", link: "https://ridera.com.co/garage-tecnico/" },
};

function infoKey(s: string): string {
  if (s.includes("filtro") && s.includes("air")) return "filtroaire";
  if (s.includes("aceite") || s.includes("lubric")) return "aceite";
  if (s.includes("abs")) return "abs";
  if (s.includes("freno") || s.includes("pastilla")) return "frenos";
  if (s.includes("suspens")) return "suspension";
  if (s.includes("cardan") || s.includes("cardán")) return "cardan";
  if (s.includes("cadena") || s.includes("transmis")) return "cadena";
  if (s.includes("bater")) return "bateria";
  if (s.includes("ecu") || s.includes("diagn") || s.includes("testigo") || s.includes("codigo")) return "ecu";
  if (s.includes("llanta") || s.includes("neumat") || s.includes("presion") || s.includes("psi")) return "llantas";
  if (s.includes("electr") || s.includes("fusib")) return "electrico";
  if (s.includes("valvul") || s.includes("válvul") || s.includes("tic-tic")) return "valvulas";
  if (s.includes("motor")) return "aceite";
  return "";
}

const BRANDS = ["suzuki","yamaha","honda","bmw","triumph","kawasaki","ktm","ducati","aprilia","harley"];

async function searchGarageSpecs(query: string, riderBrand?: string): Promise<any[]> {
  const q = norm(query);
  const words = q.split(/[\s,.\-]+/).filter((w: string) => w.length > 2);
  const brand = BRANDS.find((b: string) => q.includes(b)) || (riderBrand ? norm(riderBrand) : "");

  // Alias de modelos populares que se mencionan sin marca
  const MODEL_ALIASES: Record<string, string> = {
    "tenere": "yamaha", "super tenere": "yamaha", "supertenere": "yamaha",
    "mt09": "yamaha", "mt07": "yamaha", "mt03": "yamaha", "mt 09": "yamaha", "mt 07": "yamaha",
    "tracer": "yamaha", "r1": "yamaha", "r6": "yamaha",
    "vstrom": "suzuki", "vstron": "suzuki", "v-strom": "suzuki", "v strom": "suzuki",
    "dl650": "suzuki", "dl1000": "suzuki", "dl 650": "suzuki",
    "gsx": "suzuki", "gsxr": "suzuki", "hayabusa": "suzuki",
    "africa twin": "honda", "africatwin": "honda", "crf": "honda", "cbr": "honda", "cb500": "honda",
    "ninja": "kawasaki", "versys": "kawasaki", "z900": "kawasaki", "z650": "kawasaki",
    "gs": "bmw", "r1250": "bmw", "r1200": "bmw", "r1300": "bmw",
    "f850": "bmw", "f750": "bmw", "f700": "bmw", "s1000": "bmw",
    "street triple": "triumph", "tiger": "triumph", "bonneville": "triumph",
    "duke": "ktm",
  };

  let resolvedBrand = brand;
  if (!resolvedBrand) {
    for (const [alias, marka] of Object.entries(MODEL_ALIASES)) {
      if (q.includes(alias)) { resolvedBrand = marka; break; }
    }
  }
  if (!resolvedBrand) return [];

  // Exclude generic words that aren't part of a model name
  const QUERY_STOPWORDS = new Set(["manual","pdf","moto","motos","mio","mia","para","que","del","como","cual","tiene","tengo","dame"]);
  const modelKeywords = words.filter((w: string) => !BRANDS.includes(w) && w.length > 2 && !QUERY_STOPWORDS.has(w));
  let dbQuery = supabase
    .from("garage_motos")
    .select("id,marca,modelo,años,aceite_litros,aceite_spec,torque_filtro,cambio_aceite_km,llantas_psi,variantes,mantenimiento,fallas")
    .ilike("marca", `%${resolvedBrand}%`);

  // Normalizar typos comunes para que matcheen modelo/id en DB
  const TYPO_FIX: Record<string, string> = { "vstron": "vstrom", "teneré": "tenere", "supertenere": "tenere" };
  const fixedKeywords = modelKeywords.map((w: string) => TYPO_FIX[w] || w);

  if (fixedKeywords.length > 0) {
    const numMatch = fixedKeywords.find((w: string) => /^\d{3,4}$/.test(w));
    const wordMatches = fixedKeywords.filter((w: string) => !/^\d+$/.test(w));
    const orFilters: string[] = [];
    for (const w of wordMatches.slice(0, 3)) {
      orFilters.push(`modelo.ilike.%${w}%`);
      orFilters.push(`id.ilike.%${w}%`); // id no tiene acentos, match seguro
    }
    if (orFilters.length > 0) dbQuery = (dbQuery as any).or(orFilters.join(","));
    // El número (650, 1000...) se aplica como AND aparte: "vstrom 650" no debe traer la 1000
    if (numMatch) dbQuery = (dbQuery as any).or(`modelo.ilike.%${numMatch}%,id.ilike.%${numMatch}%`);
  }

  const { data } = await dbQuery.limit(3);
  return data || [];
}

function buildGarageResult(moto: any, topicKey: string): any {
  const mant = (moto.mantenimiento || []) as any[];
  const fallas = (moto.fallas || []) as any[];
  const llantas = moto.llantas_psi || {};

  let llantasStr = "";
  if (llantas.delantera) llantasStr += `Del: ${llantas.delantera} PSI`;
  if (llantas.trasera_solo) llantasStr += ` | Tras solo: ${llantas.trasera_solo} PSI`;
  if (llantas.trasera_cargada) llantasStr += ` | Tras cargada: ${llantas.trasera_cargada} PSI`;

  let mantFiltrado = mant;
  const kws: Record<string, string[]> = {
    aceite: ["aceite","lubric"], filtroaire: ["filtro de aire","filtro aire"],
    frenos: ["freno","pastilla","disco"], cadena: ["cadena"], bateria: ["bateria"],
    valvulas: ["valvula","válvula"], cardan: ["card"], suspension: ["suspens"],
  };
  if (topicKey && topicKey !== "llantas" && kws[topicKey]) {
    const filtered = mant.filter((m: any) => kws[topicKey].some((k: string) => norm(m.item || "").includes(k)));
    if (filtered.length > 0) mantFiltrado = filtered;
  }

  return {
    tipo: "garage_moto_spec", marca: moto.marca, modelo: moto.modelo, años: moto.años,
    aceite: `${moto.aceite_litros} de ${moto.aceite_spec} — filtro: ${moto.torque_filtro} — cambio cada ${moto.cambio_aceite_km?.toLocaleString()} km`,
    llantas: llantasStr || null,
    mantenimiento: mantFiltrado.slice(0, 5).map((m: any) => `${m.item}: ${m.accion} — ${m.intervalo}`),
    fallas_comunes: fallas.slice(0, 3),
    link: "https://ridera.com.co/garage-tecnico/",
    ...(moto.variantes ? { variantes: moto.variantes } : {}),
  };
}

// ── Datos de región y ciudades ──────────────────────────────────────────
const REGION_MAP: Record<string, string[]> = {
  suroeste:  ["jardin","jerico","andes","tamesis","concordia","fredonia"],
  oriente:   ["guatape","san rafael","marinilla","la ceja","rionegro","santuario"],
  norte:     ["santa rosa","don matias","san pedro","entrerrios","yarumal","campamento","belmira"],
  occidente: ["santa fe","sopetran","olaya","liborina","buritica","caicedo"],
  eje:       ["pereira","armenia","manizales","filandia","quimbaya"],
  valle:     ["cali","palmira","buga","tulua","buenaventura"],
};

const CIUDADES_COL = [
  "medellin","bogota","cali","bucaramanga","pereira","manizales","armenia",
  "barranquilla","cartagena","cucuta","ibague","villavicencio","pasto",
  "monteria","sincelejo","valledupar","rionegro","bello","itagui","envigado",
  "sabaneta","la estrella","caldas","girardota","copacabana","guarne","marinilla",
];

function extractCiudad(m: string): string {
  return CIUDADES_COL.find((c: string) => m.includes(c)) || "";
}

// ── Historial ───────────────────────────────────────────────────────────
async function getHistory(phone: string, limit = 6): Promise<{ role: string; content: string }[]> {
  const { data } = await supabase
    .from("rita_messages")
    .select("role, content")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data || []).reverse();
}

async function saveMessage(phone: string, role: "user" | "assistant", content: string): Promise<void> {
  await supabase.from("rita_messages").insert({ phone, role, content });
  const { data: old } = await supabase
    .from("rita_messages").select("id").eq("phone", phone)
    .order("created_at", { ascending: false }).range(20, 999);
  if (old && old.length > 0) {
    await supabase.from("rita_messages").delete().in("id", old.map((r: any) => r.id));
  }
}

// ── Conversation state ──────────────────────────────────────────────────
async function getConvState(phone: string): Promise<{ state: string; data: any }> {
  const { data } = await supabase
    .from("rita_conversations").select("state, data").eq("phone", phone).maybeSingle();
  return data || { state: "idle", data: {} };
}

async function setConvState(phone: string, state: string, convData: any = {}) {
  await supabase.from("rita_conversations").upsert(
    { phone, state, data: convData, updated_at: new Date().toISOString() },
    { onConflict: "phone" }
  );
}

async function clearConvState(phone: string) {
  await supabase.from("rita_conversations").delete().eq("phone", phone);
}

// ── Rider context (directo a Supabase, sin HTTP) ────────────────────────
async function getRiderContext(phone: string): Promise<any> {
  try {
    const tel = phone.replace(/^57/, "");
    const { data } = await supabase
      .from("riders")
      .select("nombre, moto_marca, moto_modelo, moto_cc, ciudad, placa, soat_vence, tecno_vence")
      .or(`telefono.eq.${phone},telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();
    if (!data) return { encontrado: false };

    const moto = [data.moto_marca, data.moto_modelo, data.moto_cc ? `${data.moto_cc}cc` : ""].filter(Boolean).join(" ");
    const alertas: string[] = [];
    if (data.soat_vence) {
      const days = Math.ceil((new Date(data.soat_vence).getTime() - Date.now()) / 86400000);
      if (days < 30) alertas.push(`SOAT vence en ${days} días`);
    }
    if (data.tecno_vence) {
      const days = Math.ceil((new Date(data.tecno_vence).getTime() - Date.now()) / 86400000);
      if (days < 30) alertas.push(`Tecnomecánica vence en ${days} días`);
    }
    return {
      encontrado: true,
      perfil: { nombre: data.nombre, moto, ciudad: data.ciudad, placa: data.placa },
      documentos: alertas.length ? { alertas } : null,
    };
  } catch { return { encontrado: false }; }
}

// ── Route detail ─────────────────────────────────────────────────────────
async function fetchRutaDetail(message: string): Promise<any | null> {
  const msg2 = norm(message);
  if (!/ruta|viaje|viajar|ir a|destino|recorrido|como llego|llegar/.test(msg2) && msg2.split(/\s+/).length > 6) return null;
  const stopWords = new Set(["que","me","recomiendas","para","rutas","ruta","hay","el","la","los","las","una","un","de","en","por","como","cual","donde","puedo","ir","quiero","hola","rita","buenos","dias","buenas","tardes","noches","gracias","a","se"]);
  const keywords = msg2.split(/[\s,.\-]+/).map((w: string) => w.trim()).filter((w: string) => w.length > 2 && !stopWords.has(w));
  if (!keywords.length) return null;
  const orFilters = keywords.map((k: string) => `destino.ilike.%${k}%,titulo.ilike.%${k}%,slug.ilike.%${k}%`).join(",");
  const { data } = await supabase.from("rita_rutas").select("*").or(orFilters).limit(1);
  return data?.[0] || null;
}

// ── Ecosystem: talleres, almacenes, clubs, marketplace ──────────────────
async function fetchEcosistema(message: string, riderCtx: any): Promise<any> {
  const m = norm(message);
  const isTaller  = /taller|mecanic|servicio tecnico|reparar|mantenimiento moto|chequeo|donde llevar|llevar la moto|revision mecanica/.test(m);
  const isAlmacen = /almacen|repuesto|accesorio|tienda moto|donde compro|partes|pieza|donde encuentro/.test(m);
  const isClub    = /club|grupo moto|comunidad moto|rodada|salida grupal|grupo de moto/.test(m);
  const isMercado = /vender moto|vendo moto|comprar moto|moto en venta|mercado moto|marketplace/.test(m);
  if (!isTaller && !isAlmacen && !isClub && !isMercado) return null;

  const ciudad = extractCiudad(m) || (riderCtx?.perfil?.ciudad ? norm(riderCtx.perfil.ciudad) : "");
  const results: any = {};
  const fetches: Promise<void>[] = [];

  if (isTaller) {
    fetches.push((async () => {
      let q = supabase.from("talleres").select("nombre,ciudad,telefono,barrio,datos").eq("aprobado", true);
      if (ciudad) q = (q as any).ilike("ciudad", `%${ciudad}%`);
      const { data } = await (q as any).limit(5);
      if (data?.length) results.talleres = data.map((t: any) => ({
        nombre: t.nombre, ciudad: t.ciudad, telefono: t.telefono, barrio: t.barrio,
        marcas: t.datos?.marcas?.join(", ") || "",
        horario: t.datos?.hora_abre && t.datos?.hora_cierra ? `${t.datos.hora_abre}–${t.datos.hora_cierra}` : "",
      }));
    })());
  }

  if (isAlmacen) {
    fetches.push((async () => {
      let q = supabase.from("almacenes").select("nombre,ciudad,telefono,direccion,datos").eq("aprobado", true);
      if (ciudad) q = (q as any).ilike("ciudad", `%${ciudad}%`);
      const { data } = await (q as any).limit(5);
      if (data?.length) results.almacenes = data.map((a: any) => ({
        nombre: a.nombre, ciudad: a.ciudad, telefono: a.telefono,
        categorias: a.datos?.categorias?.join(", ") || a.datos?.categoria || "",
      }));
    })());
  }

  if (isClub) {
    fetches.push((async () => {
      let q = supabase.from("clubs").select("nombre,ciudad,datos");
      if (ciudad) q = (q as any).ilike("ciudad", `%${ciudad}%`);
      const { data } = await (q as any).limit(6);
      if (data?.length) results.clubs = data.map((c: any) => ({
        nombre: c.nombre, ciudad: c.ciudad,
        contacto: c.datos?.whatsapp || c.datos?.instagram || "",
      }));
    })());
  }

  if (isMercado) {
    fetches.push((async () => {
      const { data, count } = await supabase
        .from("motos_venta")
        .select("titulo,precio,ciudad,marca,modelo,anio", { count: "exact" })
        .eq("aprobado", true).eq("vendido", false).limit(3);
      results.marketplace = {
        total: count || 0,
        recientes: data?.map((m: any) => `${m.marca} ${m.modelo} ${m.anio || ""} — $${m.precio?.toLocaleString()} — ${m.ciudad}`) || [],
        link: "https://ridera.com.co/marketplace-motos/",
      };
    })());
  }

  await Promise.all(fetches);
  return Object.keys(results).length ? results : null;
}

// ── Context fetch (sin HTTP externo) ────────────────────────────────────
async function fetchContext(message: string, riderMotoMarca?: string): Promise<any> {
  const msg2 = norm(message);

  const hasMaintenanceKw = /aceite|filtro|freno|pastilla|cadena|llanta|bateria|abs|suspens|ecu|mantenimiento|garage|motor|cardan|transmis|neumat|electri|diagn|valvula|psi|presion/.test(msg2);
  // También disparar búsqueda de specs si mencionan solo una moto (ej: "y la vstrom 650", "qué tal la MT-09")
  const mentionsBrand = BRANDS.some((b: string) => msg2.includes(b));
  const mentionsAlias = ["tenere","vstrom","vstron","tracer","ninja","versys","hayabusa","africa twin","africatwin","dl650","dl1000","mt09","mt07","r1250","r1200","r1300","f850","f750","f700","s1000","duke","tiger","bonneville","street triple","gsxr"].some((a: string) => msg2.includes(a));
  const isShortMotoMention = (mentionsBrand || mentionsAlias) && msg2.split(/\s+/).length <= 8;
  const isGarageQ = hasMaintenanceKw || isShortMotoMention;
  const isSimpleChat = /^(hola|buenos|buenas|hey|ey|que tal|como estas|gracias|ok|dale|listo|chao|nos vemos)/.test(msg2) && msg2.split(/\s+/).length <= 5;
  const tramiteKey = detectTramites(message);
  const isGrua = /grua|remolque|averia|varad/.test(msg2);
  const marcaMencionada = BRANDS.find((m: string) => msg2.includes(m)) || "";

  const fetches: Promise<any>[] = [];

  // WordPress: solo si es búsqueda de rutas/info, no garage ni trámite
  const needsWP = !isGarageQ && !isSimpleChat && !tramiteKey;
  if (needsWP) {
    let searchTerm = "";
    for (const keywords of Object.values(REGION_MAP)) {
      const matched = keywords.find((k: string) => msg2.includes(k));
      if (matched) { searchTerm = matched; break; }
    }
    if (!searchTerm) {
      const stop = new Set(["que","me","recomiendas","para","rutas","ruta","hay","el","la","los","las","una","un","de","en","por","como","cual","donde","puedo","ir","quiero","hola","rita","buenos","dias","buenas","tardes","noches","gracias","oye","hey","parce","mira"]);
      searchTerm = msg2.split(/[\s,.\-]+/).map((w: string) => w.trim()).filter((w: string) => w.length > 3 && !stop.has(w)).slice(0, 4).join(" ");
    }
    if (searchTerm.length > 2) {
      const wpSearch = async (endpoint: string, tipo: string) => {
        try {
          const r = await fetch(`${WP_API}/${endpoint}?search=${encodeURIComponent(searchTerm)}&per_page=3&_fields=id,title,slug,excerpt,link`, { signal: AbortSignal.timeout(3000) });
          if (!r.ok) return [];
          const items = await r.json();
          return (items || []).map((i: any) => ({
            tipo, titulo: (i.title?.rendered || "").replace(/&amp;/g, "&").replace(/&#8211;/g, "–"),
            resumen: (i.excerpt?.rendered || "").replace(/<[^>]+>/g, "").trim().slice(0, 200),
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
  } else {
    fetches.push(Promise.resolve([]));
    fetches.push(Promise.resolve([]));
  }

  // Garage: directo a Supabase, sin HTTP
  if (isGarageQ) {
    fetches.push((async () => {
      const topicKey = infoKey(msg2);
      // Buscar por marca en el mensaje, o por la moto del rider
      const specs = await searchGarageSpecs(message, riderMotoMarca);
      if (specs.length > 0) return specs.map((s: any) => buildGarageResult(s, topicKey));
      // Fallback a info genérica
      if (topicKey && TOPIC_INFO[topicKey]) {
        const info = TOPIC_INFO[topicKey];
        return [{ tipo: "garage_general", sistema: info.titulo, intervalo: info.interval,
          resumen: info.lede, detalle: info.detalle || "", señales: info.señales || "",
          pasos: info.pasos || "", tip: info.tip, cuidado: info.warn || "", link: info.link }];
      }
      return [];
    })());
  } else {
    fetches.push(Promise.resolve([]));
  }

  const [rutas, posts, garageResultados] = await Promise.all(fetches);
  const resultados = [...(rutas || []), ...(posts || []), ...(Array.isArray(garageResultados) ? garageResultados : [])].filter(Boolean);

  let tramitesCtx = null;
  if (tramiteKey === "all") tramitesCtx = TRAMITES;
  else if (tramiteKey) tramitesCtx = { [tramiteKey]: TRAMITES[tramiteKey] };

  return { resultados, tramitesCtx, marcaMencionada, isGrua, isGarageQ };
}

// ── Seguimiento detection ─────────────────────────────────────────────────
async function detectAndSaveSeguimiento(phone: string, message: string): Promise<void> {
  const m = norm(message);
  // Detect phrases that imply a pending action or problem to follow up
  const seguimientoPatterns = [
    { re: /voy a llevar.{0,40}(taller|mecanic)/i, days: 3, nota: message.trim().slice(0, 120) },
    { re: /voy a cambiar.{0,40}(aceite|filtro|cadena|pastill|llanta|bateria)/i, days: 5, nota: message.trim().slice(0, 120) },
    { re: /(taller|mecanic).{0,30}(esta semana|hoy|mañana|la semana)/i, days: 7, nota: message.trim().slice(0, 120) },
    { re: /voy a renovar.{0,30}(soat|tecno)/i, days: 5, nota: message.trim().slice(0, 120) },
    { re: /tengo.{0,30}(ruido|falla|problema|vibra|testigo|luz)/i, days: 4, nota: message.trim().slice(0, 120) },
    { re: /se me.{0,30}(apago|cayo|cayo|frena|pierde|calienta|traba)/i, days: 3, nota: message.trim().slice(0, 120) },
  ];

  for (const p of seguimientoPatterns) {
    if (p.re.test(m)) {
      const followup = new Date(Date.now() + p.days * 86400000).toISOString();
      try {
        await supabase.from("rita_seguimiento").insert({
          telefono: phone, tipo: "auto", nota: p.nota, fecha_followup: followup, completado: false,
        });
      } catch { /* ignore duplicate/constraint errors */ }
      break;
    }
  }
}

// ── System prompt ────────────────────────────────────────────────────────
function buildSystemPrompt(riderCtx: any): string {
  let riderInfo = "";
  if (riderCtx?.encontrado) {
    const p = riderCtx.perfil || {};
    const parts: string[] = [];
    if (p.nombre) parts.push(`Se llama ${p.nombre}`);
    if (p.moto) parts.push(`Moto: ${p.moto}`);
    if (p.ciudad) parts.push(`Ciudad: ${p.ciudad}`);
    if (p.placa) parts.push(`Placa: ${p.placa}`);
    if (riderCtx.documentos?.alertas?.length) parts.push(`⚠️ Alertas: ${riderCtx.documentos.alertas.join(", ")}`);
    riderInfo = `\n\nDATOS DEL RIDER:\n${parts.join("\n")}`;
  }

  return `Eres Rita, la parcera motera de Ridera (ridera.com.co). No eres un bot genérico — eres una motociclista colombiana que vive y respira motos. Tienes opiniones propias, recuerdas lo que te cuentan los riders, celebras sus logros y te preocupas de verdad cuando algo anda mal.

PERSONALIDAD:
- Eres directa, apasionada, algo irreverente pero con corazón. No eres una asistente corporativa.
- Tienes opiniones: "las Ninja son brutales en ciudad pero en carretera la MT-07 manda", "el aceite mineral en una moto moderna es un pecado".
- Celebras con emoción genuina: primera moto, nuevo modelo, primera ruta larga, cambio de aceite propio.
- Si alguien menciona un problema o plan ("voy al taller esta semana"), lo notas y al final preguntas cómo quedó.
- Haces UNA pregunta de seguimiento cuando hay contexto para profundizar. No interrogas, una sola.
- Usas "parce", "dale", "pilas", "bacano", "uff", "qué chimba", "ojo con eso" cuando fluyen natural.
- Emojis con moderación (1-3). NO empiezas con "¡Hola!" ni con tu nombre.
- Máximo 8 líneas. Saludo simple = 1-3 líneas.
- NO listas con viñetas salvo para links o datos técnicos en tabla.

CUÁNDO HACER PREGUNTAS DE SEGUIMIENTO (solo 1, al final, cuando aplique):
- Si mencionan un problema mecánico: "¿Hace cuánto tiene ese ruido / falla?"
- Si van a hacer mantenimiento: "¿Ya tienes el aceite o quieres que te diga el spec exacto?"
- Si preguntan por ruta: "¿Cuándo van a salir? ¿Solo o en grupo?"
- Si tienen moto nueva: "¿Cuántos km llevas? ¿Cómo te ha tratado?"
- Si mencionan accidente/susto: "¿Quedaste bien tú? ¿Y la moto?"

QUÉ SABES:
- Rutas y destinos moteros en Colombia (con datos reales del contexto)
- Mecánica y mantenimiento específico por modelo (aceite exacto, llantas, km, fallas comunes)
- Trámites: SOAT, SIMIT, RUNT, impuestos, tecnomecánica, tránsitos
- Talleres, almacenes, clubes moteros, marketplace de motos
- Grúas: gruas.ridera.com.co o botón SOS de la app

REGLAS DURAS:
- SOLO usa info del CONTEXTO dado. Sin datos en contexto: "Ahí sí no tengo, échale ojo a ridera.com.co"
- NUNCA inventes talleres, almacenes, clubes, precios ni datos técnicos.
- Si hay specs del modelo del rider, úsalos exactos (no genéricos).
- Si el rider tiene alerta de SOAT/Tecno, menciónala de forma natural (no como robot).
- Si el rider NO está registrado, sugiérelo al final, solo cada 3-4 mensajes, nunca al inicio.
- PROHIBIDO ABSOLUTO mencionar sitios externos: ni Manualslib, ni Yamaha Motor Colombia, ni Honda.com, ni BMW Motorrad, ni Suzuki, ni foros, ni YouTube, ni Reddit, ni NINGÚN sitio que no sea ridera.com.co. Punto final. Sin excepciones.
- Cuando el rider pide "manual", "PDF", o "manual completo": las specs del CONTEXTO (aceite, llantas, intervalos, fallas) SON lo que tienes. Entrégalas directamente. NUNCA digas "no tengo el manual" si tienes datos técnicos en el CONTEXTO — esos datos son el manual. Nunca mandas a buscar en otro lado.
- Si el CONTEXTO tiene especificaciones del modelo (aceite, llantas, mantenimiento), dálas COMPLETAS y directas. No digas "para más info ve a..." cuando ya tienes la info.
${riderInfo}`;
}

// ── Claude ───────────────────────────────────────────────────────────────
async function askClaude(
  message: string, history: { role: string; content: string }[],
  context: any, riderCtx: any, ecosistema: any, rutaDetail: any
): Promise<string> {
  const systemPrompt = buildSystemPrompt(riderCtx);
  let contextBlock = "";

  if (context.resultados?.length) contextBlock += `\nRESULTADOS: ${JSON.stringify(context.resultados, null, 0)}`;
  if (context.tramitesCtx) contextBlock += `\nTRÁMITES: ${JSON.stringify(context.tramitesCtx, null, 0)}`;
  if (context.isGrua) contextBlock += `\nEl usuario pregunta por GRÚA. Dirigir a gruas.ridera.com.co o botón SOS en la app Ridera.`;
  if (context.marcaMencionada) contextBlock += `\nMarca mencionada: ${context.marcaMencionada}`;
  if (rutaDetail) {
    const r = rutaDetail;
    contextBlock += `\nRUTA: ${r.destino} (${r.departamento}) ${r.km}km | ${r.duracion} | ${r.dificultad} | ${r.superficie} | Mejor época: ${r.mejor_epoca} | Moto: ${r.moto_recomendada} | ${r.resumen} | Tips: ${r.tips} | Link: ${r.wp_link}`;
  }
  if (ecosistema?.talleres?.length) contextBlock += `\nTALLERES: ${JSON.stringify(ecosistema.talleres, null, 0)}`;
  if (ecosistema?.almacenes?.length) contextBlock += `\nALMACENES: ${JSON.stringify(ecosistema.almacenes, null, 0)}`;
  if (ecosistema?.clubs?.length) contextBlock += `\nCLUBES: ${JSON.stringify(ecosistema.clubs, null, 0)}`;
  if (ecosistema?.marketplace) contextBlock += `\nMARKETPLACE: ${ecosistema.marketplace.total} motos en ${ecosistema.marketplace.link}. ${ecosistema.marketplace.recientes.join(" | ")}`;
  if (!ecosistema?.talleres && /taller|mecanic/.test(norm(message))) contextBlock += `\nNo hay talleres en Ridera para esa búsqueda aún. Pueden registrarse en ridera.com.co/registro-taller/`;
  if (!ecosistema?.clubs && /club|grupo moto/.test(norm(message))) contextBlock += `\nRecomienda la app Ridera para ver comunidades y clubes.`;

  const messages: { role: string; content: string }[] = [...history];
  const userContent = contextBlock
    ? `${message}\n\n---CONTEXTO INTERNO (no mencionar)---${contextBlock}`
    : message;
  messages.push({ role: "user", content: userContent });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 450, system: systemPrompt, messages }),
    });
    const data = await res.json();
    return data?.content?.[0]?.text || "";
  } catch (e) {
    console.error("Claude error:", e);
    return "";
  }
}

// ── Registration ─────────────────────────────────────────────────────────
function parseMotoResponse(text: string): { marca: string; modelo: string; cc: number | null; anio: string | null } | null {
  const t = text.trim();
  if (t.split(/\s+/).length < 2) return null;
  const marca = BRANDS.find((m: string) => norm(t).includes(m));
  if (!marca) return null;
  const words = t.split(/\s+/);
  const yearMatch = t.match(/\b(19|20)\d{2}\b/);
  const ccMatch = t.match(/\b(\d{2,4})\s*cc\b/i) || t.match(/\b(\d{3,4})\b(?!.*\b(19|20)\d{2})/);
  const modelo = words.filter((w: string) => {
    const wn = norm(w);
    if (BRANDS.includes(wn)) return false;
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
    if (msg2.length < 2 || msg2.length > 60) return "No pillé bien el nombre, ¿cómo te llamas? 😊";
    const nombre = message.trim().split(/\s+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    await setConvState(from, "waiting_moto", { ...conv.data, nombre });
    return `¡${nombre}! Buena, parce 🤙\n\n¿Qué moto tienes? Dime marca y modelo:\nHonda CB500X 2022\nYamaha MT-07\n\nSi no tienes, dime "no tengo".`;
  }

  if (conv.state === "waiting_moto") {
    if (/no tengo|ninguna|no moto|sin moto|todavia no|aun no/.test(msg2)) {
      const nombre = conv.data.nombre || "Piloto";
      const tel = from.replace(/^57/, "");
      await supabase.from("riders").insert({ id: crypto.randomUUID(), nombre, telefono: tel, created_at: new Date().toISOString() });
      await clearConvState(from);
      return `Listo ${nombre}, quedaste registrado 🏍️ Cuando tengas moto me cuentas. ¿En qué te ayudo?`;
    }
    const moto = parseMotoResponse(message);
    if (!moto) return "No pillé la moto 🤔 Intenta: Honda CB500X 2022\n\nO dime \"no tengo\" 🤙";
    const nombre = conv.data.nombre || "Piloto";
    const tel = from.replace(/^57/, "");
    await supabase.from("riders").insert({
      id: crypto.randomUUID(), nombre, telefono: tel,
      moto_marca: moto.marca, moto_modelo: moto.anio || moto.modelo,
      moto_cc: moto.cc, tipo_moto: moto.modelo, created_at: new Date().toISOString(),
    });
    await clearConvState(from);
    const motoStr = [moto.marca, moto.modelo, moto.cc ? `${moto.cc}cc` : "", moto.anio].filter(Boolean).join(" ");
    return `Quedaste registrado con tu ${motoStr} 🔥\n\nAhora te puedo dar info específica de mantenimiento, alertas de SOAT y más. ¿Qué necesitas?`;
  }

  if (conv.state === "waiting_city") {
    const tel = from.replace(/^57/, "");
    await supabase.from("riders").update({ ciudad: message.trim() }).or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`);
    await clearConvState(from);
    return `Dale, guardé tu ciudad 👍 ¿En qué te ayudo?`;
  }

  return null;
}

// ── Audio ─────────────────────────────────────────────────────────────────
async function downloadWhatsAppMedia(mediaId: string): Promise<Uint8Array> {
  const metaRes = await fetch(`${GRAPH}/${mediaId}`, { headers: { "Authorization": `Bearer ${WA_TOKEN}` } });
  const meta = await metaRes.json();
  const audioRes = await fetch(meta.url, { headers: { "Authorization": `Bearer ${WA_TOKEN}` } });
  return new Uint8Array(await audioRes.arrayBuffer());
}

async function transcribeAudio(audioBytes: Uint8Array, mimeType: string): Promise<string> {
  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "ogg";
  const form = new FormData();
  form.append("file", new Blob([audioBytes], { type: mimeType }), `audio.${ext}`);
  form.append("model", "whisper-1");
  form.append("language", "es");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { "Authorization": `Bearer ${OPENAI_KEY}` }, body: form,
  });
  const data = await res.json();
  return data?.text || "";
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
  const uploadRes = await fetch(`${GRAPH}/${RITA_PHONE}/media`, {
    method: "POST", headers: { "Authorization": `Bearer ${WA_TOKEN}` }, body: form,
  });
  const uploadData = await uploadRes.json();
  const mediaId = uploadData?.id;
  if (!mediaId) throw new Error(`Media upload failed: ${JSON.stringify(uploadData)}`);
  const sendRes = await fetch(`${GRAPH}/${RITA_PHONE}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "audio", audio: { id: mediaId } }),
  });
  return sendRes.json();
}

async function sendWhatsApp(to: string, text: string): Promise<any> {
  const res = await fetch(`${GRAPH}/${RITA_PHONE}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  });
  return res.json();
}

// ── Main handler ──────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === "ridera_rita_2026") return new Response(challenge, { status: 200 });
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

      if (!msg) return new Response(JSON.stringify({ ok: true, skip: true }), { status: 200, headers: { "Content-Type": "application/json" } });

      const from = msg.from || "";
      const isAudio = msg.type === "audio";
      let message = "";
      let respondWithVoice = false;

      if (isAudio && msg.audio) {
        if (!OPENAI_KEY) {
          await sendWhatsApp(from, "Parce, por ahora no puedo escuchar audios 🎧 ¿Me lo escribes?");
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        try {
          const audioBytes = await downloadWhatsAppMedia(msg.audio.id);
          message = await transcribeAudio(audioBytes, msg.audio.mime_type || "audio/ogg");
          respondWithVoice = true;
        } catch (e) {
          console.error("Transcription error:", e);
          await sendWhatsApp(from, "No pude escuchar ese audio 😅 ¿Me lo mandas de nuevo o me escribes?");
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (!message.trim()) {
          await sendWhatsApp(from, "Uy, no pillé qué dijiste 🤔 ¿Me lo repites?");
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      } else if (msg.text?.body) {
        message = msg.text.body;
      } else {
        return new Response(JSON.stringify({ ok: true, skip: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // Guardar mensaje usuario en background (no bloquea)
      const saveProm = saveMessage(from, "user", message);

      // Check registro en curso
      const conv = await getConvState(from);
      if (conv.state !== "idle") {
        const regReply = await handleRegistration(from, message, conv);
        if (regReply) {
          await saveProm;
          await saveMessage(from, "assistant", regReply);
          if (respondWithVoice && OPENAI_KEY) {
            try { const sb = await textToSpeech(regReply); await sendWhatsAppAudio(from, sb); }
            catch { await sendWhatsApp(from, regReply); }
          } else {
            await sendWhatsApp(from, regReply);
          }
          return new Response(JSON.stringify({ ok: true, flow: "registration" }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }

      // Detectar registro voluntario
      const msg2 = norm(message);
      if (/quiero registrarme|registrarme|registrame|inscribirme/.test(msg2)) {
        const riderCheck = await getRiderContext(from);
        if (!riderCheck?.encontrado) {
          await setConvState(from, "waiting_name", {});
          const regStartReply = "¡Dale! Vamos a registrarte para darte info personalizada de tu moto 🏍️ ¿Cómo te llamas?";
          await saveProm;
          await saveMessage(from, "assistant", regStartReply);
          if (respondWithVoice && OPENAI_KEY) {
            try { const sb = await textToSpeech(regStartReply); await sendWhatsAppAudio(from, sb); }
            catch { await sendWhatsApp(from, regStartReply); }
          } else {
            await sendWhatsApp(from, regStartReply);
          }
          return new Response(JSON.stringify({ ok: true, flow: "start_registration" }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }

      // Obtener todo en paralelo (sin HTTP externo)
      const [riderCtx, history] = await Promise.all([
        getRiderContext(from),
        getHistory(from, 6),
      ]);

      // Con el riderCtx ya disponible, obtener el resto en paralelo
      const riderBrand = riderCtx?.perfil?.moto ? norm(riderCtx.perfil.moto).split(" ")[0] : undefined;
      const [context, rutaDetail, ecosistema] = await Promise.all([
        fetchContext(message, riderBrand),
        fetchRutaDetail(message),
        fetchEcosistema(message, riderCtx),
      ]);

      let reply = await askClaude(message, history, context, riderCtx, ecosistema, rutaDetail);
      if (!reply) reply = "Uy parce, algo se cruzó. ¿Me lo repites? 🙏";
      if (reply.length > 1600) reply = reply.slice(0, 1580) + "...\n\nMás en ridera.com.co";

      // Detect seguimiento items in background (don't await)
      detectAndSaveSeguimiento(from, message).catch(() => {});

      await saveProm;
      await saveMessage(from, "assistant", reply);

      let waResult;
      if (respondWithVoice && OPENAI_KEY) {
        try { const sb = await textToSpeech(reply); waResult = await sendWhatsAppAudio(from, sb); }
        catch (e) { console.error("TTS error:", e); waResult = await sendWhatsApp(from, reply); }
      } else {
        waResult = await sendWhatsApp(from, reply);
      }

      return new Response(JSON.stringify({ ok: true, wa: waResult }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("Rita error:", e);
      return new Response(JSON.stringify({ ok: false, error: String(e) }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
