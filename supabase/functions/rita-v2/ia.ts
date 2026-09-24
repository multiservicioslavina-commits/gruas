// ─────────────────────────────────────────────────────────────────
// Rita v2 — Orquestador de IA
//
// Un solo cerebro que decide que motor usar (OpenAI o Claude) y le da
// a Rita una API unica: ella nunca sabe cual modelo respondio. Reglas:
//
//   1. PRIMARIO: OpenAI gpt-4o-mini con Function Calling.
//      Lee OPENAI_API_KEY desde los secretos de Supabase.
//   2. FALLBACK: Claude solo entra si OpenAI falla (error de red,
//      timeout, respuesta no-ok).
//   3. AUDITORIA: cuando la respuesta uso alguna herramienta, o el tema
//      es sensible por texto (seguridad, legal, multas), Claude Haiku
//      audita la respuesta contra la evidencia real de las herramientas
//      -- no contra un segundo borrador -- buscando afirmaciones que esa
//      evidencia no respalda. Si encuentra algo que le puede costar caro
//      al rider, el mismo proveedor que respondio corrige, con un tope
//      de reintentos para no entrar en ciclos.
//   4. Cada llamada queda auditada en rita_ai_logs: proveedor, modelo,
//      tokens, costo estimado y tipo de consulta -- via uso_ia.ts, que
//      tambien usan tools.ts (buscar_web_verificado) y vision.ts
//      (describirFoto/describirDocumento) para que Gemini quede en la
//      misma tabla y cuente para el mismo tope de gasto diario.
//
// Ambas claves (ANTHROPIC_API_KEY, OPENAI_API_KEY) viven solo en los
// secretos de Supabase; nunca llegan al cliente/APK.
// ─────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { TOOL_SCHEMAS, ejecutarHerramienta, extraerUrls, sanitizarUrls } from "./tools.ts";
import { logError, logWarn } from "../_shared/log.ts";
import { registrarUsoIA } from "./uso_ia.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
const OPENAI_KEY = (Deno.env.get("OPENAI_API_KEY") ?? "").trim();

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const OPENAI_MODEL = "gpt-4o-mini";
const MAX_TOOL_ROUNDS = 4;

const supabase: SupabaseClient = createClient(SB_URL, SB_KEY);

// ─── Tope de gasto diario ───────────────────────────────────────
const DAILY_CAP_USD = parseFloat(Deno.env.get("RITA_DAILY_CAP_USD") ?? "5");

function inicioDelDiaColombia(): string {
  const ahora = new Date();
  const medianoche = new Date(ahora);
  medianoche.setUTCHours(5, 0, 0, 0);
  if (ahora < medianoche) medianoche.setUTCDate(medianoche.getUTCDate() - 1);
  return medianoche.toISOString();
}

export async function verificarPresupuesto(): Promise<{ ok: boolean; gastoHoy: number; tope: number }> {
  if (DAILY_CAP_USD <= 0) return { ok: true, gastoHoy: 0, tope: 0 };
  try {
    const desde = inicioDelDiaColombia();
    const { data } = await supabase
      .from("rita_ai_logs")
      .select("costo_usd")
      .gte("created_at", desde);
    const gastoHoy = (data || []).reduce((sum: number, r: Record<string, number>) => sum + (r.costo_usd || 0), 0);
    return { ok: gastoHoy < DAILY_CAP_USD, gastoHoy, tope: DAILY_CAP_USD };
  } catch (e) {
    logError("rita-v2/ia", "Error verificando el presupuesto diario de IA", e);
    return { ok: true, gastoHoy: 0, tope: DAILY_CAP_USD };
  }
}

export type Bloque = { type: string; [k: string]: unknown };
export type Mensaje = { role: string; content: string | Bloque[] };
export type Evidencia = { herramienta: string; input: unknown; resultado: unknown };

const PALABRAS_CRITICAS =
  /accidente|herid[oa]|sangr|primeros auxilios|choqu|me ca[ií]|atropell|ambulanc|emergencia|bomberos|polic[ií]a|codigo de transito|comparendo|multa|infracci[oó]n|abogado|demanda|denuncia|responsabilidad civil|pico y placa|restricci[oó]n vehicular/i;

function esTemaCriticoPorTexto(messages: Mensaje[]): boolean {
  const ultimo = messages[messages.length - 1];
  if (!ultimo || typeof ultimo.content !== "string") return false;
  return PALABRAS_CRITICAS.test(ultimo.content);
}

function extraerPreguntaRider(messages: Mensaje[]): string {
  const ultimo = messages[messages.length - 1];
  if (!ultimo) return "";
  return typeof ultimo.content === "string" ? ultimo.content : "";
}

// ─── Motor Claude ────────────────────────────────────────────────
async function llamarClaudeRaw(system: string, messages: Mensaje[]): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1024, temperature: 0.1, system, tools: TOOL_SCHEMAS, messages }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return await res.json();
}

function normalizarClaude(data: Record<string, unknown>) {
  const usage = (data.usage ?? {}) as Record<string, unknown>;
  return {
    bloques: (data.content ?? []) as Bloque[],
    stop_reason: String(data.stop_reason ?? "end_turn"),
    usage: { input_tokens: Number(usage.input_tokens ?? 0), output_tokens: Number(usage.output_tokens ?? 0) },
  };
}

// ─── Motor OpenAI ────────────────────────────────────────────────
function schemasOpenAI() {
  return TOOL_SCHEMAS.map(t => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

function mensajesAOpenAI(system: string, messages: Mensaje[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      const texto = m.content.filter(b => b.type === "text").map(b => String(b.text ?? "")).join("\n");
      const toolCalls = m.content.filter(b => b.type === "tool_use").map(b => ({
        id: String(b.id),
        type: "function",
        function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) },
      }));
      const msg: Record<string, unknown> = { role: "assistant", content: texto || null };
      if (toolCalls.length) msg.tool_calls = toolCalls;
      out.push(msg);
      continue;
    }
    for (const b of m.content) {
      if (b.type === "tool_result") {
        out.push({ role: "tool", tool_call_id: String(b.tool_use_id), content: String(b.content ?? "") });
      }
    }
  }
  return out;
}

async function llamarOpenAIRaw(system: string, messages: Mensaje[]): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: mensajesAOpenAI(system, messages),
      tools: schemasOpenAI(),
      tool_choice: "auto",
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return await res.json();
}

function normalizarOpenAI(data: Record<string, unknown>) {
  const choice = ((data.choices as Record<string, unknown>[]) ?? [])[0];
  const msg = (choice?.message ?? {}) as Record<string, unknown>;
  const bloques: Bloque[] = [];
  const toolCalls = (msg.tool_calls ?? []) as Record<string, unknown>[];
  // Solo incluir texto cuando no hay tool_calls; los mensajes intermedios
  // ("voy a consultar", "revisando datos") no deben llegar al rider.
  if (msg.content && toolCalls.length === 0) bloques.push({ type: "text", text: String(msg.content) });
  for (const tc of toolCalls) {
    const fn = (tc.function ?? {}) as Record<string, unknown>;
    let input: Record<string, unknown> = {};
    try { input = JSON.parse(String(fn.arguments ?? "{}")); } catch { /* vacio */ }
    bloques.push({ type: "tool_use", id: String(tc.id), name: String(fn.name), input });
  }
  const usage = (data.usage ?? {}) as Record<string, unknown>;
  return {
    bloques,
    stop_reason: toolCalls.length ? "tool_use" : "end_turn",
    usage: { input_tokens: Number(usage.prompt_tokens ?? 0), output_tokens: Number(usage.completion_tokens ?? 0) },
  };
}

function textoDe(bloques: Bloque[]): string {
  return bloques.filter(b => b.type === "text").map(b => String(b.text ?? "")).join("\n").trim();
}

// ─── Loop de tool-use generico ───────────────────────────────────
async function ejecutarConversacion(
  proveedor: "claude" | "openai",
  system: string,
  messagesIniciales: Mensaje[],
  phone: string,
  tipoAuditoria: "normal" | "fallback",
): Promise<{ texto: string; herramientasUsadas: string[]; urlsHerramientas: string[]; evidencia: Evidencia[] }> {
  const messages: Mensaje[] = [...messagesIniciales];
  const herramientasUsadas: string[] = [];
  const urlsHerramientas = new Set<string>();
  const evidencia: Evidencia[] = [];
  let tokensEntrada = 0;
  let tokensSalida = 0;
  const modelo = proveedor === "claude" ? CLAUDE_MODEL : OPENAI_MODEL;

  for (let ronda = 0; ronda < MAX_TOOL_ROUNDS; ronda++) {
    const dataCruda = proveedor === "claude"
      ? await llamarClaudeRaw(system, messages)
      : await llamarOpenAIRaw(system, messages);
    const { bloques, stop_reason, usage } = proveedor === "claude"
      ? normalizarClaude(dataCruda)
      : normalizarOpenAI(dataCruda);
    tokensEntrada += usage.input_tokens;
    tokensSalida += usage.output_tokens;

    if (stop_reason !== "tool_use") {
      await registrarUsoIA(phone, proveedor, modelo, tokensEntrada, tokensSalida, tipoAuditoria, null);
      return { texto: textoDe(bloques), herramientasUsadas, urlsHerramientas: [...urlsHerramientas], evidencia };
    }

    const llamadas = bloques.filter(b => b.type === "tool_use");
    llamadas.forEach(b => herramientasUsadas.push(String(b.name)));
    messages.push({ role: "assistant", content: bloques });

    const resultados = await Promise.all(
      llamadas.map(async (llamada) => {
        const resultado = await ejecutarHerramienta(String(llamada.name), (llamada.input ?? {}) as Record<string, never>, phone);
        evidencia.push({ herramienta: String(llamada.name), input: llamada.input ?? {}, resultado });
        return { type: "tool_result", tool_use_id: String(llamada.id), content: resultado };
      }),
    );
    for (const r of resultados) {
      for (const url of extraerUrls(r.content)) urlsHerramientas.add(url);
    }
    messages.push({ role: "user", content: resultados as Bloque[] });
  }

  await registrarUsoIA(phone, proveedor, modelo, tokensEntrada, tokensSalida, tipoAuditoria, null);
  return { texto: "", herramientasUsadas, urlsHerramientas: [...urlsHerramientas], evidencia };
}

// ─── Auditor (Claude Haiku) ───────────────────────────────────────
// Revisa la respuesta contra la EVIDENCIA REAL de las herramientas que se
// consultaron -- no contra un segundo borrador de otro modelo. Reemplaza
// el mecanismo anterior de "dos borradores, elige el mejor" (comparaba
// estilo/completitud, no hechos) por una verificacion puntual: ¿la
// respuesta afirma algo que esa evidencia no respalda?
// Exportado para poder probarlo directamente (ver ia.test.ts, TEST 10 de la
// especificacion de Rita orquestador: "la respuesta de OpenAI contiene un
// dato falso/no sustentado -- Claude debe detectarlo").
export type Auditoria = {
  valid: boolean;
  issues: { type: string; description: string }[];
  severity: "none" | "low" | "medium" | "high";
  requires_revision: boolean;
};

const MAX_REVISIONES_AUDITOR = 2;

const SIN_PROBLEMAS: Auditoria = { valid: true, issues: [], severity: "none", requires_revision: false };

export async function auditarRespuesta(
  pregunta: string,
  respuesta: string,
  evidencia: Evidencia[],
  phone: string,
): Promise<Auditoria> {
  if (!ANTHROPIC_KEY) return SIN_PROBLEMAS;

  const system = `Sos el auditor de calidad de Rita, la asistente motera de Ridera. Te paso la
pregunta del rider, la respuesta que Rita esta a punto de enviarle, y la evidencia real que
devolvieron las herramientas consultadas (vacia si no se uso ninguna).

Tu unico trabajo es detectar si la respuesta afirma algo que la evidencia NO respalda, o si
presenta un dato con MAS confianza de la que realmente tiene. Cada dato cae en uno de estos
niveles -- tu trabajo es que la respuesta no confunda uno con otro:
  VERIFICADO POR RIDERA (vino de una herramienta de la base de Ridera) < VERIFICADO EXTERNO
  (vino de una herramienta externa real, ej. clima/vias/Wikipedia) < CALCULADO (Rita lo derivo
  ella misma de un dato verificado) < CONOCIMIENTO GENERAL (memoria del modelo, sin herramienta)
  < DATO DEL RIDER (lo dijo el mismo en la conversacion) -- y DESCONOCIDO cuando no hay nada de
  lo anterior.

Revisa especificamente:
- ¿Inventa un dato (km, precio, horario, clima, estado de una via) que no aparece en la evidencia?
- ¿Presenta un calculo (ej. ida y vuelta) como si fuera un dato de Ridera, en vez de decir que lo calculo ella misma?
- ¿Afirma haber consultado algo (clima, estado de vias, trafico) sin evidencia de esa herramienta?
- ¿Presenta conocimiento general suyo (historia, cultura, "es conocido por...") como si una herramienta lo hubiera verificado?
- ¿Oculta que un resultado vino marcado como debil/no verificado (ej. "verificado": false en la evidencia) y lo presenta como confirmado?
- ¿Recomienda un destino que la evidencia marca como excluido explicitamente por el rider?
- ¿Contradice lo que dice la evidencia?
- ¿Usa "actualmente", "hoy", "ahora" para un dato que cambia con el tiempo sin evidencia fresca?
- ¿Convierte la descripcion de una foto o un documento (marcada en la pregunta como "[Foto adjunta
  -- descripcion generada por IA de vision (Gemini)...]" o "[Documento adjunto (PDF) -- lectura
  generada por IA de vision (Gemini)...]") en un diagnostico mecanico definitivo o en un dato
  verificado por Ridera (ej. una fecha de vencimiento o placa que Gemini marco como borrosa,
  presentada como si se hubiera leido claramente), en vez de dejarla como lo que parece verse o
  leerse en el archivo?

NO marques error por tono, estilo, brevedad, ni conocimiento general de cultura motera que la
respuesta ya presenta como tal (sin fingir que vino de una herramienta).

Responde SOLO con JSON, nada de texto antes ni despues, con esta forma exacta:
{"valid": true, "issues": [], "severity": "none", "requires_revision": false}
o si encontras problemas:
{"valid": false, "issues": [{"type": "unsupported_claim", "description": "..."}], "severity": "low", "requires_revision": true}

severity es "low", "medium" o "high". Marca requires_revision true SOLO si el problema le puede
costar algo real al rider (una multa, un viaje mal planeado, una decision de seguridad) -- no por
imperfecciones de redaccion.`;

  const contenido = `PREGUNTA DEL RIDER:\n${pregunta}\n\nRESPUESTA DE RITA:\n${respuesta}\n\nEVIDENCIA DE HERRAMIENTAS:\n${
    evidencia.length ? JSON.stringify(evidencia).slice(0, 6000) : "(ninguna herramienta fue consultada para esta respuesta)"
  }`;

  try {
    const dataCruda = await llamarClaudeRaw(system, [{ role: "user", content: contenido }]);
    const { bloques, usage } = normalizarClaude(dataCruda);
    await registrarUsoIA(phone, "claude", CLAUDE_MODEL, usage.input_tokens, usage.output_tokens, "auditor", null);

    const texto = textoDe(bloques);
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) return SIN_PROBLEMAS;
    const parsed = JSON.parse(match[0]);
    return {
      valid: parsed.valid !== false,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      severity: ["low", "medium", "high"].includes(parsed.severity) ? parsed.severity : "none",
      requires_revision: Boolean(parsed.requires_revision),
    };
  } catch (e) {
    logError("rita-v2/ia", "Auditor fallo, se deja pasar la respuesta sin auditar", e, { telefono: phone });
    return SIN_PROBLEMAS;
  }
}

// Le pide al mismo proveedor que genero la respuesta que la corrija segun
// lo que encontro el auditor, usando SOLO la evidencia que ya existia --
// nunca inventando una nueva.
async function corregirConAuditoria(
  proveedor: "claude" | "openai",
  system: string,
  messagesOriginales: Mensaje[],
  respuestaPrevia: string,
  evidencia: Evidencia[],
  issues: { type: string; description: string }[],
  phone: string,
): Promise<string> {
  const instruccion = `Tu respuesta anterior fue:\n"""${respuestaPrevia}"""\n\nEsta es la evidencia real que tenias disponible de las herramientas:\n${
    evidencia.length ? JSON.stringify(evidencia).slice(0, 6000) : "(ninguna)"
  }\n\nUn auditor encontro estos problemas en tu respuesta -- corrigela usando SOLO esta evidencia, sin inventar nada nuevo. No menciones que hubo una auditoria, entrega directamente la respuesta corregida lista para el rider:\n${
    issues.map(i => `- ${i.description}`).join("\n")
  }`;
  const messages: Mensaje[] = [...messagesOriginales, { role: "user", content: instruccion }];
  try {
    const dataCruda = proveedor === "claude" ? await llamarClaudeRaw(system, messages) : await llamarOpenAIRaw(system, messages);
    const { bloques, usage } = proveedor === "claude" ? normalizarClaude(dataCruda) : normalizarOpenAI(dataCruda);
    await registrarUsoIA(phone, proveedor, proveedor === "claude" ? CLAUDE_MODEL : OPENAI_MODEL, usage.input_tokens, usage.output_tokens, "correccion", null);
    const texto = textoDe(bloques);
    return texto || respuestaPrevia;
  } catch (e) {
    logError("rita-v2/ia", "Correccion post-auditoria fallo, se deja la respuesta original", e, { telefono: phone });
    return respuestaPrevia;
  }
}

// ─── Punto de entrada del orquestador ───────────────────────────
export async function responderConOrquestador(
  system: string,
  messages: Mensaje[],
  phone: string,
): Promise<string> {
  let resultado: { texto: string; herramientasUsadas: string[]; urlsHerramientas: string[]; evidencia: Evidencia[] };
  let proveedorPrimario: "claude" | "openai" = "openai";

  // 1) Intento primario: OpenAI (gpt-4o-mini con Function Calling).
  try {
    if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY no configurada");
    resultado = await ejecutarConversacion("openai", system, messages, phone, "normal");
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    logError("rita-v2/ia", "OpenAI fallo en el orquestador, cae a Claude", e, { telefono: phone });
    try {
      await supabase.from("rita_acciones_log").insert({
        telefono: phone,
        herramienta: "orquestador_openai_fallo",
        parametros: {},
        ok: false,
        error: mensaje.slice(0, 500),
      });
    } catch { /* no interrumpe el flujo por un fallo de auditoria */ }
    if (!ANTHROPIC_KEY) {
      throw new Error("OpenAI fallo y no hay ANTHROPIC_API_KEY configurada para el fallback");
    }
    proveedorPrimario = "claude";
    resultado = await ejecutarConversacion("claude", system, messages, phone, "fallback");
  }

  if (!resultado.texto) return "";

  // Las URLs que de verdad devolvieron las herramientas esta ronda son las
  // unicas que la respuesta final puede citar tal cual; cualquier otra URL
  // se reemplaza por el dominio raiz antes de que salga por WhatsApp.
  const urlsConfirmadas = new Set(resultado.urlsHerramientas);

  // 2) Auditoria: solo cuando hay evidencia real que auditar (se uso al
  // menos una herramienta) o el tema es sensible por texto (seguridad,
  // legal, multas) aunque no haya llamado ninguna -- ahi el riesgo es que
  // responda de memoria algo que deberia decir "no lo se". Saludos y charla
  // general sin herramientas ni tema critico no pagan el costo/latencia
  // extra: no hay nada que auditar.
  const necesitaAuditoria = resultado.herramientasUsadas.length > 0 || esTemaCriticoPorTexto(messages);
  if (!necesitaAuditoria || !ANTHROPIC_KEY) return sanitizarUrls(resultado.texto, urlsConfirmadas);

  let textoFinal = resultado.texto;
  try {
    for (let intento = 0; intento < MAX_REVISIONES_AUDITOR; intento++) {
      const auditoria = await auditarRespuesta(extraerPreguntaRider(messages), textoFinal, resultado.evidencia, phone);
      if (!auditoria.requires_revision) break;
      logWarn("rita-v2/ia", "Auditor encontro problemas, corrigiendo", { telefono: phone, issues: auditoria.issues });
      textoFinal = await corregirConAuditoria(
        proveedorPrimario, system, messages, textoFinal, resultado.evidencia, auditoria.issues, phone,
      );
    }
  } catch (e) {
    logError("rita-v2/ia", "Auditoria omitida por fallo", e, { telefono: phone });
  }

  return sanitizarUrls(textoFinal, urlsConfirmadas);
}
