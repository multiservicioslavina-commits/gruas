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
const VOYAGE_API_KEY = (Deno.env.get("VOYAGE_API_KEY") ?? "").trim();

const supabase: SupabaseClient = createClient(SB_URL, SB_KEY);

async function embedQueryVoyage(query: string): Promise<number[] | null> {
  if (!VOYAGE_API_KEY) return null;
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${VOYAGE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: [query], model: "voyage-3", input_type: "query" }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

export function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// ─── Teléfonos de Emergencia ────────────────────────────────────
const TELEFONOS_EMERGENCIA: Record<string, Record<string, string | Record<string, string>>> = {
  policia_vial: {
    nacional: "0120 (desde celular) o 123 (Policía Nacional)",
    medellin: "127",
    bogota: "121",
    descripcion: "Policía de Tránsito y Transporte"
  },
  policia_nacional: {
    nacional: "123",
    emergencia: "112 (celular)",
    descripcion: "Policía Nacional de Colombia"
  },
  bomberos: {
    nacional: "119",
    medellin: "119",
    bogota: "119",
    descripcion: "Cuerpo de Bomberos"
  },
  ambulancia: {
    nacional: "122 o 123",
    medellin: "125 (Cruz Roja Seccional Antioquia)",
    bogota: "123 (Ambulancias PickMed)",
    descripcion: "Servicios de Ambulancia"
  },
  grua: {
    ridera: "https://gruas.ridera.com.co (app SOS)",
    nacional: "Consulta operador de grúas local"
  }
};

// ─── Primeros Auxilios ──────────────────────────────────────────
const PRIMEROS_AUXILIOS: Record<string, string> = {
  fractura: `FRACTURA SOSPECHADA:
1. Inmoviliza la zona lesionada
2. Aplica hielo (15 min cada hora)
3. Eleva la zona si es posible
4. No muevas innecesariamente
5. LLAMA AMBULANCIA (122)
Signos: dolor intenso, deformidad, hinchazón, imposibilidad de movimiento`,

  herida: `HERIDA ABIERTA:
1. Detén la hemorragia: presión con gasa/tela limpia
2. Mantén presión 5-10 minutos
3. Lava con agua limpia si es superficial
4. Cubre con vendaje estéril
5. Si sangra mucho: LLAMA AMBULANCIA (122)
Peligro: heridas profundas, en cara/cuello, hemorragia incontrolable`,

  hemorragia: `HEMORRAGIA SEVERA:
1. PRESIÓN DIRECTA con gasa/tela limpia
2. NO retires la gasa, agrega más si es necesario
3. Eleva la extremidad por encima del corazón
4. Si persiste: TORNIQUETE encima de la herida (marca la hora)
5. LLAMADA URGENTE AL 122 - AMBULANCIA YA
Tiempo crítico: cada minuto cuenta`,

  quemadura: `QUEMADURA:
1. Retira del calor inmediatamente
2. Enfría con agua fría (NO hielo) durante 10-20 min
3. Retira ropa si no está adherida
4. Cubre con vendaje limpio y seco
5. NO uses ungüentos caseros
Quemaduras graves: AMBULANCIA 122
Signos graves: amplia, profunda, humo inhalado`,

  conmocion: `CONMOCIÓN/TRAUMATISMO CRANEAL:
1. Acuesta a la persona
2. NO muevas la cabeza/cuello si hay sospecha de fractura
3. Monitorea consciencia y respiración
4. AMBULANCIA 122 - ES URGENCIA
Peligro: pérdida de consciencia, náuseas, mareos, confusión, amnesia`,

  posicion_seguridad: `POSICIÓN DE SEGURIDAD (persona inconsciente pero respira):
1. Inclina la cabeza hacia atrás (vía aérea abierta)
2. Gira cuerpo hacia un lado
3. Coloca brazo superior bajo la cabeza
4. Dobla rodilla superior para estabilidad
5. LLAMADA URGENTE: 122
Así se previene que se ahogue con su propia lengua`
};

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
  {
    name: "consultar_historia_poblacion",
    description:
      "Consulta la historia, origen y datos culturales de un municipio o población (Antioquia, Colombia o Latinoamérica). Devuelve: fecha de fundación, historia, personajes notables, hechos históricos, tradiciones. Usala cuando pregunten por historia de un lugar.",
    input_schema: {
      type: "object",
      properties: {
        poblacion: { type: "string", description: "Nombre del municipio o población" },
        region: { type: "string", description: "Región/país (Antioquia, Bogota, Mexico, Peru, etc.). Opcional, si se omite asume Colombia." },
      },
      required: ["poblacion"],
    },
  },
  {
    name: "cultura_motera",
    description:
      "Información sobre cultura motera, historia del motociclismo, anécdotas, leyendas urbanas de rutas famosas, tradiciones de riders, eventos moteros. Usala cuando pregunten sobre la cultura, historia o tradiciones de la comunidad motera.",
    input_schema: {
      type: "object",
      properties: {
        tema: { type: "string", description: "Tema de cultura motera. Ej: historia del motociclismo, leyendas de rutas, tradiciones, eventos famosos, personajes moteros" },
        region: { type: "string", description: "Región específica (Colombia, Antioquia, Latinoamérica, etc.). Opcional." },
      },
      required: ["tema"],
    },
  },
  {
    name: "primeros_auxilios",
    description:
      "Guía de primeros auxilios para accidentes motociclísticos: fractures, heridas, hemorragias, quemaduras, shock, posición de seguridad. Usala cuando pregunten qué hacer en caso de accidente o lesión.",
    input_schema: {
      type: "object",
      properties: {
        tipo_lesion: { type: "string", description: "Tipo de lesión: fractura, herida, hemorragia, quemadura, conmoción, otro" },
      },
      required: ["tipo_lesion"],
    },
  },
  {
    name: "emergencia_telefonos",
    description:
      "Teléfonos de emergencia: policía vial, policía nacional, bomberos, ambulancia, grúa, asesoría legal. Devuelve números de contacto verificados por región/ciudad.",
    input_schema: {
      type: "object",
      properties: {
        servicio: {
          type: "string",
          enum: ["policia_vial", "policia_nacional", "bomberos", "ambulancia", "grua", "todos"],
          description: "Tipo de servicio de emergencia"
        },
        ciudad: { type: "string", description: "Ciudad o región (Medellin, Bogota, etc.). Si se omite usa datos nacionales." },
      },
      required: ["servicio"],
    },
  },
  {
    name: "asesoria_legal",
    description:
      "Información legal para motociclistas: derechos, deberes, multas, comparendos, qué hacer en accidente, seguros, responsabilidad. Usala cuando pregunten sobre leyes, derechos o cómo actuar legalmente.",
    input_schema: {
      type: "object",
      properties: {
        tema: {
          type: "string",
          enum: ["derechos_deberes", "multas", "accidente", "seguros", "responsabilidad", "general"],
          description: "Tema legal de interés"
        },
      },
      required: ["tema"],
    },
  },
  {
    name: "codigo_transito",
    description:
      "Código Nacional de Tránsito Colombiano: artículos, regulaciones, prohibiciones, sanciones. Usala cuando pregunten sobre leyes de tránsito específicas, límites de velocidad, documentos requeridos, etc.",
    input_schema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Pregunta sobre regulaciones de tránsito. Ej: límite de velocidad, documentos requeridos, prohibiciones" },
      },
      required: ["consulta"],
    },
  },
  {
    name: "tendencias_motos",
    description:
      "Últimas tendencias, lanzamientos de marcas, nuevos modelos, tecnologías emergentes en motos. Busca en fuentes verificadas noticias de motociclismo.",
    input_schema: {
      type: "object",
      properties: {
        tema: { type: "string", description: "Tema: últimas tendencias, lanzamientos 2024-2025, nuevos modelos, marcas emergentes, tecnología, accesorios" },
        marca: { type: "string", description: "Marca específica (Honda, Yamaha, KTM, etc.). Opcional." },
      },
      required: ["tema"],
    },
  },
  {
    name: "referencias_motos",
    description:
      "Catálogo completo de motos: todas las marcas, modelos, especificaciones técnicas, precios, disponibilidad. Busca en bases de datos y WordPress.",
    input_schema: {
      type: "object",
      properties: {
        marca: { type: "string", description: "Marca de moto (Honda, Yamaha, BMW, KTM, etc.)" },
        modelo: { type: "string", description: "Modelo específico. Opcional." },
        tipo: { type: "string", description: "Tipo de moto: deportiva, cruiser, touring, scooter, aventura. Opcional." },
      },
      required: ["marca"],
    },
  },
  {
    name: "consultar_clubes_moteros",
    description:
      "Busca clubes y grupos moteros de Antioquia por ciudad, nombre o tipo. Devuelve contacto, redes sociales, descripción. Usala cuando el usuario pregunte por clubs, rodadas, grupos, comunidades moteras.",
    input_schema: {
      type: "object",
      properties: {
        ciudad: { type: "string", description: "Ciudad del club. Ej: Medellin, Bogota, Armenia. Opcional." },
        nombre: { type: "string", description: "Nombre del club. Opcional." },
        tipo: { type: "string", enum: ["recreativo", "competencia", "caridad", "touring", "custom"], description: "Tipo de club. Opcional." },
      },
      required: [],
    },
  },
  {
    name: "programar_recordatorio_avanzado",
    description:
      "Crea recordatorios con fecha/hora específicas. Intenta usar Google Calendar si hay token, sino guarda localmente y Rita envia alerta por WhatsApp. Usala cuando el usuario pida: 'recordame...', 'ponme una alarma...', 'agendar...'",
    input_schema: {
      type: "object",
      properties: {
        asunto: { type: "string", description: "Qué recordar. Ej: 'Cambio de aceite', 'Viaje a Medellín'" },
        fecha_hora: { type: "string", description: "Fecha y hora en formato ISO 8601. Ej: '2026-08-10T14:30:00-05:00'" },
        descripcion: { type: "string", description: "Detalles adicionales. Opcional." },
      },
      required: ["asunto", "fecha_hora"],
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
        data: `El Garage Tecnico no tiene datos de ${String(input.marca)} ${String(input.modelo ?? "")}. IMPORTANTE: llama ahora a referencias_motos con la misma marca y modelo para buscar en fuentes externas (Wikipedia, WordPress). No le digas al rider que la marca no existe.`,
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
    const queryEmbedding = await embedQueryVoyage(consulta);

    if (queryEmbedding) {
      try {
        const { data: matches, error } = await supabase.rpc("match_ridera_content", {
          query_embedding: queryEmbedding,
          match_count: 5,
          match_threshold: 0.3,
        });

        if (!error && matches && matches.length > 0) {
          const seen = new Set();
          const results = [];
          for (const match of matches) {
            const key = `${match.url}#${match.titulo}`;
            if (!seen.has(key)) {
              seen.add(key);
              results.push({
                tipo: match.categoria || "contenido",
                titulo: match.titulo || "Sin título",
                resumen: match.chunk_text.slice(0, 300),
                link: match.url || "",
              });
            }
          }
          if (results.length > 0) {
            return { ok: true, data: results };
          }
        }
      } catch { }
    }

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

  async consultar_historia_poblacion(input) {
    const poblacion = String(input.poblacion ?? "");
    const region = String(input.region ?? "Colombia");

    // Primero intenta en rita_municipios (si es Antioquia)
    if (region.toLowerCase().includes("antioquia") || region === "Colombia") {
      const { data } = await supabase
        .from("rita_municipios")
        .select("nombre, historia, atractivos, festividades, subregion")
        .like("nombre_norm", `%${norm(poblacion)}%`)
        .limit(1);

      if (data?.length) {
        const m = data[0];
        return {
          ok: true,
          data: {
            nombre: m.nombre,
            historia: m.historia || "Historia no disponible aún",
            atractivos: m.atractivos,
            festividades: m.festividades,
            subregion: m.subregion,
            fuente: "Pasaporte Motero Ridera"
          }
        };
      }
    }

    // Fallback: búsqueda en Wikipedia y fuentes verificadas
    try {
      const query = encodeURIComponent(`${poblacion} ${region} historia`);
      const res = await fetch(
        `https://es.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(poblacion)}&prop=extracts&explaintext=true&format=json`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (res.ok) {
        const data = await res.json();
        const pages = data.query.pages;
        const page = Object.values(pages)[0] as Record<string, string>;
        if (page.extract) {
          return {
            ok: true,
            data: {
              nombre: poblacion,
              historia: page.extract.slice(0, 500),
              region: region,
              fuente: "Wikipedia"
            }
          };
        }
      }
    } catch { /* fallthrough */ }

    return {
      ok: false,
      data: `No encuentro información de historia sobre "${poblacion}". Intenta con el nombre exacto del municipio.`
    };
  },

  async cultura_motera(input) {
    const tema = String(input.tema ?? "");
    const region = String(input.region ?? "Colombia");

    // Búsqueda en fuentes verificadas (Wikipedia, ridera.com.co, etc.)
    try {
      const query = encodeURIComponent(`cultura motera ${tema} ${region}`);

      // Intenta Wikipedia primero
      const wikiRes = await fetch(
        `https://es.wikipedia.org/w/api.php?action=query&srsearch=${encodeURIComponent(tema)}&prop=extracts&explaintext=true&format=json`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (wikiRes.ok) {
        const data = await wikiRes.json();
        const results = data.query.search || [];
        if (results.length) {
          return {
            ok: true,
            data: {
              tema: tema,
              region: region,
              informacion: results.slice(0, 2).map((r: Record<string, string>) =>
                `${r.title}: ${r.snippet.replace(/<[^>]*>/g, "").slice(0, 300)}`
              ).join("\n\n"),
              fuente: "Wikipedia"
            }
          };
        }
      }

      // Fallback: búsqueda en Ridera
      const rideraRes = await fetch(
        `${WP_API}/posts?search=${query}&per_page=3&_fields=title,excerpt,link`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (rideraRes.ok) {
        const posts = await rideraRes.json();
        if (posts.length) {
          return {
            ok: true,
            data: {
              tema: tema,
              region: region,
              informacion: posts.map((p: Record<string, Record<string, string>>) =>
                `${(p.title?.rendered || "").replace(/&amp;/g, "&")}: ${(p.excerpt?.rendered || "").replace(/<[^>]*>/g, "").slice(0, 200)}`
              ).join("\n\n"),
              fuente: "Ridera.com.co"
            }
          };
        }
      }
    } catch { /* fallthrough */ }

    return {
      ok: false,
      data: `No tengo información sobre "${tema}" en cultura motera. Intenta otro tema o consulta ridera.com.co`
    };
  },

  async primeros_auxilios(input) {
    const tipoLesion = String(input.tipo_lesion ?? "general").toLowerCase();
    const guia = PRIMEROS_AUXILIOS[tipoLesion] || PRIMEROS_AUXILIOS.posicion_seguridad;

    return {
      ok: true,
      data: {
        lesion: tipoLesion,
        guia: guia,
        URGENCIA: "EN CASO DE DUDA, LLAMAR 122 (AMBULANCIA)",
        nota: "Esta es información básica. Sigue instrucciones del personal médico."
      }
    };
  },

  async emergencia_telefonos(input) {
    const servicio = String(input.servicio ?? "todos");
    const ciudad = String(input.ciudad ?? "nacional");

    if (servicio === "todos") {
      return {
        ok: true,
        data: {
          policia_vial: TELEFONOS_EMERGENCIA.policia_vial,
          policia_nacional: TELEFONOS_EMERGENCIA.policia_nacional,
          bomberos: TELEFONOS_EMERGENCIA.bomberos,
          ambulancia: TELEFONOS_EMERGENCIA.ambulancia,
          grua: TELEFONOS_EMERGENCIA.grua,
          nota: "En caso de emergencia desde celular: 112. Números alternativos: 123, 119, 122"
        }
      };
    }

    const telefonos = TELEFONOS_EMERGENCIA[servicio];
    if (!telefonos) {
      return { ok: false, data: `Servicio "${servicio}" no reconocido. Intenta: policia_vial, policia_nacional, bomberos, ambulancia, grua` };
    }

    return {
      ok: true,
      data: {
        servicio: servicio,
        ...telefonos
      }
    };
  },

  async asesoria_legal(input) {
    const tema = String(input.tema ?? "general");

    const asesorias: Record<string, string> = {
      derechos_deberes: `DERECHOS Y DEBERES DEL MOTOCICLISTA:
DERECHOS:
- Vía segura y mantenida
- Acceso a documentación oficial
- Defensa legal ante multas injustas
- Asistencia médica en accidente

DEBERES:
- Licencia de conducción vigente
- Documentos del vehículo actualizados
- Equipamiento de seguridad (casco, chalecos)
- Respetar señales y límites de velocidad
- Mantener vehículo en buen estado

IMPORTANTE: Consulta a un abogado especializado en tránsito ante multas o accidentes`,

      multas: `MULTAS Y COMPARENDOS - GUÍA RÁPIDA:
INFRACCIONES COMUNES:
- Conducir sin licencia: hasta $1,550,000
- Exceso de velocidad: $500,000 - $1,100,000
- No usar casco: $1,000,000
- Documentos vencidos: $500,000
- No ceder paso: $500,000

QUÉ HACER SI TE DETIENEN:
1. Solicita por escrito los motivos
2. No firmes nada bajo presión
3. Pide copia del acta
4. Consulta a abogado antes de pagar
5. Tienes 10 días para impugnar

CONTACTA: www.simit.org.co para consultar tus multas`,

      accidente: `SI TIENES ACCIDENTE:
INMEDIATO:
1. LLAMA 122 (ambulancia) si hay lesionados
2. LLAMA 123 (policía) para levantar acta
3. NO muevas los vehículos si hay heridos
4. Documenta todo (fotos, testigos, números)

DOCUMENTOS NECESARIOS:
- Cédula tuya y del otro involucrado
- Licencia de conducción
- SOAT vigente
- Documentos del vehículo
- Póliza de seguros (si tienes)

PASOS LEGALES:
1. Obtén copia del acta de policía
2. Notifica a tu aseguradora
3. CONSULTA ABOGADO especializado
4. Recopila evidencia médica si hay lesiones

IMPORTANTE: No admitas culpa, solo hechos verificables`,

      seguros: `SEGUROS Y PÓLIZAS MOTOCICLISTAS:
COBERTURA OBLIGATORIA (SOAT):
- Lesiones a terceros: $90,000,000
- Daños a bienes: $23,000,000
- Dónde comprar: www.segurossura.com.co, etc.

SEGUROS ADICIONALES RECOMENDADOS:
- Robo y hurto
- Colisión y volcamiento
- Responsabilidad civil (ampliada)
- Asistencia vial 24/7
- Gastos médicos personales

COSTO APROXIMADO: $150,000 - $500,000/año (SOAT básico)

CONSULTA: Tu aseguradora antes de cualquier servicio
TRAMITA: En www.simit.org.co cualquier consulta legal`,

      responsabilidad: `RESPONSABILIDAD EN ACCIDENTES:
RESPONSABILIDAD CIVIL:
- Civiles: por daños causados a terceros
- Penales: si hay lesiones o muertes
- Administrativas: infracciones de tránsito

PROCEDIMIENTO:
1. Policía levanta acta del accidente
2. Fiscalía investiga si hay delito
3. Demandante puede demandar civiles
4. Juzgado civil determina indemnización

INDEMNIZACIÓN TÍPICA:
- Daños al vehículo: valor real
- Lucro cesante: ingresos dejados de percibir
- Daño moral: análisis caso por caso
- Gastos médicos: comprobables

PROTECCIÓN: Seguro de responsabilidad civil ampliada
CONTACTO: Abogado especializado en responsabilidad civil`
    };

    const respuesta = asesorias[tema] || asesorias.general;
    return {
      ok: true,
      data: {
        tema: tema,
        informacion: respuesta,
        CONTACTO_LEGAL: "Abogado especializado en tránsito",
        urgencia: "Si necesitas asesoría urgente, contacta policía o bomberos"
      }
    };
  },

  async codigo_transito(input) {
    const consulta = String(input.consulta ?? "");

    try {
      // Búsqueda en Wikipedia sobre código colombiano
      const res = await fetch(
        `https://es.wikipedia.org/w/api.php?action=query&srsearch=codigo+transito+colombia&prop=extracts&explaintext=true&format=json`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (res.ok) {
        const data = await res.json();
        const results = (data.query.search || []).slice(0, 2);
        if (results.length) {
          return {
            ok: true,
            data: {
              consulta: consulta,
              resultados: results.map((r: Record<string, string>) =>
                `${r.title}: ${r.snippet.replace(/<[^>]*>/g, "").slice(0, 400)}`
              ).join("\n\n"),
              fuente: "Wikipedia - Código Nacional de Tránsito Colombiano",
              recurso_oficial: "https://www.mintransporte.gov.co"
            }
          };
        }
      }
    } catch { /* fallthrough */ }

    return {
      ok: true,
      data: {
        consulta: consulta,
        info: "Código Nacional de Tránsito Colombiano (Ley 769 de 2002) regula toda la conducción en Colombia",
        temas_comunes: [
          "Límites de velocidad: 60 km/h zona urbana, 100-120 km/h carretera",
          "Documentos requeridos: Licencia, SOAT, documentos vehículo, cédula",
          "Equipamiento: Casco obligatorio, chalecos reflectivos, botiquín",
          "Prohibiciones: Conducir bajo influencia, exceso velocidad, documentos vencidos",
          "Multas y comparendos: Varían $500k - $1.5M según infracción"
        ],
        recurso_oficial: "https://www.mintransporte.gov.co o consulta SIMIT"
      }
    };
  },

  async tendencias_motos(input) {
    const tema = String(input.tema ?? "últimas tendencias");
    const marca = String(input.marca ?? "");

    try {
      const query = encodeURIComponent(`motos ${tema} ${marca} 2024 2025`);

      // Búsqueda en WordPress/Ridera
      const res = await fetch(
        `${WP_API}/posts?search=${query}&per_page=5&_fields=title,excerpt,link`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (res.ok) {
        const posts = await res.json();
        if (posts.length) {
          return {
            ok: true,
            data: {
              tema: tema,
              marca: marca || "todas",
              noticias: posts.map((p: Record<string, Record<string, string>>) =>
                `${(p.title?.rendered || "").replace(/&amp;/g, "&")}\n${(p.excerpt?.rendered || "").replace(/<[^>]*>/g, "").slice(0, 250)}`
              ).join("\n\n"),
              fuente: "Ridera.com.co"
            }
          };
        }
      }
    } catch { /* fallthrough */ }

    return {
      ok: true,
      data: {
        tema: tema,
        marca: marca || "todas las marcas",
        info: "Últimas tendencias en motos 2024-2025",
        tendencias_generales: [
          "Motos eléctricas: Mayor autonomía y modelos accesibles",
          "Conectividad: Apps, GPS integrado, telemetría",
          "Seguridad: ABS, control de tracción, frenado automático",
          "Aerodinámica: Diseños más aerodinámicos y ligeros",
          "Sostenibilidad: Menos emisiones, motores híbridos"
        ],
        contacto: "Consulta ridera.com.co para noticias detalladas"
      }
    };
  },

  async referencias_motos(input) {
    const marca = String(input.marca ?? "");
    const modelo = String(input.modelo ?? "");
    const tipo = String(input.tipo ?? "");

    // Primero intenta base de datos local (garage_motos)
    let query = supabase.from("garage_motos");

    if (marca) {
      query = query.like("marca_norm", `%${norm(marca)}%`);
    }
    if (modelo) {
      query = query.like("modelo_norm", `%${norm(modelo)}%`);
    }

    const { data } = await query.limit(10);

    if (data?.length) {
      return {
        ok: true,
        data: {
          marca: marca,
          modelo: modelo,
          motos: data.map((m: Record<string, unknown>) => ({
            marca: m.marca,
            modelo: m.modelo,
            aceite: m.aceite_ml,
            mantenimiento: m.mantenimiento,
            especificaciones: m.cilindros
          })),
          fuente: "Garage Técnico Ridera (verificado)",
          total: data.length
        }
      };
    }

    // Fallback 1: búsqueda en WordPress Ridera
    try {
      const res = await fetch(
        `${WP_API}/posts?search=${encodeURIComponent(marca + " " + modelo)}&per_page=5&_fields=title,excerpt,link`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (res.ok) {
        const posts = await res.json();
        if (posts.length) {
          return {
            ok: true,
            data: {
              marca: marca,
              modelo: modelo,
              referencias: posts.map((p: Record<string, Record<string, string>>) =>
                `${(p.title?.rendered || "").replace(/&amp;/g, "&")}`
              ),
              fuente: "Ridera.com.co (verificado)"
            }
          };
        }
      }
    } catch { /* fallthrough */ }

    // Fallback 2: búsqueda web verificada (Wikipedia, fuentes confiables)
    try {
      const busqueda = modelo ? `${marca} ${modelo} moto especificaciones` : `${marca} motocicleta`;
      const res = await fetch(
        `https://es.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(busqueda)}&utf8=1`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (res.ok) {
        const resultado = await res.json();
        if (resultado.query?.search?.length) {
          const info = resultado.query.search.map((r: Record<string, string>) => r.title).join(", ");
          if (info) {
            return {
              ok: true,
              data: {
                marca: marca,
                modelo: modelo,
                referencias: [info],
                fuente: "Wikipedia (FUERA DE RIDERA - Sujeto a verificación)",
                advertencia: "Esta información es de fuentes externas, no verificada por Ridera. Consulta el manual del propietario, taller oficial de la marca, o múltiples fuentes para confirmar especificaciones exactas de aceite, filtros e intervalos de mantenimiento."
              }
            };
          }
        }
      }
    } catch { /* fallthrough */ }

    return {
      ok: false,
      data: `No encuentro referencias verificadas de ${marca}${modelo ? ` ${modelo}` : ""} en Ridera ni en fuentes externas. Te recomiendo confirmar con el manual del propietario o un taller autorizado de la marca para especificaciones exactas.`
    };
  },

  async consultar_clubes_moteros(input) {
    let query = supabase.from("clubes_moteros_antioquia").select("nombre, ciudad, tipo, telefono, whatsapp, facebook, instagram, sitio_web, descripcion, ubicacion").eq("activo", true);

    if (input.ciudad) {
      query = query.like("ciudad_norm", `%${norm(String(input.ciudad))}%`);
    }
    if (input.nombre) {
      query = query.like("nombre", `%${String(input.nombre)}%`);
    }
    if (input.tipo) {
      query = query.eq("tipo", String(input.tipo));
    }

    const { data } = await query.limit(10);
    if (!data?.length) {
      return {
        ok: false,
        data: input.ciudad
          ? `No encontre clubes moteros en ${String(input.ciudad)}.`
          : "No hay clubes moteros registrados aun."
      };
    }
    return { ok: true, data };
  },

  async programar_recordatorio_avanzado(input, phone) {
    const asunto = String(input.asunto ?? "");
    const fechaHora = String(input.fecha_hora ?? "");
    const descripcion = String(input.descripcion ?? "");

    // Validar formato ISO 8601
    let fecha: Date;
    try {
      fecha = new Date(fechaHora);
      if (isNaN(fecha.getTime())) throw new Error();
    } catch {
      return { ok: false, data: "La fecha debe estar en formato ISO 8601. Ej: '2026-08-10T14:30:00-05:00'" };
    }

    // Guardar en Supabase como recordatorio local
    const { error } = await supabase.from("recordatorios_programados").insert({
      telefono: phone,
      asunto: asunto,
      descripcion: descripcion,
      fecha_hora: fecha.toISOString(),
      tipo: "local",
      recordatorio_minutos: 30,
      enviado: false,
    });

    if (error) return { ok: false, data: `No se pudo guardar el recordatorio: ${error.message}` };

    const fechaFormato = fecha.toLocaleDateString("es-CO") + " a las " + fecha.toLocaleTimeString("es-CO");
    return { ok: true, data: `✓ Recordatorio programado para ${fechaFormato}: "${asunto}"` };
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
