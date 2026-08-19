import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SB_URL, SB_KEY);

// ── Generic topic info (when no brand is specified) ───────────────
const TOPIC_INFO: Record<string, any> = {
  aceite: { titulo: 'Cambio de Aceite', interval: '6.000–10.000 km / 1 año', tiempo: '30–45 min',
    lede: 'El aceite es la sangre de tu motor. Cambiarlo a tiempo es lo más barato y más importante que puedes hacer.',
    detalle: 'Lubrica piezas en movimiento, disipa calor, arrastra residuos y protege el metal. Siempre JASO MA/MA2 para embrague húmedo.',
    pasos: '1. Calienta el motor 3–5 min. 2. Abre tapón de vaciado, drena y cambia filtro. 3. Unta aceite en junta del filtro. 4. Llena, arranca 30s, apaga, espera 2 min, verifica nivel.',
    señales: 'Aceite oscuro/quemado en mirilla. Cambios de marcha duros. Embrague patina en pendiente.',
    tip: 'Espera 2 min después de llenar antes de leer la mirilla, en caliente el nivel engaña.',
    warn: 'Sobrellenar es un error común: el cigüeñal bate el aceite y pierde lubricación.',
    link: 'https://ridera.com.co/garage-tecnico/' },
  filtroaire: { titulo: 'Filtro de Aire', interval: '~15.000 km (menos en destapado)', tiempo: '20–40 min',
    lede: 'El mantenimiento más barato y el más olvidado. Filtro tapado = pérdida de potencia y más consumo.',
    señales: 'Pérdida de potencia gradual. Mayor consumo de gasolina. Acelerador perezoso.',
    tip: 'Golpea el filtro de papel de canto para soltar polvo grueso; míralo a contraluz.',
    warn: 'Nunca soples un filtro de papel con compresor a presión alta, revientas las fibras.',
    link: 'https://ridera.com.co/garage-tecnico/' },
  frenos: { titulo: 'Sistema de Frenos', interval: 'Pastillas 15–25K km · líquido cada 2 años', tiempo: '45–60 min',
    lede: 'El único sistema cuyo fallo no perdona. No se ahorra aquí.',
    señales: 'Chirrido metálico agudo = testigo de desgaste. Vibración al frenar = disco alabeado. Maneta esponjosa = aire en el líquido.',
    tip: 'Al cambiar pastillas, limpia y engrasa los pasadores de la mordaza con grasa de alta temperatura.',
    warn: 'Con la pastilla fuera, no toques la maneta: el pistón sale. Nunca mezcles tipos de líquido.',
    link: 'https://ridera.com.co/garage-tecnico/' },
  abs: { titulo: 'Sistema ABS', interval: 'Revisión de sensores en cada servicio', tiempo: 'Diagnóstico 30 min',
    lede: 'El ABS evita que las ruedas se bloqueen para que sigas controlando la moto al frenar fuerte.',
    señales: 'Testigo ABS encendido = sistema desactivado. Causa #1: sensor con barro o conector húmedo.',
    tip: 'Después de lavar a presión, si aparece el testigo, desconecta el sensor, limpia con limpiacontactos y sopla.',
    link: 'https://ridera.com.co/garage-tecnico/' },
  suspension: { titulo: 'Suspensión', interval: 'Retenes: revisar siempre · service ~40K km', tiempo: 'Ajuste 20 min',
    lede: 'La suspensión mantiene las llantas pegadas al piso. Mal ajustada, la moto rebota y pierdes confianza.',
    señales: 'Línea de aceite en barras = retén dañado. Holgura en rodamientos de dirección.',
    tip: 'Calibra el sag: con tu peso puesto debe hundirse un tercio del recorrido.',
    warn: 'Retén con fuga de aceite cae sobre pastillas y disco. Retén con fuga = no rodar.',
    link: 'https://ridera.com.co/garage-tecnico/' },
  bateria: { titulo: 'Batería', interval: 'Vida útil 3–5 años', tiempo: '15 min',
    lede: 'Batería débil genera fallas eléctricas raras. El peor enemigo: dejar la moto parada semanas.',
    señales: 'Arranque lento. Luces tenues. Reloj se reinicia. Fallas intermitentes raras.',
    tip: 'Mide voltaje en reposo (~12.6V) y a 3–4K rpm (debe subir a 13.5–14.5V). Si no sube = regulador/estátor.',
    warn: 'Nunca arranques con cables de carro encendido, picos de voltaje dañan la electrónica.',
    link: 'https://ridera.com.co/garage-tecnico/' },
  ecu: { titulo: 'ECU y Diagnóstico', interval: 'Escaneo ante cualquier testigo', tiempo: 'Lectura 15 min',
    lede: 'La ECU guarda el motivo exacto de cada falla en un código DTC. Diagnosticar a ciegas es perder tiempo y plata.',
    tip: 'Lee el código antes de ir al taller. Muchas motos muestran el código en pantalla con secuencia de llave.',
    warn: 'Borrar el código no arregla la falla, solo apaga la luz temporalmente.',
    link: 'https://ridera.com.co/garage-tecnico/' },
  llantas: { titulo: 'Llantas y Neumáticos', interval: 'Presión cada 2 semanas · vida 5–6 años', tiempo: '10 min',
    lede: 'Dos parches de goma cargan toda tu seguridad. La presión es el ajuste gratis más importante.',
    señales: 'Desgaste disparejo = presión incorrecta o suspensión mal ajustada. Grietas en flancos.',
    tip: 'Lee el código DOT (últimos 4 dígitos = semana+año). Presión siempre en frío.',
    warn: 'Llanta con dibujo puede estar peligrosa por endurecimiento. Si está dura como plástico, ya perdió agarre.',
    link: 'https://ridera.com.co/garage-tecnico/' },
  cadena: { titulo: 'Cadena y Transmisión', interval: 'Lubricar cada 500–800 km · kit 25–35K km', tiempo: '20 min',
    lede: 'Cadena, piñón y catalina siempre se cambian juntos como kit.',
    señales: 'Eslabones que no flexionan. Dientes con forma de gancho. Si jalas atrás y muestra más de medio diente, cambiar.',
    tip: 'Lubrica con motor templado, el calor dilata eslabones y la grasa penetra.',
    warn: 'No limpies con gasolina: disuelve la grasa interna de los retenes O-ring. Usa limpiador específico.',
    link: 'https://ridera.com.co/garage-tecnico/' },
  cardan: { titulo: 'Transmisión por Cardán', interval: 'Aceite según fabricante ~20K km', tiempo: 'Service en taller',
    lede: 'Silencioso y durable. Bajo mantenimiento no es cero mantenimiento.',
    tip: 'Engrasa los estriados cada vez que desmontes la rueda trasera.',
    warn: 'Clonk al abrir/cerrar gas = holgura en junta universal, revisar pronto.',
    link: 'https://ridera.com.co/garage-tecnico/' },
  electrico: { titulo: 'Sistema Eléctrico', interval: 'Revisión de conexiones en cada service', tiempo: 'Variable',
    lede: 'Fallas eléctricas intermitentes casi siempre son conexión floja o húmeda, no la pieza cara.',
    tip: 'Revisa puntos de masa (tierras) oxidados, causan fallas imposibles.',
    warn: 'Antes de instalar accesorios eléctricos, verifica capacidad del alternador.',
    link: 'https://ridera.com.co/garage-tecnico/' },
  valvulas: { titulo: 'Reglaje de Válvulas', interval: '15.000–24.000 km según marca', tiempo: '2–4 horas en taller',
    lede: 'Válvulas fuera de ajuste = pérdida de potencia, mayor consumo y daño progresivo al motor.',
    señales: 'Ruido tipo "tic-tic" metálico en el motor. Arranque difícil en frío.',
    tip: 'En motos con reglaje de cuna (shims), guarda los valores antes de desmontar.',
    warn: 'No postergues el reglaje: holgura excesiva daña la cabeza del motor.',
    link: 'https://ridera.com.co/garage-tecnico/' },
};

function infoKey(n: string): string {
  const s = n.toLowerCase();
  if (s.includes('filtro') && s.includes('air')) return 'filtroaire';
  if (s.includes('aceite') || s.includes('lubric')) return 'aceite';
  if (s.includes('abs')) return 'abs';
  if (s.includes('freno') || s.includes('pastilla')) return 'frenos';
  if (s.includes('suspens')) return 'suspension';
  if (s.includes('cardán') || s.includes('cardan')) return 'cardan';
  if (s.includes('cadena') || s.includes('transmis')) return 'cadena';
  if (s.includes('bater')) return 'bateria';
  if (s.includes('ecu') || s.includes('diagn') || s.includes('testigo') || s.includes('codigo')) return 'ecu';
  if (s.includes('llanta') || s.includes('neumát') || s.includes('neumat') || s.includes('presion') || s.includes('psi')) return 'llantas';
  if (s.includes('eléctr') || s.includes('electr') || s.includes('fusib')) return 'electrico';
  if (s.includes('valvul') || s.includes('válvul') || s.includes('tic-tic') || s.includes('tic tic')) return 'valvulas';
  if (s.includes('motor')) return 'aceite';
  return '';
}

function norm(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ── Search garage_motos table ─────────────────────────────────────
async function searchMotoSpecs(query: string): Promise<any[]> {
  const q = norm(query);
  const words = q.split(/[\s,.\-]+/).filter((w: string) => w.length > 2);

  const BRANDS = ['suzuki','yamaha','honda','bmw','triumph','kawasaki','ktm','ducati','aprilia','harley'];
  const brand = BRANDS.find(b => q.includes(b));
  if (!brand) return [];

  // Build a search query based on brand + any model keywords
  const modelKeywords = words.filter((w: string) => !BRANDS.includes(w) && w.length > 2);

  // Query by brand first
  let dbQuery = supabase
    .from('garage_motos')
    .select('id,marca,modelo,años,aceite_litros,aceite_spec,torque_filtro,cambio_aceite_km,llantas_psi,variantes,mantenimiento,fallas')
    .ilike('marca', `%${brand}%`);

  // Add model filter if we have keywords
  if (modelKeywords.length > 0) {
    // Try to match numbers (cc, year) or model name words
    const numMatch = modelKeywords.find((w: string) => /^\d{3,4}$/.test(w));
    const wordMatches = modelKeywords.filter((w: string) => !/^\d{1,2}$/.test(w));

    if (wordMatches.length > 0 || numMatch) {
      const orFilters = [];
      for (const w of wordMatches.slice(0, 3)) {
        orFilters.push(`modelo.ilike.%${w}%`);
      }
      if (numMatch) orFilters.push(`modelo.ilike.%${numMatch}%`);
      if (orFilters.length > 0) {
        dbQuery = dbQuery.or(orFilters.join(','));
      }
    }
  }

  const { data } = await dbQuery.limit(3);
  return data || [];
}

// ── Build result from moto spec ──────────────────────────────────
function buildMotoResult(moto: any, topicKey: string): any {
  const mant = (moto.mantenimiento || []) as any[];
  const fallas = (moto.fallas || []) as any[];
  const llantas = moto.llantas_psi || {};

  let llantasStr = '';
  if (llantas.delantera) llantasStr += `Del: ${llantas.delantera} PSI`;
  if (llantas.trasera_solo) llantasStr += ` | Tras solo: ${llantas.trasera_solo} PSI`;
  if (llantas.trasera_carga) llantasStr += ` | Tras cargada: ${llantas.trasera_carga} PSI`;
  if (llantas.nota) llantasStr += ` (${llantas.nota})`;

  // Filter maintenance to relevant topic if specified
  let mantFiltrado = mant;
  if (topicKey && topicKey !== 'llantas') {
    const keywords: Record<string, string[]> = {
      aceite: ['aceite','lubric'],
      filtroaire: ['filtro de aire','filtro aire'],
      frenos: ['freno','pastilla','disco'],
      cadena: ['cadena'],
      bateria: ['bateria','bater'],
      valvulas: ['valvula','válvula'],
      cardan: ['card'],
      suspension: ['suspens'],
    };
    const kws = keywords[topicKey];
    if (kws) {
      const filtered = mant.filter((m: any) => kws.some(k => norm(m.item || '').includes(k)));
      if (filtered.length > 0) mantFiltrado = filtered;
    }
  }

  // For llantas query, return tire-specific response
  const result: any = {
    tipo: 'garage_moto_spec',
    marca: moto.marca,
    modelo: moto.modelo,
    años: moto.años,
    aceite: `${moto.aceite_litros} de ${moto.aceite_spec} — filtro: ${moto.torque_filtro} — cambio cada ${moto.cambio_aceite_km?.toLocaleString()} km`,
    llantas: llantasStr || null,
    mantenimiento: mantFiltrado.slice(0, 5).map((m: any) => `${m.item}: ${m.accion} — ${m.intervalo}`),
    fallas_comunes: fallas.slice(0, 3).map((f: any) => ({ nombre: f.nombre, sintoma: f.sintoma, solucion: f.solucion })),
    link: 'https://ridera.com.co/garage-tecnico/',
  };

  if (moto.variantes) result.variantes = moto.variantes;
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  }
  try {
    const { query } = await req.json();
    const q = norm(query || '');
    if (!q) {
      return new Response(JSON.stringify({ resultados: [] }), { headers: { 'Content-Type': 'application/json' } });
    }

    const topicKey = infoKey(q);
    const resultados: any[] = [];

    // 1. Try model-specific search in garage_motos table
    const motoSpecs = await searchMotoSpecs(query);
    if (motoSpecs.length > 0) {
      for (const moto of motoSpecs) {
        resultados.push(buildMotoResult(moto, topicKey));
      }
      return new Response(JSON.stringify({ resultados }), { headers: { 'Content-Type': 'application/json' } });
    }

    // 2. Generic topic info (no brand specified)
    if (topicKey) {
      const info = TOPIC_INFO[topicKey];
      if (info) {
        resultados.push({
          tipo: 'garage_general',
          sistema: info.titulo,
          intervalo: info.interval,
          resumen: info.lede,
          detalle: info.detalle || '',
          señales: info.señales || '',
          pasos: info.pasos || '',
          tip: info.tip,
          cuidado: info.warn || '',
          link: info.link,
        });
      }
    }

    return new Response(JSON.stringify({ resultados }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), resultados: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
});
