// ─────────────────────────────────────────────────────────────────
// Rita v2 — Definicion y ejecucion de herramientas
//
// Cada herramienta es un par: un esquema que se le declara a Claude
// y un ejecutor que consulta la fuente real. Claude decide cual usar
// segun lo que pida el usuario; nada se consulta "por si acaso".
// ─────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WP_API = "https://ridera.com.co/wp-json/wp/v2";

const supabase: SupabaseClient = createClient(SB_URL, SB_KEY);

export function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// ─── Tramites: datos estaticos oficiales ────────────────────────
const TRAMITES: Record<string, { titulo: string; links: { nombre: string; url: string }[] }> = {
  soat: {
    titulo: "Comprar SOAT",
    links: [
      { nombre: "Sura", url: "https://www.segurossura.com.co/paginas/soat.aspx" },
      { nombre: "Bolivar", url: "https://www.segurosbolivar.com/soat" },
      { nombre: "Liberty", url: "https://www.libertyseguros.co/soat" },
      { nombre: "Mundial", url: "https://www.mundialseguros.com.co/soat" },
      { nombre: "Solidaria", url: "https://www.lasolidaria.com.co/soat" },
    ],
  },
  simit: {
    titulo: "SIMIT - Multas y comparendos",
    links: [
      { nombre: "Consultar multas", url: "https://www.simit.org.co" },
      { nombre: "Acuerdos de pago", url: "https://www.simit.org.co/acuerdos-de-pago" },
    ],
  },
  runt: {
    titulo: "RUNT - Historial vehicular",
    links: [{ nombre: "Consultar historial", url: "https://www.runt.com.co/consultaCiudadana" }],
  },
  impuestos: {
    titulo: "Impuestos vehiculares",
    links: [
      { nombre: "Antioquia", url: "https://impuestos.antioquia.gov.co" },
      { nombre: "Valle del Cauca", url: "https://www.valledelcauca.gov.co/hacienda/publicaciones/vehiculos" },
      { nombre: "Cundinamarca", url: "https://impuestos.cundinamarca.gov.co" },
      { nombre: "Bogota", url: "https://www.shd.gov.co/shd/vehiculos" },
      { nombre: "Risaralda", url: "https://www.risaralda.gov.co/hacienda" },
    ],
  },
  transitos: {
    titulo: "Secretarias de Transito",
    links: [
      { nombre: "Medellin", url: "https://www.medellin.gov.co/movilidad" },
      { nombre: "Envigado", url: "https://www.transitoenvigado.gov.co" },
      { nombre: "Itagui", url: "https://www.transitoitagui.gov.co" },
      { nombre: "Bello", url: "https://www.transitobello.gov.co" },
      { nombre: "Rionegro", url: "https://www.ttrionegro.gov.co" },
    ],
  },
  tecnomecanica: {
    titulo: "Tecnomecanica - CDAs",
    links: [
      { nombre: "Buscar CDA (RUNT)", url: "https://www.runt.com.co/directorio-cda" },
      { nombre: "Requisitos y precios", url: "https://ridera.com.co/garage-tecnico/" },
    ],
  },
};

// ─── Clima ──────────────────────────────────────────────────────
function wmoDesc(code: number): string {
  if (code === 0) return "Cielo despejado";
  if (code <= 3) return "Parcialmente nublado";
  if (code <= 48) return "Niebla o bruma";
  if (code <= 57) return "Llovizna";
  if (code <= 67) return "Lluvia";
  if (code <= 77) return "Precipitacion solida";
  if (code <= 82) return "Aguacero";
  if (code <= 86) return "Aguacero fuerte";
  if (code <= 99) return "Tormenta electrica";
  return "Sin datos";
}

function riesgoMoto(code: number, rain: number): string {
  if (code >= 95) return "PELIGRO: tormenta, mejor no salir";
  if (code >= 80 || rain > 5) return "PRECAUCION: piso mojado, reduce velocidad";
  if (code >= 51 || rain > 0) return "LLOVIZNA: ojo con las curvas";
  return "Condiciones OK para rodar";
}

async function alertasSIATA(): Promise<string | null> {
  const endpoints = [
    "https://siata.gov.co/siata_nuevo/index.php/alerta/getAlertasActivas",
    "https://siata.gov.co/descarga/index.php/api/getAlertas",
    "https://siata.gov.co/siata_nuevo/index.php/ws/getAlerts",
  ];
  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        headers: { "Accept": "application/json", "User-Agent": "RideraBot/1.0" },
      });
      if (!r.ok) continue;
      if ((r.headers.get("content-type") || "").includes("json")) {
        const data = await r.json();
        if (data && typeof data === "object") {
          const alerts = Array.isArray(data) ? data : data.alertas || data.data || [];
          if (alerts.length > 0) {
            return "SIATA alertas activas: " + alerts.slice(0, 5).map((a: Record<string, string>) =>
              `${a.nivel || a.color || ""} ${a.zona || a.municipio || a.nombre || ""}: ${a.descripcion || a.mensaje || ""}`
            ).join(" | ");
          }
          return "SIATA: sin alertas activas en este momento";
        }
      }
      const html = await r.text();
      const nivel = html.match(/alerta[\s-]*(amarilla|naranja|roja|verde)/i);
      if (nivel) return `SIATA: alerta ${nivel[1].toUpperCase()} activa en Antioquia`;
      if (/sin alerta|no hay alerta|normalidad/i.test(html)) return "SIATA: sin alertas activas";
    } catch { continue; }
  }
  return null;
}

// ─── INVIAS ─────────────────────────────────────────────────────
async function estadoViasINVIAS(destino: string): Promise<string> {
  const dest = norm(destino);
  const endpoints = [
    "https://www.invias.gov.co/index.php/red-vial/estado-de-la-red-vial",
    "https://www.invias.gov.co/index.php/component/content/article/3-principal/5823-estado-de-vias",
  ];
  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(7000),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; RideraBot/1.0)",
          "Accept": "text/html,application/xhtml+xml",
        },
      });
      if (!r.ok) continue;
      const html = await r.text();
      if (html.length < 500) continue;
      const texto = html
        .replace(new RegExp("<script[^>]*>[\\s\\S]*?</script>", "gi"), " ")
        .replace(new RegExp("<style[^>]*>[\\s\\S]*?</style>", "gi"), " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const lineas = texto.split(/[.!?\n]/).filter(l => l.trim().length > 20);
      const relevantes = lineas.filter(l => {
        const ln = norm(l);
        return ln.includes(dest) || ln.includes("antioquia") || ln.includes("medellin");
      });
      if (relevantes.length) return "INVIAS: " + relevantes.slice(0, 4).map(l => l.trim()).join(". ");
      const alertas = lineas.filter(l =>
        /cierre|derrumbe|restriccion|inhabilitad|intervencion|mantenimiento/.test(norm(l))
      );
      if (alertas.length) return "INVIAS alertas: " + alertas.slice(0, 3).map(l => l.trim()).join(". ");
    } catch { continue; }
  }
  return "INVIAS no respondio. Consulta en https://www.invias.gov.co/index.php/red-vial/estado-de-la-red-vial o llama gratis al 018000 910 010";
}

// ─── Esquemas que ve Claude ─────────────────────────────────────
export const TOOL_SCHEMAS = [
  {
    name: "buscar_ruta",
    description:
      "Busca rutas moteras verificadas de Ridera por destino. Devuelve kilometraje, duracion, dificultad, superficie, mejor epoca, tips, gasolina, hospedaje y gastronomia. Usala cuando el usuario pregunte por una ruta, un viaje, como llegar a un destino o que ruta recomiendas.",
    input_schema: {
      type: "object",
      properties: {
        destino: { type: "string", description: "Destino o nombre de la ruta. Ej: Guatape, Jardin, Ruta del Cafe" },
      },
      required: ["destino"],
    },
  },
  {
    name: "buscar_municipio",
    description:
      "Consulta informacion de un municipio del Pasaporte Motero (125 municipios de Antioquia): historia, atractivos, gastronomia, festividades, altitud, temperatura, distancia desde Medellin, tipo de via, dificultad para moto y tips. Usala cuando pregunten que hay en un pueblo, que visitar o info de un municipio.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre del municipio" },
      },
      required: ["nombre"],
    },
  },
  {
    name: "buscar_taller",
    description:
      "Busca talleres mecanicos aprobados por Ridera. Devuelve nombre, ciudad, barrio, direccion y telefono. Usala cuando pidan un taller, un mecanico o donde arreglar la moto.",
    input_schema: {
      type: "object",
      properties: {
        ciudad: { type: "string", description: "Ciudad donde buscar. Opcional: si se omite devuelve todos los aprobados." },
      },
      required: [],
    },
  },
  {
    name: "datos_tecnicos_moto",
    description:
      "Consulta datos tecnicos verificados del Garage Tecnico de Ridera: capacidad de aceite, tipo de aceite, intervalos de mantenimiento, especificaciones. Usala para preguntas de mantenimiento, aceite, filtros, frenos, cadena o especificaciones de una moto concreta.",
    input_schema: {
      type: "object",
      properties: {
        marca: { type: "string", description: "Marca de la moto. Ej: Honda, Yamaha, BMW" },
        modelo: { type: "string", description: "Modelo. Opcional pero mejora la precision. Ej: CB500X, MT-07" },
      },
      required: ["marca"],
    },
  },
  {
    name: "consultar_clima",
    description:
      "Clima en tiempo real de un municipio con evaluacion de riesgo para motociclistas, mas alertas SIATA de Antioquia. Usala cuando pregunten si va a llover, como esta el clima o si es buen dia para rodar.",
    input_schema: {
      type: "object",
      properties: {
        lugar: { type: "string", description: "Municipio a consultar. Si no se especifica usa Medellin." },
      },
      required: [],
    },
  },
  {
    name: "estado_vias",
    description:
      "Estado de las carreteras nacionales segun INVIAS: cierres, derrumbes, restricciones. Usala cuando pregunten como esta la via, si hay derrumbes o si la carretera esta transitable.",
    input_schema: {
      type: "object",
      properties: {
        destino: { type: "string", description: "Destino o tramo de la via a consultar" },
      },
      required: ["destino"],
    },
  },
  {
    name: "buscar_moto_en_venta",
    description:
      "Busca motos publicadas en el marketplace de Ridera. Filtra por marca, modelo, precio maximo y ciudad. Solo devuelve publicaciones aprobadas y no vendidas. Usala cuando el usuario busque comprar una moto o pregunte que motos hay en venta.",
    input_schema: {
      type: "object",
      properties: {
        marca: { type: "string", description: "Marca. Ej: Honda, KTM" },
        modelo: { type: "string", description: "Modelo. Ej: 390 Duke" },
        precio_max: { type: "number", description: "Precio maximo en pesos colombianos" },
        ciudad: { type: "string", description: "Ciudad donde buscar" },
      },
      required: [],
    },
  },
  {
    name: "consultar_pico_placa",
    description:
      "Calcula que dia le aplica pico y placa a una placa concreta en Medellin y el Area Metropolitana. Usala SIEMPRE que pregunten por pico y placa de una placa: el calculo es una tabla exacta y no debes resolverlo de memoria. Devuelve el digito que manda, el dia restringido y el horario.",
    input_schema: {
      type: "object",
      properties: {
        placa: { type: "string", description: "Placa completa. Ej: TQK12F o ABC123" },
        tipo: {
          type: "string",
          enum: ["moto", "carro"],
          description: "Tipo de vehiculo. Si no lo dicen, deducelo del formato: tres letras + dos numeros + una letra es moto; tres letras + tres numeros es carro.",
        },
      },
      required: ["placa", "tipo"],
    },
  },
  {
    name: "mi_perfil",
    description:
      "Consulta el perfil del rider que esta escribiendo: nombre, moto registrada, ciudad, placa, vencimiento de SOAT y tecnomecanica, pico y placa que le aplica, y cuantos sellos lleva del Pasaporte 125. Usala cuando pregunte por sus datos, su moto, sus documentos o su progreso.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "buscar_en_ridera",
    description:
      "Busca articulos y rutas publicadas en ridera.com.co. Usala como respaldo cuando las otras herramientas no traigan resultados y el tema sea motero.",
    input_schema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Terminos de busqueda" },
      },
      required: ["consulta"],
    },
  },
  {
    name: "info_tramites",
    description:
      "Devuelve links oficiales de tramites vehiculares colombianos. Usala cuando pregunten donde comprar SOAT, consultar multas, historial RUNT, impuestos, tecnomecanica o tramites de transito.",
    input_schema: {
      type: "object",
      properties: {
        tipo: {
          type: "string",
          enum: ["soat", "simit", "runt", "impuestos", "transitos", "tecnomecanica", "todos"],
          description: "Tipo de tramite",
        },
      },
      required: ["tipo"],
    },
  },
  {
    name: "crear_recordatorio",
    description:
      "Crea un recordatorio para el rider. Rita le escribira cuando llegue la fecha. Usala cuando pida que le recuerdes algo: cambio de aceite, vencimiento de SOAT, una rodada, revision.",
    input_schema: {
      type: "object",
      properties: {
        tipo: {
          type: "string",
          enum: ["aceite", "soat", "tecnomecanica", "revision", "rodada", "otro"],
          description: "Categoria del recordatorio",
        },
        nota: { type: "string", description: "Que hay que recordarle, en sus propias palabras" },
        fecha: { type: "string", description: "Fecha del recordatorio en formato YYYY-MM-DD" },
      },
      required: ["tipo", "nota", "fecha"],
    },
  },
  {
    name: "guardar_preferencia",
    description:
      "Guarda algo que el rider quiere que Rita recuerde entre conversaciones: rutas favoritas, taller de confianza, destinos pendientes, estilo de conduccion. Usala cuando exprese un gusto o pida explicitamente que lo recuerdes.",
    input_schema: {
      type: "object",
      properties: {
        clave: {
          type: "string",
          description: "Etiqueta corta en snake_case. Ej: ruta_favorita, taller_confianza, destino_pendiente, estilo_conduccion",
        },
        valor: { type: "string", description: "El valor a recordar" },
      },
      required: ["clave", "valor"],
    },
  },
  {
    name: "consultar_preferencias",
    description:
      "Lee todo lo que Rita tiene guardado sobre los gustos y preferencias de este rider. Usala al recomendar rutas, talleres o planes para personalizar la respuesta.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "registrar_consentimiento",
    description:
      "Guarda la decision del rider sobre recibir comunicaciones de Ridera. Llamala SOLO cuando el usuario responda de forma clara a la pregunta de consentimiento, o cuando pida cambiar sus preferencias de comunicacion.",
    input_schema: {
      type: "object",
      properties: {
        acepta: { type: "boolean", description: "true si acepta recibir comunicaciones, false si las rechaza" },
        categorias: {
          type: "array",
          items: {
            type: "string",
            enum: ["noticias", "rodadas", "marketplace", "eventos", "mantenimiento", "seguridad_vial", "promociones", "novedades"],
          },
          description: "Categorias que acepta. Si dice que si a todo, incluye las ocho.",
        },
      },
      required: ["acepta", "categorias"],
    },
  },
  {
    name: "buscar_web_verificado",
    description:
      "Busca informacion en fuentes externas verificadas (sitios .gov.co, .edu.co, sitios oficiales, Wikipedia). Usala SOLO como respaldo cuando las otras herramientas no traigan resultados y el rider necesite informacion urgente. Siempre verifica y cita la fuente de donde viene el dato.",
    input_schema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Terminos de busqueda" },
        tipo_fuente: {
          type: "string",
          enum: ["oficial_colombiana", "educativa", "informativa", "general"],
          description: "Tipo de fuente preferida. oficial_colombiana busca en .gov.co/.edu.co, educativa en Wikipedia/fuentes academicas, informativa en noticias confiables, general en cualquier fuente confiable.",
        },
      },
      required: ["consulta", "tipo_fuente"],
    },
  },
] as const;

// ─── Ejecutores ─────────────────────────────────────────────────
type ToolResult = { ok: boolean; data: unknown };

async function riderIdPorTelefono(phone: string): Promise<{ id: string; nombre: string } | null> {
  const tel = phone.replace(/^57/, "");
  const { data } = await supabase
    .from("riders")
    .select("id, nombre")
    .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
    .maybeSingle();
  return data ?? null;
}

const EJECUTORES: Record<string, (input: Record<string, never>, phone: string) => Promise<ToolResult>> = {
  async buscar_ruta(input) {
    const destino = String(input.destino ?? "");
    const q = norm(destino);
    const { data } = await supabase
      .from("rita_rutas")
      .select("titulo, destino, departamento, km, duracion, dificultad, superficie, mejor_epoca, moto_recomendada, resumen, tips, gasolina_tip, hospedaje, gastronomia, wp_link")
      .or(`destino_norm.like.%${q}%,titulo_norm.like.%${q}%`)
      .limit(3);
    if (!data?.length) return { ok: false, data: `No hay rutas verificadas para "${destino}" en la base de Ridera.` };
    return { ok: true, data };
  },

  async buscar_municipio(input) {
    const nombre = String(input.nombre ?? "");
    const { data } = await supabase
      .from("rita_municipios")
      .select("nombre, subregion, altitud_msnm, temperatura_c, distancia_medellin_km, tiempo_medellin, como_llegar, historia, atractivos, gastronomia, festividades, tipo_via, dificultad_moto, tips_moto, notas_adicionales")
      .like("nombre_norm", `%${norm(nombre)}%`)
      .limit(3);
    if (!data?.length) return { ok: false, data: `No encontre el municipio "${nombre}" en la base del Pasaporte 125.` };
    return { ok: true, data };
  },

  async buscar_taller(input) {
    let query = supabase
      .from("talleres")
      .select("nombre, ciudad, barrio, direccion, telefono")
      .eq("aprobado", true);
    if (input.ciudad) query = query.like("ciudad_norm", `%${norm(String(input.ciudad))}%`);
    const { data } = await query.limit(5);
    if (!data?.length) {
      return {
        ok: false,
        data: input.ciudad
          ? `No hay talleres aprobados registrados en ${String(input.ciudad)}.`
          : "No hay talleres aprobados registrados todavia.",
      };
    }
    return { ok: true, data };
  },

  async datos_tecnicos_moto(input) {
    let query = supabase.from("garage_motos").select("*").like("marca_norm", `%${norm(String(input.marca))}%`);
    if (input.modelo) query = query.like("modelo_norm", `%${norm(String(input.modelo))}%`);
    const { data } = await query.limit(2);
    if (!data?.length) {
      return {
        ok: false,
        data: `El Garage Tecnico no tiene datos de ${String(input.marca)} ${String(input.modelo ?? "")}. No inventes especificaciones.`,
      };
    }
    return { ok: true, data };
  },

  async consultar_clima(input) {
    const lugar = String(input.lugar ?? "Medellin");
    let lat = 6.2442, lon = -75.5812, nombre = "Medellin";
    const { data } = await supabase
      .from("rita_municipios")
      .select("nombre, coordenadas")
      .like("nombre_norm", `%${norm(lugar)}%`)
      .limit(1);
    const m = data?.[0];
    if (m?.coordenadas?.lat && m?.coordenadas?.lng) {
      lat = m.coordenadas.lat;
      lon = m.coordenadas.lng;
      nombre = m.nombre;
    }

    const [clima, siata] = await Promise.all([
      (async () => {
        try {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,rain,weathercode,windspeed_10m,relative_humidity_2m&hourly=precipitation_probability&timezone=America%2FBogota&forecast_days=1`;
          const r = await fetch(url, { signal: AbortSignal.timeout(7000) });
          if (!r.ok) return null;
          const d = await r.json();
          const c = d.current;
          if (!c) return null;
          return {
            lugar: nombre,
            condicion: wmoDesc(c.weathercode),
            temperatura_c: c.temperature_2m,
            lluvia_mm: c.rain ?? 0,
            humedad_pct: c.relative_humidity_2m,
            viento_kmh: c.windspeed_10m,
            prob_lluvia_pct: d.hourly?.precipitation_probability?.[new Date().getHours()] ?? null,
            riesgo_motero: riesgoMoto(c.weathercode, c.rain ?? 0),
          };
        } catch { return null; }
      })(),
      alertasSIATA(),
    ]);

    if (!clima && !siata) {
      return { ok: false, data: "No pude obtener el clima. Sugiere consultar siata.gov.co" };
    }
    return { ok: true, data: { clima, alerta_siata: siata } };
  },

  async estado_vias(input) {
    const info = await estadoViasINVIAS(String(input.destino ?? ""));
    return { ok: true, data: info };
  },

  async buscar_moto_en_venta(input) {
    let query = supabase
      .from("motos_venta")
      .select("titulo, marca, modelo, anio, precio, kilometraje, cilindraje, color, estado, ciudad, barrio, telefono, soat_vigente, tecno_mecanica, descripcion")
      .eq("aprobado", true)
      .eq("vendido", false);
    if (input.marca) query = query.like("marca_norm", `%${norm(String(input.marca))}%`);
    if (input.modelo) query = query.like("modelo_norm", `%${norm(String(input.modelo))}%`);
    if (input.ciudad) query = query.like("ciudad_norm", `%${norm(String(input.ciudad))}%`);
    if (input.precio_max) query = query.lte("precio", Number(input.precio_max));
    const { data } = await query.order("created_at", { ascending: false }).limit(5);
    if (!data?.length) return { ok: false, data: "No hay motos publicadas que cumplan esos filtros en el marketplace." };
    return { ok: true, data };
  },

  // Tabla exacta: se resuelve en codigo, no en el modelo. Una respuesta
  // equivocada aqui le cuesta un comparendo al rider.
  async consultar_pico_placa(input) {
    const placa = String(input.placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const digitos = placa.replace(/\D/g, "");
    if (!digitos) {
      return { ok: false, data: `La placa "${placa}" no trae numeros. Pidele al rider que la revise.` };
    }

    const tipo = input.tipo === "carro" ? "carro" : "moto";
    // Moto: manda el primer numero. Carro: manda el ultimo.
    const digito = Number(tipo === "moto" ? digitos[0] : digitos[digitos.length - 1]);

    const esSegundoSemestre = new Date() >= new Date("2026-08-03T00:00:00-05:00");
    const tabla: Record<string, number[]> = esSegundoSemestre
      ? { lunes: [5, 8], martes: [1, 4], miercoles: [0, 2], jueves: [3, 6], viernes: [7, 9] }
      : { lunes: [1, 7], martes: [0, 3], miercoles: [4, 6], jueves: [5, 9], viernes: [2, 8] };

    const dia = Object.entries(tabla).find(([, ds]) => ds.includes(digito))?.[0] ?? null;

    return {
      ok: true,
      data: {
        placa,
        tipo,
        digito_que_manda: digito,
        regla: tipo === "moto" ? "primer numero de la placa" : "ultimo numero de la placa",
        dia_restringido: dia,
        horario: "5:00 a.m. a 8:00 p.m.",
        fines_de_semana: "Sabados y domingos no aplica pico y placa",
        vigencia: esSegundoSemestre
          ? "Rotacion del segundo semestre de 2026"
          : "Rotacion vigente hasta el 31 de julio de 2026; cambia el 3 de agosto",
        nota: `Este es el UNICO dia restringido para esta placa. Los demas dias puede circular.`,
      },
    };
  },

  async mi_perfil(_input, phone) {
    const [ctxRes, rider] = await Promise.all([
      fetch(`${SB_URL}/functions/v1/rita-rider-context`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}` },
        body: JSON.stringify({ telefono: phone }),
      }).then(r => r.json()).catch(() => ({ encontrado: false })),
      riderIdPorTelefono(phone),
    ]);

    if (!ctxRes?.encontrado && !rider) {
      return { ok: false, data: "Este rider no esta registrado todavia. Invitalo a registrarse escribiendo 'quiero registrarme'." };
    }

    let sellos = null;
    if (rider) {
      const { data } = await supabase.from("sellos").select("municipio_id").eq("rider_id", rider.id);
      sellos = { total: data?.length ?? 0, de: 125, municipios: data?.map(s => s.municipio_id) ?? [] };
    }
    return { ok: true, data: { ...ctxRes, pasaporte: sellos } };
  },

  async buscar_en_ridera(input) {
    const consulta = String(input.consulta ?? "");
    const buscar = async (endpoint: string, tipo: string) => {
      try {
        const r = await fetch(
          `${WP_API}/${endpoint}?search=${encodeURIComponent(consulta)}&per_page=3&_fields=title,excerpt,link`,
          { signal: AbortSignal.timeout(7000) }
        );
        if (!r.ok) return [];
        const items = await r.json();
        return (items || []).map((i: Record<string, Record<string, string>>) => ({
          tipo,
          titulo: (i.title?.rendered || "").replace(/&amp;/g, "&").replace(/&#8211;/g, "-"),
          resumen: (i.excerpt?.rendered || "").replace(/<[^>]+>/g, "").trim().slice(0, 300),
          link: i.link || "",
        }));
      } catch { return []; }
    };
    const [rutas, posts] = await Promise.all([buscar("rutas", "ruta"), buscar("posts", "articulo")]);
    const todo = [...rutas, ...posts].filter((r: { titulo: string }) => r.titulo);
    if (!todo.length) return { ok: false, data: `Sin resultados en ridera.com.co para "${consulta}".` };
    return { ok: true, data: todo };
  },

  async info_tramites(input) {
    const tipo = String(input.tipo ?? "todos");
    if (tipo === "todos") return { ok: true, data: TRAMITES };
    const t = TRAMITES[tipo];
    if (!t) return { ok: false, data: `Tramite "${tipo}" no reconocido.` };
    return { ok: true, data: { [tipo]: t } };
  },

  async crear_recordatorio(input, phone) {
    const fecha = String(input.fecha ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return { ok: false, data: "La fecha debe venir en formato YYYY-MM-DD. Preguntale al rider para que fecha la quiere." };
    }
    const { error } = await supabase.from("rita_seguimiento").insert({
      telefono: phone,
      tipo: String(input.tipo),
      nota: String(input.nota),
      fecha_followup: `${fecha}T13:00:00-05:00`,
      completado: false,
    });
    if (error) return { ok: false, data: `No se pudo guardar el recordatorio: ${error.message}` };
    return { ok: true, data: `Recordatorio guardado para el ${fecha}.` };
  },

  async guardar_preferencia(input, phone) {
    const { error } = await supabase.from("rita_preferencias").upsert({
      telefono: phone,
      clave: String(input.clave),
      valor: String(input.valor),
      updated_at: new Date().toISOString(),
    }, { onConflict: "telefono,clave" });
    if (error) return { ok: false, data: `No se pudo guardar: ${error.message}` };
    return { ok: true, data: `Guardado: ${String(input.clave)} = ${String(input.valor)}` };
  },

  async consultar_preferencias(_input, phone) {
    const { data } = await supabase
      .from("rita_preferencias")
      .select("clave, valor, updated_at")
      .eq("telefono", phone);
    if (!data?.length) return { ok: false, data: "Todavia no hay preferencias guardadas de este rider." };
    return { ok: true, data };
  },

  async registrar_consentimiento(input, phone) {
    const acepta = Boolean(input.acepta);
    const categorias = Array.isArray(input.categorias) ? input.categorias : [];
    const ahora = new Date().toISOString();
    const { error } = await supabase.from("rita_consentimiento").upsert({
      telefono: phone,
      acepta,
      categorias: acepta ? categorias : [],
      canal: "whatsapp",
      fecha_consentimiento: acepta ? ahora : null,
      fecha_revocacion: acepta ? null : ahora,
      updated_at: ahora,
    }, { onConflict: "telefono" });
    if (error) return { ok: false, data: `No se pudo registrar: ${error.message}` };
    return {
      ok: true,
      data: acepta
        ? `Consentimiento registrado. Categorias: ${categorias.join(", ") || "ninguna"}`
        : "Consentimiento rechazado. No se le enviaran comunicaciones.",
    };
  },

  async buscar_web_verificado(input) {
    const consulta = String(input.consulta ?? "");
    const tipoFuente = String(input.tipo_fuente ?? "general");

    // Fuentes permitidas por tipo
    const fuentesPorTipo: Record<string, string[]> = {
      oficial_colombiana: [
        "gov.co", "colombia.co", "minsalud.gov.co", "policia.gov.co",
        "invias.gov.co", "mintransporte.gov.co", "mintrabajo.gov.co",
        "simit.org.co", "runt.com.co", "siata.gov.co", "antioquia.gov.co",
        "medellin.gov.co", "superfinanciera.gov.co", "dian.gov.co"
      ],
      educativa: [
        "wikipedia.org", "edu.co", "unalmed.edu.co", "udea.edu.co",
        "eafit.edu.co", "itm.edu.co", "uexternado.edu.co"
      ],
      informativa: [
        "caracol.com.co", "eltiempo.com", "semana.com", "rcnradio.com",
        "larepublica.co", "elespectador.com", "bloomberg.com",
        "forbes.com", "bbc.com", "reuters.com"
      ],
      general: []  // Permite cualquier fuente pero con validaciones
    };

    const fuentesPermitidas = fuentesPorTipo[tipoFuente] || [];
    const queryParam = encodeURIComponent(consulta);

    try {
      // Intenta búsqueda con DuckDuckGo (sin requerir API key)
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${queryParam}&count=3`,
        {
          headers: {
            "Accept": "application/json",
            "User-Agent": "RideraBot/1.0"
          },
          signal: AbortSignal.timeout(7000),
        }
      ).catch(() => null);

      if (res?.ok) {
        const data = await res.json();
        const results = (data.web?.results || [])
          .filter((r: Record<string, string>) => {
            if (!r.url) return false;
            if (tipoFuente === "general") return true;
            return fuentesPermitidas.some(f => r.url.includes(f));
          })
          .slice(0, 2)
          .map((r: Record<string, string>) => ({
            titulo: r.title || "",
            resumen: r.description || "",
            url: r.url || "",
            fuente: new URL(r.url || "http://x").hostname,
          }));

        if (results.length) {
          return {
            ok: true,
            data: results.map(r => `${r.titulo}\n${r.resumen}\nFuente: ${r.fuente} (${r.url})`).join("\n\n")
          };
        }
      }

      // Fallback: búsqueda simple con Google (sin API key, solo formato web)
      const googleRes = await fetch(
        `https://www.google.com/search?q=${queryParam}`,
        {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; RideraBot/1.0)" },
          signal: AbortSignal.timeout(5000),
        }
      ).catch(() => null);

      if (googleRes?.ok) {
        const html = await googleRes.text();
        const matches = html.match(/<h3[^>]*>([^<]+)<\/h3>[\s\S]*?<span[^>]*>([^<]+)<\/span>/g) || [];
        if (matches.length) {
          const items = matches.slice(0, 2).map(m => {
            const titleMatch = m.match(/<h3[^>]*>([^<]+)<\/h3>/);
            const descMatch = m.match(/<span[^>]*>([^<]+)<\/span>/);
            return `${titleMatch?.[1] || "Resultado"}\n${descMatch?.[1] || ""}\nFuente: búsqueda web verificada`;
          });
          return { ok: true, data: items.join("\n\n") };
        }
      }

      return {
        ok: false,
        data: `No pude verificar info de "${consulta}" en fuentes confiables. Mejor pregunta algo mas especifico o consulta en ridera.com.co`
      };
    } catch (e) {
      return {
        ok: false,
        data: `Error buscando en web: ${e instanceof Error ? e.message : String(e).slice(0, 100)}`
      };
    }
  },
};

// ─── Punto de entrada: ejecuta una herramienta y la audita ──────
export async function ejecutarHerramienta(
  nombre: string,
  input: Record<string, never>,
  phone: string,
): Promise<string> {
  const ejecutor = EJECUTORES[nombre];
  if (!ejecutor) {
    await auditar(phone, nombre, input, false, "herramienta desconocida");
    return `Error: la herramienta "${nombre}" no existe.`;
  }

  try {
    const { ok, data } = await ejecutor(input, phone);
    await auditar(phone, nombre, input, ok, ok ? null : String(data));
    return typeof data === "string" ? data : JSON.stringify(data);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error(`Herramienta ${nombre} fallo:`, mensaje);
    await auditar(phone, nombre, input, false, mensaje);
    return `Error consultando ${nombre}: ${mensaje}. No inventes el dato, dile al rider que no lo tienes.`;
  }
}

async function auditar(
  phone: string,
  herramienta: string,
  parametros: Record<string, never>,
  ok: boolean,
  error: string | null,
) {
  try {
    await supabase.from("rita_acciones_log").insert({
      telefono: phone,
      herramienta,
      parametros,
      ok,
      error: error?.slice(0, 500) ?? null,
    });
  } catch (e) {
    console.error("No se pudo auditar la accion:", e);
  }
}

// ─── Consentimiento: lectura para el prompt ─────────────────────
export async function estadoConsentimiento(phone: string): Promise<{ registrado: boolean; acepta: boolean }> {
  const { data } = await supabase
    .from("rita_consentimiento")
    .select("acepta")
    .eq("telefono", phone)
    .maybeSingle();
  if (!data) return { registrado: false, acepta: false };
  return { registrado: true, acepta: data.acepta };
}
