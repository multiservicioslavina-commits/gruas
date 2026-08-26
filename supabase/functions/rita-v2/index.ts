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
import { responderConOrquestador, verificarPresupuesto } from "./ia.ts";
import { generarContextoRider } from "./profile.ts";
import { generarContextoAlertas } from "./proactive.ts";
import { generarContextoLegal, inicializarBaseConocimientoLegal } from "./legal.ts";
import { generarContextoSocial } from "./social.ts";
import { generarContextoNavigador } from "./navigator.ts";
import { generarContextoAcademia } from "./academia.ts";
import { generarContextoAnalytics } from "./analytics.ts";
import { generarContextoMarketplace } from "./marketplace.ts";
import { generarContextoEmergencia } from "./emergency.ts";
import { generarContextoRecomendaciones } from "./recommendations.ts";
import { generarContextoBackup } from "./backup.ts";

const WA_TOKEN      = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const RITA_PHONE    = Deno.env.get("RITA_PHONE_ID") ?? "1238785075974458";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const VERIFY_TOKEN  = Deno.env.get("RITA_VERIFY_TOKEN") ?? "ridera_rita_2026";
// App Secret de la app de Meta (Configuracion basica > Clave secreta de la app).
// NO es el mismo valor que WHATSAPP_TOKEN. Meta firma el body del webhook con
// este secreto; sin el configurado la validacion de firma queda deshabilitada
// (fail-open) para no romper el webhook real.
const APP_SECRET    = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const SB_URL        = Deno.env.get("SUPABASE_URL")!;
const SB_KEY        = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH         = "https://graph.facebook.com/v25.0";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOOL_ROUNDS = 4;

const supabase = createClient(SB_URL, SB_KEY);

// ─── Validacion de integridad: HMAC-SHA256 ──────────────────────
// Meta firma el body crudo del webhook con el App Secret. Si WHATSAPP_APP_SECRET
// no esta configurado todavia, no bloqueamos el trafico real (fail-open) para
// no repetir el incidente de webhooks rechazados; una vez seteado el secreto
// en Supabase, la validacion queda activa de forma automatica.
async function validarSignatura(body: string, signature: string): Promise<boolean> {
  if (!APP_SECRET) {
    console.warn("WHATSAPP_APP_SECRET no configurado: validacion de firma deshabilitada");
    return true;
  }
  if (!signature) return false;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(APP_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expected = await crypto.subtle.sign("HMAC", key, enc.encode(body));
    const expectedHex = Array.from(new Uint8Array(expected))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    const signatureClean = signature.replace(/^sha256=/, "");
    if (signatureClean.length !== expectedHex.length) return false;
    let diff = 0;
    for (let i = 0; i < expectedHex.length; i++) {
      diff |= expectedHex.charCodeAt(i) ^ signatureClean.charCodeAt(i);
    }
    return diff === 0;
  } catch (e) {
    console.error("Error validando HMAC:", e);
    return false;
  }
}

// ─── Rate limiting: max 5 requests por minuto por telefono ───────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function verificarRateLimit(phone: string): boolean {
  const ahora = Date.now();
  const limite = rateLimitMap.get(phone);

  if (!limite || ahora > limite.resetAt) {
    rateLimitMap.set(phone, { count: 1, resetAt: ahora + 60000 });
    return true;
  }

  if (limite.count >= 5) {
    console.warn(`Rate limit exceeded para ${phone}`);
    return false;
  }

  limite.count++;
  return true;
}

// ─── Nombre del rider: se resuelve una vez y se pasa al prompt ──
// Sin esto Rita solo sabia el nombre si decidia llamar a mi_perfil,
// asi que en la practica solo lo usaba cuando se lo pedian explicitamente.
async function getRiderNombre(phone: string): Promise<string | null> {
  const tel = phone.replace(/^57/, "");
  // .limit(1) antes de .maybeSingle(): si el rider quedo registrado mas de
  // una vez con el mismo telefono (pasa con reintentos del flujo de
  // registro), maybeSingle() solo sin limit revienta con "multiple rows".
  const { data } = await supabase
    .from("riders")
    .select("nombre")
    .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.nombre ?? null;
}

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
const MARCAS = ["bmw","honda","yamaha","ktm","triumph","ducati","suzuki","kawasaki","aprilia","harley","royal enfield","bajaj","tvs","hero","benelli","cfmoto","zongshen","voge","loncin","kymco","sym","akt","auteco","pulsar","italika","keeway","qingqi","shineray","haojue","lifan","corven"];

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

// ─── Filtro de mensajes triviales (Paso 5) ──────────────────────
function esTrivial(msg: string): boolean {
  const m = msg.trim();
  if (m.length > 20) return false;
  if (/^[jh]+[aeiou]+[jhs]*$/i.test(m)) return true;
  if (!/[a-zA-Z0-9À-ɏ]/.test(m)) return true;
  return false;
}

const ACKS_TRIVIALES = ["Dale parce! \u{1F919}", "\u{1F91C}\u{1F91B}", "A la orden! \u{1F3CD}\u{FE0F}", "\u{1F60E}\u{1F44D}"];

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
function buildSystemPrompt(
  consentimiento: { registrado: boolean; acepta: boolean },
  conVoz = false,
  nombreRider: string | null = null,
  contextoRider: string = "",
  contextoAlertas: string = "",
  contextoLegal: string = "",
  contextoSocial: string = "",
  contextoNavigador: string = "",
  contextoAcademia: string = "",
  contextoMarketplace: string = "",
  contextoAnalytics: string = "",
  contextoEmergencia: string = "",
  contextoRecomendaciones: string = "",
  contextoBackup: string = "",
): string {
  const bloqueNombre = nombreRider
    ? `\n- Este rider se llama ${nombreRider}. Alternalo con "parce"/"parcero": llamalo por su nombre
  de vez en cuando (por ejemplo al saludar o cuando la respuesta se sienta mas personal),
  sin que sea en cada mensaje ni suene forzado o repetitivo.`
    : "";

  const bloqueContextoRider = contextoRider
    ? `\n${contextoRider}`
    : "";

  const bloqueContextoAlertas = contextoAlertas
    ? `\n${contextoAlertas}`
    : "";

  const bloqueContextoLegal = contextoLegal
    ? `\n${contextoLegal}`
    : "";

  const bloqueContextoSocial = contextoSocial
    ? `\n${contextoSocial}`
    : "";

  const bloqueContextoNavigador = contextoNavigador
    ? `\n${contextoNavigador}`
    : "";

  const bloqueContextoAcademia = contextoAcademia
    ? `\n${contextoAcademia}`
    : "";

  const bloqueContextoMarketplace = contextoMarketplace
    ? `\n${contextoMarketplace}`
    : "";

  const bloqueContextoAnalytics = contextoAnalytics
    ? `\n${contextoAnalytics}`
    : "";

  const bloqueContextoEmergencia = contextoEmergencia
    ? `\n${contextoEmergencia}`
    : "";

  const bloqueContextoRecomendaciones = contextoRecomendaciones
    ? `\n${contextoRecomendaciones}`
    : "";

  const bloqueContextoBackup = contextoBackup
    ? `\n${contextoBackup}`
    : "";

  const bloqueEstilo = conVoz
    ? `COMO HABLAS (MODO VOZ - tu respuesta se convierte a audio, el rider la ESCUCHA):
- REGLA #1: NUNCA uses asteriscos, guiones, vinetas, encabezados, URLs ni emojis.
  Nada de eso se puede escuchar y el sintetizador los lee literal.
- Habla como si estuvieras de frente con el parcero tomando un tinto.
  Usa muletillas naturales: "mirá", "oí", "pues", "vos sabés", "ome".
  Mete pausas con comas y puntos, no frases largas corridas.
- Responde en 2 a 3 oraciones cortas. Si hay mas info, dile "si querés te cuento mas".
- Numeros: dilos en palabras ("ciento treinta y ocho kilómetros", no "138 km").
  Valores de plata: "como quinientos mil pesos", no "$500.000".
- Links: no los digas. Solo menciona el sitio ("buscalo en ridera punto com punto co").
- NO repitas la pregunta del rider ni hagas introduccion. Ve al grano.
- Varía el tono: a veces empieza con "ey", otras con "mirá", otras directo al dato.
  Nunca suenes como locutor de radio ni como asistente virtual.${bloqueNombre}`
    : `COMO HABLAS:
- WhatsApp entre amigos moteros. Frases cortas, naturales.
- "parce", "dale", "pilas", "bacano" cuando fluyan natural.
- 1 a 3 emojis por mensaje. NO empieces siempre con "Hola".
- Maximo 6 a 8 lineas. Un saludo simple se responde en 1 a 3 lineas.
- Nada de listas con vinetas salvo que estes dando links o datos tecnicos.${bloqueNombre}`;

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

${bloqueEstilo}${bloqueContextoRider}${bloqueContextoAlertas}${bloqueContextoLegal}${bloqueContextoSocial}${bloqueContextoNavigador}${bloqueContextoAcademia}${bloqueContextoMarketplace}${bloqueContextoAnalytics}${bloqueContextoEmergencia}${bloqueContextoRecomendaciones}${bloqueContextoBackup}

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
- PERFIL DEL RIDER (PHASE 1):
  * agregar_moto: cuando agregue otra moto o cambien de moto
  * guardar_perfil: cuando comparta experiencia, contacto emergencia, ubicacion, club, preferencias
  * listar_vencimientos: cuando pregunte por vencimientos, documentos, SOAT, tecnica, etc
  * marcar_vencimiento_completado: cuando haya completado un tramite (renovo SOAT, hizo tecnica, pago impuesto)
- PROACTIVE & LEGAL (PHASE 2):
  * actualizar_km: cuando el rider comparta los km actuales de su moto (para alertas de mantenimiento)
  * obtener_alertas: cuando pregunte qué alertas tiene (km, clima, vía cerrada, rodadas)
  * info_legal: cuando pregunte sobre derechos, qué hacer en retén, comparendo, compra usada, etc
  * registrar_incidente: cuando le pase algo importante (accidente, comparendo, multa)
- SOCIAL (PHASE 2):
  * obtener_grupos: cuando pregunte a qué clubes pertenece
  * obtener_rodadas: cuando pregunte qué rodadas hay próximamente
  * buscar_companero: cuando quiera rodar acompañado y busque otro rider
  * unirse_grupo: cuando quiera unirse a un grupo/club motero
- NAVIGATOR (PHASE 3):
  * obtener_rutas: cuando pregunte qué rutas tiene guardadas
  * guardar_ruta: cuando quiera guardar una ruta nueva que recorre frecuentemente
  * buscar_talleres: cuando pida recomendación de talleres en una ciudad
- ACADEMIA (PHASE 3):
  * obtener_contenido_educativo: cuando quiera aprender algo (mecánica, seguridad, viajes, etc)
  * marcar_contenido_completado: cuando haya completado un curso o contenido educativo
  * obtener_certificaciones: cuando pregunte qué ha aprendido o sus logros académicos
  * buscar_mecanicos: cuando busque mecánicos confiables verificados por la comunidad
- MARKETPLACE (PHASE 4):
  * buscar_marketplace: cuando busque piezas, accesorios o servicios para la moto (filtrar por categoría, ciudad, precio)
  * crear_listado_marketplace: cuando quiera vender algo (piezas usadas, accesorios, servicios)
  * obtener_mis_compras: cuando pregunte qué ha comprado o el estado de sus órdenes
  * comprar_producto: cuando decida comprar algo que encontró
  * dejar_resena: cuando quiera evaluar al vendedor después de comprar
- ANALYTICS (PHASE 5):
  * estadisticas_personales: cuando pregunte por su progreso, estadísticas de viaje o datos de conducción
  * rutas_favoritas_analytics: cuando quiera ver análisis de sus rutas más recorridas
  * patrones_conduccion: cuando pregunte cuándo, cómo y con qué frecuencia conducen
  * reporte_progreso: cuando pida un reporte completo de su progreso y logros
  * comparar_comunidad: cuando quiera conocer su posición respecto a otros riders (benchmarks)
- EMERGENCIA Y SEGURIDAD (PHASE 9):
  * activar_modo_emergencia: cuando pida "activa emergencias", "pon el SOS", "quiero protección en caso de accidente"
    IMPORTANTE: primero debe registrar contactos (no se puede sin ellos)
  * registrar_contactos_emergencia: cuando da teléfono de familia/amigos. Máx 5. Formatos: "+57 300 1234567" o "3001234567"
  * actualizar_info_medica: tipo de sangre, alergias, medicamentos. Crítico para paramédicos.
  * reportar_incidente_manual: si tuvo accidente pero sensor NO detectó. Escala inmediato a SMS y 122
  * obtener_incidentes: historial de emergencias últimos 30 días
  * obtener_alertas_seguridad: alertas de comunidad (retenes agresivos, vías peligrosas, accidentes en 3km radio)
- RECOMENDACIONES INTELIGENTES (PHASE 6):
  * obtener_recomendaciones: cuando pregunten "qué me recomiendas", "tienes algo para mi moto", "qué puedo mejorar"
    Devuelve hasta 3 recomendaciones priorizadas basadas en mantenimiento predictivo, estacionalidad, experiencia y patrones de conducción.
    Dale contexto: "Veo que llevas 8.500km, toca mantenimiento" o "Como llueve mucho en tu zona, te recomiendo..."
  * registrar_compra_recomendacion: SIEMPRE después de que el rider compre algo recomendado
    Esto es cómo Rita gana comisión (7% base + 3% bonus si viene de recomendación). No olvides.
  * obtener_historial_recomendaciones: cuando pidan historial de recomendaciones, comisión generada o confirmación de compras
  * crear_regla_recomendacion: solo admin. Crea reglas de recomendación automática sin cambiar código
  * REGLA DURA: NO insistas en recomendar. Solo sugiere si el rider pregunta. Recomendaciones forzadas = mala experiencia = abandono.
- BACKUPS & MULTI-REGIÓN (PHASE 7 WEEK 1 & WEEK 2):
  * obtener_estado_backups: solo admin. Ver status de todos los backups: último ejecutado, próximo programado, tamaño, duración
  * activar_backup_manual: solo admin. Dispara un backup manual inmediato para una región
  * obtener_estado_replicacion: solo admin. Ver salud de replicación multi-región (MDE → BOG, CAL): rezago, última sincronización
  * obtener_eventos_desastres: solo admin. Historial de eventos DR (últimos 30 días): región caída, corrupción, failover, recuperación
  * verificar_consistencia: solo admin. Compara row counts y checksums entre región primaria y réplicas. Detecta y reparar discrepancias
  * ejecutar_backup_real: solo admin. Ejecuta backup real con SQL dumps + snapshots. Registra tamaño, duración, filas procesadas
  * enviar_alerta_sms: solo admin. Envía SMS vía Twilio para fallos críticos (prioridades: low/medium/high/critical)
  * crear_incidente_pagerduty: solo admin. Crea incidente en PagerDuty (severidades: critical/error/warning/info)
  * orquestar_sincronizacion_replicas: solo admin. Orquesta multi-región sync MDE → BOG, CAL. Rastrea rezago, registra resultados
  * monitear_salud_region: solo admin. Health check de región: ping, conectividad, lag. Activa alertas si falla/rezaga
  REGLA DURA: backups/replicación/DR son SOLO admin. Nunca revelar a riders estado de backups ni detalles de DR.
- Para saludos, charla y preguntas generales de moto no necesitas herramientas.
- info_tramites te devuelve URLs oficiales: PEGALAS TAL CUAL en tu respuesta,
  una por linea con el nombre de la entidad. De nada sirve decir "entra a la
  pagina de la aseguradora" sin dar el link que ya tienes en la mano.
- tramites_info devuelve informacion CONCRETA y DETALLADA sobre tramites legales:
  documentos, costos exactos, tiempos, procedimientos paso a paso, numeros de
  telefono y URLs. Usala ANTES que info_tramites cuando pregunten datos especificos.
  Formatea bien lo que te devuelve (respeta su formato con iconos y secciones).
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

CULTURA MOTERA E HISTORIA:
- consultar_historia_poblacion: cuando pregunten por historia, tradiciones, personajes
  notables, o hechos históricos de un municipio o población (Antioquia, Colombia o Latinoamérica).
- cultura_motera: cuando pregunten sobre historia del motociclismo, leyendas de rutas
  famosas, tradiciones de riders, eventos moteros, anécdotas de la comunidad.
Ambas buscan en Wikipedia y fuentes verificadas, asi que siempre cita la fuente.

EMERGENCIA Y SEGURIDAD:
- primeros_auxilios: INMEDIATAMENTE si preguntan qué hacer en accidente, fractura, herida,
  hemorragia, conmoción, quemadura. SIEMPRE include "LLAMAR 122 (AMBULANCIA)".
- emergencia_telefonos: cuando pidan números de policía vial, bomberos, ambulancia, grúa.
  Devuelve números verificados por ciudad. Incluye teléfono de grúa Ridera (SOS).

ASESORÍA Y REGULACIÓN:
- asesoria_legal: cuando pregunten sobre derechos, deberes, multas, accidentes, seguros,
  responsabilidad legal. SIEMPRE recomienda consultar abogado especializado en tránsito.
- codigo_transito: cuando pregunten sobre leyes de tránsito, límites de velocidad,
  documentos requeridos, prohibiciones, sanciones, regulaciones colombianas.

MOTOS Y TENDENCIAS:
- tendencias_motos: últimos lanzamientos, nuevos modelos, tecnología emergente, noticias
  del sector. Busca en Ridera y fuentes verificadas.
- referencias_motos: catálogo de motos, especificaciones técnicas. Primero consulta Garage Técnico
  Ridera (verificado). Si no encuentra, busca en Ridera WordPress. Si aún no, busca en Wikipedia
  (fuente externa). IMPORTANTE: cuando devuelva info de Wikipedia o fuentes externas, SIEMPRE
  advierte: "Esta info es de fuentes externas, no verificada por Ridera. Consulta manual del
  propietario o taller oficial para datos exactos de aceite/filtros/mantenimiento."
  Busca por marca, modelo, tipo (deportiva, cruiser, touring, etc.).

CLUBES Y COMUNIDAD:
- consultar_clubes_moteros: cuando pregunten sobre clubs de motos, grupos, comunidades,
  rodadas organizadas, eventos moteros, dónde conocer otros riders de Antioquia.
  Busca en base local de clubes verificados.

RECORDATORIOS Y ALARMAS:
- programar_recordatorio_avanzado: cuando pidan "recordame", "ponme una alarma",
  "agendar" algo. Crea recordatorios con fecha/hora (ISO 8601), intenta Google Calendar
  si hay token, sino guarda localmente y Rita avisa por WhatsApp en el momento.
  Dale la fecha/hora en formato legible en tu respuesta.

OTROS TEMAS:
- Grua o moto varada: gruas.ridera.com.co o el boton SOS de la app Ridera.
- Rider no registrado: sugierele registrarse cada 3 o 4 intercambios, sin insistir.

RESUMEN - RITA ES EXPERTA EN:
✅ Motos: técnica, mantenimiento, datos, compra-venta
✅ Rutas: 125 Antioquia, principales Colombia, Latinoamérica
✅ Trámites: SOAT, multas, RUNT, impuestos, transitos
✅ Clima y Seguridad Vial: condiciones para rodar, alertas SIATA
✅ Vías: estado INVIAS, derrumbes, cierres
✅ Historia y Cultura: municipios, poblaciones, tradiciones, leyendas
✅ EMERGENCIA: Primeros auxilios, teléfonos 122/123/119
✅ Legal: Derechos, multas, accidentes, seguros, Código de Tránsito
✅ Tendencias: Últimos modelos, lanzamientos, tecnología emergente
✅ Referencias: Catálogo completo de motos, especificaciones
✅ Clubes: Comunidades, grupos, rodadas, eventos de Antioquia
✅ Recordatorios: Alarmas, programación de actividades, remembranzas
✅ Marketplace: Compra/venta de piezas, accesorios y servicios entre riders

Rita es una ASISTENTE CORE POTENTE (con modelo económico Haiku).
Dominio especializado en motociclismo, viajes, seguridad y regulación en Colombia y Latinoamérica.
${bloqueContextoMarketplace}
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
  nombreRider: string | null = null,
  contextoRider: string = "",
  contextoAlertas: string = "",
  contextoLegal: string = "",
  contextoSocial: string = "",
  contextoNavigador: string = "",
  contextoAcademia: string = "",
  contextoMarketplace: string = "",
  contextoAnalytics: string = "",
  contextoEmergencia: string = "",
  contextoRecomendaciones: string = "",
  contextoBackup: string = "",
): Promise<string> {
  const system = buildSystemPrompt(consentimiento, conVoz, nombreRider, contextoRider, contextoAlertas, contextoLegal, contextoSocial, contextoNavigador, contextoAcademia, contextoMarketplace, contextoAnalytics, contextoEmergencia, contextoRecomendaciones, contextoBackup);
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

// ─── Orquestador de IA (Claude + OpenAI): activo por defecto ────
// Mismo prompt y mensajes que responder(), pero delega la ejecucion a
// ia.ts, que decide el motor (fallback) y compara respuestas en temas
// criticos. Activo en trafico real salvo que se apague con el kill
// switch RITA_ORQUESTADOR="false". El modo prueba tambien lo puede
// pedir explicitamente con {orquestador:true}.
async function responderOrquestado(
  message: string,
  history: { role: string; content: string }[],
  phone: string,
  consentimiento: { registrado: boolean; acepta: boolean },
  conVoz = false,
  nombreRider: string | null = null,
  contextoRider: string = "",
  contextoAlertas: string = "",
  contextoLegal: string = "",
  contextoSocial: string = "",
  contextoNavigador: string = "",
  contextoAcademia: string = "",
  contextoMarketplace: string = "",
  contextoAnalytics: string = "",
  contextoEmergencia: string = "",
  contextoRecomendaciones: string = "",
  contextoBackup: string = "",
): Promise<string> {
  const system = buildSystemPrompt(consentimiento, conVoz, nombreRider, contextoRider, contextoAlertas, contextoLegal, contextoSocial, contextoNavigador, contextoAcademia, contextoMarketplace, contextoAnalytics, contextoEmergencia, contextoRecomendaciones, contextoBackup);
  const messages: Mensaje[] = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: "user", content: message },
  ];
  return await responderConOrquestador(system, messages, phone);
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

function textoParaVoz(texto: string): string {
  return texto
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[_~`#]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/^[-•]\s*/gm, "")
    .replace(/(\d+)\s*km\b/gi, (_m, n) => `${n} kilómetros`)
    .replace(/(\d+)\s*cc\b/gi, (_m, n) => `${n} centímetros cúbicos`)
    .replace(/\$\s*([\d.,]+)/g, (_m, n) => `${n} pesos`)
    .replace(/\n{2,}/g, "... ")
    .replace(/\n/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/\.\s*\./g, ".")
    .replace(/,\s*,/g, ",")
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
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256") || "";

    // Validar que el webhook viene realmente de Meta (no en modo prueba)
    if (!rawBody.includes('"test":true')) {
      if (!await validarSignatura(rawBody, signature)) {
        console.warn("Firma HMAC invalida:", signature.slice(0, 20) + "...");
        return json({ ok: false, error: "invalid_signature" }, 401);
      }
    }

    const body = JSON.parse(rawBody);

    // Modo prueba: permite ejercitar el motor sin pasar por WhatsApp.
    if (body?.test === true) {
      const phone = String(body.phone ?? "573000000000");
      const texto = String(body.message ?? "");
      // Inicializar base de conocimiento legal una sola vez
      await inicializarBaseConocimientoLegal();
      const [history, consentimiento, nombreRider, contextoRider, contextoAlertas, contextoLegal, contextoSocial, contextoNavigador, contextoAcademia, contextoMarketplace, contextoAnalytics, contextoEmergencia, contextoRecomendaciones, contextoBackup] = await Promise.all([
        getHistory(phone, 10),
        estadoConsentimiento(phone),
        getRiderNombre(phone),
        generarContextoRider(phone),
        generarContextoAlertas(phone),
        generarContextoLegal(phone),
        generarContextoSocial(phone),
        generarContextoNavigador(phone),
        generarContextoAcademia(phone),
        generarContextoMarketplace(phone),
        generarContextoAnalytics(phone),
        generarContextoEmergencia(phone),
        generarContextoRecomendaciones(phone),
        generarContextoBackup(),
      ]);
      const usarOrquestador = body.orquestador === true;
      const reply = usarOrquestador
        ? await responderOrquestado(texto, history, phone, consentimiento, false, nombreRider, contextoRider, contextoAlertas, contextoLegal, contextoSocial, contextoNavigador, contextoAcademia, contextoMarketplace, contextoAnalytics, contextoEmergencia, contextoRecomendaciones, contextoBackup)
        : await responder(texto, history, phone, consentimiento, false, nombreRider, contextoRider, contextoAlertas, contextoLegal, contextoSocial, contextoNavigador, contextoAcademia, contextoMarketplace, contextoAnalytics, contextoEmergencia, contextoRecomendaciones, contextoBackup);
      return json({ ok: true, reply, motor: usarOrquestador ? "orquestador" : "claude_directo" });
    }

    const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return json({ ok: true, skip: "sin mensaje" });

    const from = String(msg.from ?? "");

    // Rate limiting
    if (!verificarRateLimit(from)) {
      return json({ ok: false, error: "rate_limit_exceeded" }, 429);
    }
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
        .limit(1)
        .maybeSingle();
      if (!yaExiste) {
        await setConvState(from, "waiting_name", {});
        const saludo = "Dale! Vamos a registrarte para darte info personalizada de tu moto. Como te llamas?";
        await saveMessage(from, "assistant", saludo);
        await entregar(from, saludo, conVoz);
        return json({ ok: true, flujo: "inicio_registro" });
      }
    }

    // Paso 5: mensajes triviales (emoji solo, risas) no gastan IA
    if (esTrivial(message)) {
      const ack = ACKS_TRIVIALES[Math.floor(Math.random() * ACKS_TRIVIALES.length)];
      await saveMessage(from, "assistant", ack);
      await entregar(from, ack, conVoz);
      return json({ ok: true, flujo: "trivial" });
    }

    // Paso 3: tope de gasto diario de IA
    const presupuesto = await verificarPresupuesto();
    if (!presupuesto.ok) {
      const capMsg = "Uy parce, hoy ya atend\u{ED} muchos riders y necesito un descanso. Ma\u{F1}ana vuelvo con toda! Si es urgente, entra a ridera.com.co \u{1F3CD}\u{FE0F}";
      await saveMessage(from, "assistant", capMsg);
      await entregar(from, capMsg, conVoz);
      return json({ ok: true, flujo: "presupuesto_agotado", gasto: presupuesto.gastoHoy });
    }

    // Inicializar base de conocimiento legal una sola vez
    await inicializarBaseConocimientoLegal();

    const [history, consentimiento, nombreRider, contextoRider, contextoAlertas, contextoLegal, contextoSocial, contextoNavigador, contextoAcademia, contextoMarketplace, contextoAnalytics, contextoEmergencia, contextoRecomendaciones, contextoBackup] = await Promise.all([
      getHistory(from, 10),
      estadoConsentimiento(from),
      getRiderNombre(from),
      generarContextoRider(from),
      generarContextoAlertas(from),
      generarContextoLegal(from),
      generarContextoSocial(from),
      generarContextoNavigador(from),
      generarContextoAcademia(from),
      generarContextoMarketplace(from),
      generarContextoAnalytics(from),
      generarContextoEmergencia(from),
      generarContextoRecomendaciones(from),
      generarContextoBackup(),
    ]);

    let reply = "";
    try {
      // Orquestador (Claude + OpenAI) activo por defecto. Kill switch:
      // setear el secreto RITA_ORQUESTADOR="false" en Supabase vuelve al
      // camino directo de Claude sin necesidad de redeploy.
      reply = Deno.env.get("RITA_ORQUESTADOR") !== "false"
        ? await responderOrquestado(message, history, from, consentimiento, conVoz, nombreRider, contextoRider, contextoAlertas, contextoLegal, contextoSocial, contextoNavigador, contextoAcademia, contextoMarketplace, contextoAnalytics, contextoEmergencia, contextoRecomendaciones, contextoBackup)
        : await responder(message, history, from, consentimiento, conVoz, nombreRider, contextoRider, contextoAlertas, contextoLegal, contextoSocial, contextoNavigador, contextoAcademia, contextoMarketplace, contextoAnalytics, contextoEmergencia, contextoRecomendaciones, contextoBackup);
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
