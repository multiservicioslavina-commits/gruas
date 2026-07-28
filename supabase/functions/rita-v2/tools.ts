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

// ─── Diagnostico mecanico: base de conocimiento ─────────────────
const DIAGNOSTICO_KB: Array<{
  ids: string[];
  titulo: string;
  causas: string[];
  urgencia: string;
  pasos_inmediatos: string;
}> = [
  {
    ids: ["no arranca", "no prende", "no enciende", "no inicia", "no da arranque", "no parte"],
    titulo: "Moto no arranca",
    causas: [
      "Bateria descargada o sulfatada (causa mas frecuente)",
      "Bujia fouled, sucia o quemada",
      "Filtro de aire muy sucio o tapado",
      "Gasolina agotada o estancada",
      "Relay o relevo de arranque defectuoso",
      "Switch de apoyo o sensor de freno activado",
    ],
    urgencia: "MEDIA",
    pasos_inmediatos: "1. Verifica llavin en ON y switch encendido. 2. Intenta con patada si la tiene. 3. Confirma que haya gasolina. 4. Si suena 'clac-clac', la bateria esta baja.",
  },
  {
    ids: ["humo negro", "humo cafe", "sale humo negro"],
    titulo: "Humo negro por el escape",
    causas: [
      "Mezcla demasiado rica (exceso de gasolina en la combustion)",
      "Filtro de aire muy sucio o tapado",
      "Inyectores sucios o dañados (motos inyectadas)",
      "Carburador mal calibrado (motos carburadas)",
    ],
    urgencia: "MEDIA",
    pasos_inmediatos: "Revisa y cambia el filtro de aire. Lleva al taller para limpiar inyectores o calibrar carburador. No es emergencia inmediata pero hay que revisarla pronto.",
  },
  {
    ids: ["humo blanco", "vapor blanco", "sale vapor"],
    titulo: "Humo blanco por el escape",
    causas: [
      "Condensacion normal al arrancar en frio (desaparece en 2-3 min, no es problema)",
      "Refrigerante entrando al motor por junta de culata dañada",
      "Aceite quemado en combinacion con refrigerante",
    ],
    urgencia: "ALTA si persiste mas de 5 minutos",
    pasos_inmediatos: "Si desaparece al calentar: completamente normal. Si persiste o huele dulce, para el motor ya. Verifica nivel de refrigerante. No rodar hasta revisar.",
  },
  {
    ids: ["humo azul", "humo gris", "consume aceite", "gasta aceite", "pierde aceite", "baja aceite"],
    titulo: "Humo azul o consumo excesivo de aceite",
    causas: [
      "Anillos de piston desgastados (aceite se quema en la camara)",
      "Sellos de valvulas deteriorados",
      "Nivel de aceite excesivamente alto",
    ],
    urgencia: "MEDIA",
    pasos_inmediatos: "Verifica el nivel de aceite. Si baja mas de 200 ml cada 1000 km hay que revisar anillos o sellos en taller. No es emergencia si el nivel esta bien.",
  },
  {
    ids: ["cadena", "ruido cadena", "cadena suelta", "cadena floja", "cadena salta"],
    titulo: "Problema con la cadena",
    causas: [
      "Cadena suelta o estirada (riesgo de salirse)",
      "Falta de lubricacion",
      "Piñon delantero o corona trasera desgastados",
      "Cadena con puntos duros o eslabones secos",
    ],
    urgencia: "ALTA",
    pasos_inmediatos: "Verifica la tension: debe tener ~2 cm de juego vertical en el punto mas flojo. Lubrica. Si esta estirada o tiene puntos duros, cambiar antes de seguir rodando.",
  },
  {
    ids: ["vibra", "vibracion", "temblor", "tiembla", "sacude"],
    titulo: "Vibracion excesiva",
    causas: [
      "Llanta desequilibrada (vibra a velocidades especificas)",
      "Rodamiento de direccion desgastado",
      "Neumatico con deformacion o presion incorrecta",
      "Tornilleria suelta en chasis o motor",
    ],
    urgencia: "MEDIA",
    pasos_inmediatos: "Verifica presion de llantas. Si vibra a una velocidad especifica es probable desequilibrio de llanta. Lleva a un taller para equilibrar o revisar rodamientos.",
  },
  {
    ids: ["freno suave", "freno blando", "frena mal", "pedal al fondo", "no frena", "frenos flojos", "freno no agarra"],
    titulo: "Frenos deficientes",
    causas: [
      "Pastillas de freno desgastadas",
      "Liquido de frenos bajo o contaminado con agua",
      "Aire en el circuito hidraulico",
      "Disco rayado o deformado",
    ],
    urgencia: "ALTA - No rodar",
    pasos_inmediatos: "URGENTE: con frenos malos no debes rodar. Verifica nivel del liquido en el deposito. Si el freno llega al manillar o al piso, solicita grua.",
  },
  {
    ids: ["recalienta", "se calienta", "temperatura alta", "motor caliente", "humo del motor"],
    titulo: "Sobrecalentamiento del motor",
    causas: [
      "Nivel de refrigerante bajo (motor liquido)",
      "Aceite bajo o muy degradado",
      "Tapon del radiador defectuoso",
      "Termostato trabado cerrado",
    ],
    urgencia: "ALTA",
    pasos_inmediatos: "Para el motor inmediatamente. Deja enfriar 30 minutos antes de abrir nada. Verifica niveles de refrigerante y aceite. No reanudes sin identificar la causa.",
  },
  {
    ids: ["ruido motor", "golpeteo", "tiqui tiqui", "taca taca", "cascabeleo", "tableteo", "golpe en el motor"],
    titulo: "Ruido anormal en el motor",
    causas: [
      "Juego de valvulas fuera de especificacion (cascabeleo suave arriba)",
      "Cadena de distribucion con tension incorrecta",
      "Pistones o cilindros desgastados (golpeteo profundo)",
      "Biela o cojinete de cigüeñal en mal estado (golpe grave)",
    ],
    urgencia: "MEDIA-ALTA segun tipo de ruido",
    pasos_inmediatos: "Cascabeleo leve: ajuste de valvulas (mantenimiento programado). Golpe metalico profundo: para el motor y lleva en grua. No rodar con golpe fuerte.",
  },
  {
    ids: ["suspension dura", "suspension blanda", "horquilla", "amortiguador", "rebote excesivo"],
    titulo: "Problemas de suspension",
    causas: [
      "Aceite de horquilla bajo o degradado",
      "Sellos de horquilla desgastados (pierde aceite)",
      "Resortes de amortiguador debiles",
      "Precarga incorrecta para el peso del rider",
    ],
    urgencia: "MEDIA",
    pasos_inmediatos: "Revisa si hay manchas de aceite debajo de las horquillas. Sellos secos es señal de cambio proximo. Lleva a taller para revision de suspension.",
  },
];

function diagnosticar(sintomas: string): typeof DIAGNOSTICO_KB[0] | null {
  const s = norm(sintomas);
  for (const diag of DIAGNOSTICO_KB) {
    if (diag.ids.some(id => s.includes(id))) return diag;
  }
  return null;
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
      "Calcula que dia le aplica pico y placa a una placa concreta. Para Medellin y Area Metropolitana tiene la tabla exacta. Para otras ciudades da la regla general y el link oficial. Usala SIEMPRE que pregunten por pico y placa de una placa especifica.",
    input_schema: {
      type: "object",
      properties: {
        placa: { type: "string", description: "Placa completa. Ej: TQK12F o ABC123" },
        tipo: {
          type: "string",
          enum: ["moto", "carro"],
          description: "Tipo de vehiculo. Si no lo dicen, deducelo del formato: tres letras + dos numeros + una letra es moto; tres letras + tres numeros es carro.",
        },
        ciudad: { type: "string", description: "Ciudad donde opera el vehiculo. Por defecto Medellin. Ej: Bogota, Cali, Barranquilla" },
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
      "Guarda la decision del rider sobre recibir comunicaciones de Ridera. Llamala cuando el usuario responda a la pregunta de consentimiento, o cuando pida cambiar, activar, desactivar o cancelar sus preferencias de comunicacion.",
    input_schema: {
      type: "object",
      properties: {
        acepta: { type: "boolean", description: "true si acepta recibir comunicaciones, false si las rechaza o cancela la suscripcion" },
        categorias: {
          type: "array",
          items: {
            type: "string",
            enum: ["noticias", "rodadas", "marketplace", "eventos", "mantenimiento", "seguridad_vial", "talleres", "consejos_motociclistas", "promociones", "novedades"],
          },
          description: "Categorias que acepta. Si dice que si a todo, incluye las diez. Si cancela, envia array vacio.",
        },
      },
      required: ["acepta", "categorias"],
    },
  },
  {
    name: "consultar_consentimiento",
    description:
      "Lee el estado actual del consentimiento del rider: si acepta comunicaciones y que categorias tiene activas. Usala cuando pregunte que mensajes recibe, como tiene sus preferencias, o quiera revisar su suscripcion antes de cambiarla.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "consultar_gasolina",
    description:
      "Consulta los precios actuales de la gasolina en Colombia segun fuentes oficiales. Devuelve precio por galon de corriente, extra y ACPM. Usala cuando pregunten cuanto cuesta la gasolina, el combustible o quieran saber el precio actual.",
    input_schema: {
      type: "object",
      properties: {
        ciudad: { type: "string", description: "Ciudad o municipio. Opcional; si se omite trae el precio de referencia nacional." },
      },
      required: [],
    },
  },
  {
    name: "solicitar_grua",
    description:
      "Crea una solicitud de grua o asistencia vial para el rider varado o con emergencia mecanica. Usala cuando diga que esta varado, accidentado mecanicamente, que necesita una grua o ayuda en la via. Pide nombre y ubicacion antes de llamarla. Si hay heridos, dile primero que llame al 123.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre completo del rider" },
        ubicacion: { type: "string", description: "Ubicacion exacta: calle, carretera con km, referencia proxima, coordenadas si las tiene" },
        municipio: { type: "string", description: "Municipio donde esta el rider. Ej: Medellin, Envigado, Rionegro" },
        nota: { type: "string", description: "Descripcion del problema: que paso, tipo de averia, estado de la moto" },
      },
      required: ["nombre", "ubicacion"],
    },
  },
  {
    name: "publicar_moto",
    description:
      "Publica una moto en el marketplace de Ridera para que el rider la venda. Recopila primero todos los datos: titulo, marca, modelo, año, precio, kilometraje, cilindraje, color, ciudad y descripcion breve. No la llames sin tener al menos titulo y precio.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Titulo del anuncio. Ej: Honda CB500X 2022 Azul, 10.000 km" },
        marca: { type: "string", description: "Marca de la moto" },
        modelo: { type: "string", description: "Modelo de la moto" },
        anio: { type: "number", description: "Año del vehiculo" },
        precio: { type: "number", description: "Precio en pesos colombianos" },
        kilometraje: { type: "number", description: "Kilometraje en km" },
        cilindraje: { type: "number", description: "Cilindraje en cc" },
        color: { type: "string" },
        ciudad: { type: "string" },
        descripcion: { type: "string", description: "Estado, equipamiento, razon de venta, contacto adicional" },
        soat_vigente: { type: "boolean", description: "Si tiene SOAT vigente" },
        tecno_mecanica: { type: "boolean", description: "Si tiene tecnomecanica vigente" },
      },
      required: ["titulo", "precio"],
    },
  },
  {
    name: "diagnostico_moto",
    description:
      "Diagnostico mecanico basico por sintomas: ruidos, vibraciones, humo, problemas de arranque, frenos o temperatura. Devuelve causas probables, nivel de urgencia y pasos inmediatos. Usala cuando el rider describa cualquier anomalia mecanica de su moto.",
    input_schema: {
      type: "object",
      properties: {
        sintomas: { type: "string", description: "Descripcion de los sintomas: tipo de ruido, cuando ocurre, que parte de la moto, desde cuando" },
        marca: { type: "string", description: "Marca de la moto (opcional, para personalizacion)" },
        modelo: { type: "string", description: "Modelo de la moto (opcional)" },
      },
      required: ["sintomas"],
    },
  },
  {
    name: "confirmar_recordatorio",
    description:
      "Marca el recordatorio mas reciente del rider como confirmado (el rider ya hizo la tarea: cambio el aceite, renovo el SOAT, etc.). Usala cuando el rider responda 'listo', 'ya lo hice', 'listo parce', 'hecho' o similares despues de haber recibido un recordatorio.",
    input_schema: { type: "object", properties: {}, required: [] },
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
    const tipo = input.tipo === "carro" ? "carro" : "moto";
    const ciudadNorm = norm(String(input.ciudad ?? "medellin"));

    if (!digitos) {
      return { ok: false, data: `La placa "${placa}" no trae numeros. Pidele al rider que la revise.` };
    }

    // Bogota: tabla propia de la SDM, no tenemos la rotacion vigente exacta
    if (/bogota|bogot/.test(ciudadNorm)) {
      return {
        ok: true,
        data: {
          placa, tipo, ciudad: "Bogota D.C.",
          aviso: "Bogota tiene pico y placa propio (SDM). Las reglas cambian con frecuencia y no tengo la tabla actualizada. Verifica siempre en la fuente oficial.",
          link_oficial: "https://www.movilidadbogota.gov.co/web/pico_y_placa",
          nota_motos: "En Bogota las motos tienen restricciones propias distintas a los carros.",
        },
      };
    }

    // Cali: tabla propia
    if (/\bcali\b|santiago de cali/.test(ciudadNorm)) {
      return {
        ok: true,
        data: {
          placa, tipo, ciudad: "Santiago de Cali",
          aviso: "Cali tiene su propio pico y placa. No tengo la tabla actualizada.",
          link_oficial: "https://www.movilidadcali.gov.co",
          nota: "Consulta el decreto vigente antes de salir.",
        },
      };
    }

    // Barranquilla
    if (/barranquilla/.test(ciudadNorm)) {
      return {
        ok: true,
        data: {
          placa, tipo, ciudad: "Barranquilla",
          aviso: "Barranquilla tiene su propio pico y placa. No tengo la tabla actualizada.",
          link_oficial: "https://www.barranquilla.gov.co/transito",
        },
      };
    }

    // Medellin y Area Metropolitana (tabla exacta en codigo)
    const digito = Number(tipo === "moto" ? digitos[0] : digitos[digitos.length - 1]);
    const esSegundoSemestre = new Date() >= new Date("2026-08-03T00:00:00-05:00");
    const tabla: Record<string, number[]> = esSegundoSemestre
      ? { lunes: [5, 8], martes: [1, 4], miercoles: [0, 2], jueves: [3, 6], viernes: [7, 9] }
      : { lunes: [1, 7], martes: [0, 3], miercoles: [4, 6], jueves: [5, 9], viernes: [2, 8] };

    const dia = Object.entries(tabla).find(([, ds]) => ds.includes(digito))?.[0] ?? null;

    return {
      ok: true,
      data: {
        placa, tipo,
        ciudad: "Medellin y Area Metropolitana",
        digito_que_manda: digito,
        regla: tipo === "moto" ? "primer numero de la placa" : "ultimo numero de la placa",
        dia_restringido: dia,
        horario: "5:00 a.m. a 8:00 p.m.",
        fines_de_semana: "Sabados y domingos no aplica pico y placa",
        vigencia: esSegundoSemestre
          ? "Rotacion del segundo semestre de 2026"
          : "Rotacion vigente hasta el 31 de julio de 2026; cambia el 3 de agosto",
        nota: "Este es el UNICO dia restringido para esta placa. Los demas dias puede circular.",
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

  async consultar_consentimiento(_input, phone) {
    const { data } = await supabase
      .from("rita_consentimiento")
      .select("acepta, categorias, fecha_consentimiento, fecha_revocacion, updated_at")
      .eq("telefono", phone)
      .maybeSingle();
    if (!data) return { ok: false, data: "Este rider todavia no ha definido sus preferencias de comunicacion." };
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

  async consultar_gasolina(input) {
    const ciudad = String(input.ciudad ?? "").trim();

    const tryFetch = async (url: string): Promise<string | null> => {
      try {
        const r = await fetch(url, {
          signal: AbortSignal.timeout(7000),
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; RideraBot/1.0)",
            "Accept": "text/html,application/xhtml+xml",
          },
        });
        if (!r.ok) return null;
        const html = await r.text();
        return html.length > 300 ? html : null;
      } catch { return null; }
    };

    const html = await tryFetch("https://www.sicom.gov.co/precios_de_combustibles");
    if (html) {
      const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const corriente = text.match(/corriente[^0-9$]*\$?\s*([0-9]{1,3}[.,][0-9]{3})/i);
      const extra = text.match(/\bextra\b[^0-9$]*\$?\s*([0-9]{1,3}[.,][0-9]{3})/i);
      const acpm = text.match(/\bacpm\b[^0-9$]*\$?\s*([0-9]{1,3}[.,][0-9]{3})/i);
      if (corriente || extra) {
        const precios: Record<string, string> = {};
        if (corriente) precios.corriente_galon = `$${corriente[1]}`;
        if (extra) precios.extra_galon = `$${extra[1]}`;
        if (acpm) precios.acpm_galon = `$${acpm[1]}`;
        return {
          ok: true,
          data: {
            ciudad: ciudad || "Colombia",
            precios,
            fuente: "SICOM - Superservicios",
            link: "https://www.sicom.gov.co/precios_de_combustibles",
            nota: "Precio por galon. Puede variar por municipio y EDS.",
          },
        };
      }
    }

    return {
      ok: false,
      data: `No pude consultar el precio en tiempo real. Mira el precio oficial aqui:\n• SICOM: https://www.sicom.gov.co/precios_de_combustibles\n• MinMinas: https://www.minminas.gov.co/combustibles\n\nEl precio varia por municipio. Tipos: corriente, extra, ACPM (diesel).`,
    };
  },

  async solicitar_grua(input, phone) {
    const nombre = String(input.nombre ?? "").trim();
    const ubicacion = String(input.ubicacion ?? "").trim();
    const municipio = String(input.municipio ?? "").trim();
    const nota = String(input.nota ?? "").trim();

    if (!nombre || !ubicacion) {
      return { ok: false, data: "Necesito el nombre del rider y la ubicacion para enviar la grua. Pidele esos datos primero." };
    }

    const ubicacionCompleta = nota ? `${ubicacion}. Descripcion: ${nota}` : ubicacion;

    const { error, data } = await supabase.from("solicitudes").insert({
      cliente_nombre: nombre,
      cliente_telefono: phone,
      ubicacion: ubicacionCompleta,
      municipio: municipio || "No especificado",
      estado: "pendiente",
    }).select("id").single();

    if (error) return { ok: false, data: `No se pudo crear la solicitud: ${error.message}` };
    return {
      ok: true,
      data: {
        id: data?.id,
        mensaje: "Solicitud de grua enviada. El equipo Ridera te contactara al WhatsApp en breve.",
        emergencia: "Si hay heridos, llama al 123 de inmediato.",
        alternativa: "Tambien puedes hacer seguimiento en gruas.ridera.com.co",
      },
    };
  },

  async publicar_moto(input, phone) {
    const titulo = String(input.titulo ?? "").trim();
    const precio = input.precio ? Number(input.precio) : null;

    if (!titulo) {
      return { ok: false, data: "Necesito al menos el titulo del anuncio para publicar. Ej: Honda CB500X 2022 Azul." };
    }

    const marca = String(input.marca ?? "").trim();
    const modelo = String(input.modelo ?? "").trim();

    const registro: Record<string, unknown> = {
      titulo,
      telefono: phone,
      aprobado: false,
      vendido: false,
    };

    if (marca) { registro.marca = marca; registro.marca_norm = norm(marca); }
    if (modelo) { registro.modelo = modelo; registro.modelo_norm = norm(modelo); }
    if (precio) registro.precio = precio;
    if (input.anio) registro.anio = Number(input.anio);
    if (input.kilometraje) registro.kilometraje = Number(input.kilometraje);
    if (input.cilindraje) registro.cilindraje = Number(input.cilindraje);
    if (input.color) registro.color = String(input.color);
    if (input.ciudad) { registro.ciudad = String(input.ciudad); registro.ciudad_norm = norm(String(input.ciudad)); }
    if (input.descripcion) registro.descripcion = String(input.descripcion);
    if (input.soat_vigente !== undefined) registro.soat_vigente = Boolean(input.soat_vigente);
    if (input.tecno_mecanica !== undefined) registro.tecno_mecanica = Boolean(input.tecno_mecanica);

    const { error, data } = await supabase.from("motos_venta").insert(registro).select("id").single();
    if (error) return { ok: false, data: `No se pudo publicar la moto: ${error.message}` };

    const precioStr = precio ? `$${precio.toLocaleString("es-CO")}` : "no especificado";
    return {
      ok: true,
      data: {
        id: data?.id,
        mensaje: "Moto enviada para revision. El equipo Ridera la aprobara en menos de 24 horas y quedara publicada en el marketplace.",
        titulo,
        precio: precioStr,
      },
    };
  },

  async confirmar_recordatorio(_input, phone) {
    const { data, error } = await supabase
      .from("rita_seguimiento")
      .update({ confirmado_rider: true })
      .eq("telefono", phone)
      .eq("completado", true)
      .eq("confirmado_rider", false)
      .order("fecha_followup", { ascending: false })
      .limit(1)
      .select("tipo, nota");
    if (error) return { ok: false, data: `No se pudo confirmar: ${error.message}` };
    if (!data?.length) return { ok: false, data: "No encontre un recordatorio reciente pendiente de confirmar." };
    return { ok: true, data: { confirmado: true, tipo: data[0].tipo, nota: data[0].nota } };
  },

  async diagnostico_moto(input) {
    const sintomas = String(input.sintomas ?? "").trim();
    const marca = String(input.marca ?? "").trim();
    const modelo = String(input.modelo ?? "").trim();

    if (!sintomas) {
      return {
        ok: false,
        data: "Describe los sintomas: tipo de ruido (metalico, agudo, grave), cuando ocurre (arranque, aceleracion, frenado), que parte de la moto.",
      };
    }

    const diag = diagnosticar(sintomas);
    if (!diag) {
      return {
        ok: true,
        data: {
          sintomas,
          diagnostico: "No encontre un patron especifico para esos sintomas en mi base.",
          recomendacion: "Detalla mas: que ruido hace exactamente, en que condicion ocurre, si es constante o intermitente, cuanto tiempo lleva.",
          nota: "Si el comportamiento pone en riesgo la seguridad (frenos, direccion, motor), no sigas circulando hasta revisar.",
        },
      };
    }

    return {
      ok: true,
      data: {
        sintomas,
        moto: [marca, modelo].filter(Boolean).join(" ") || "no especificada",
        problema_probable: diag.titulo,
        urgencia: diag.urgencia,
        causas_posibles: diag.causas,
        pasos_inmediatos: diag.pasos_inmediatos,
        nota: "Diagnostico orientativo. Un mecanico debe confirmar la causa real.",
      },
    };
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