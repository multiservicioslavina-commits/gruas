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
//   3. COMPARACION: cuando la respuesta primaria uso una herramienta
//      critica (emergencia, legal, pico y placa), se genera una
//      segunda respuesta con Claude y un revisor elige o funde la
//      mejor antes de contestar.
//   4. Cada llamada queda auditada en rita_ai_logs: proveedor, modelo,
//      tokens, costo estimado, tipo de consulta y quien gano la
//      comparacion (cuando aplica).
//
// Ambas claves (ANTHROPIC_API_KEY, OPENAI_API_KEY) viven solo en los
// secretos de Supabase; nunca llegan al cliente/APK.
// ─────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { TOOL_SCHEMAS, ejecutarHerramienta } from "./tools.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
const OPENAI_KEY = (Deno.env.get("OPENAI_API_KEY") ?? "").trim();

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const OPENAI_MODEL = "gpt-4o-mini";
const MAX_TOOL_ROUNDS = 4;

const supabase: SupabaseClient = createClient(SB_URL, SB_KEY);

// Precios aproximados por 1M tokens (USD). Son una referencia para
// comparar costo relativo entre proveedores, AJUSTAR a las tarifas
// publicadas vigentes antes de usarlos para facturacion real.
const PRECIOS: Record<string, { entrada: number; salida: number }> = {
  claude: { entrada: 1.0, salida: 5.0 },
  openai: { entrada: 0.15, salida: 0.6 },
};

function estimarCosto(proveedor: "claude" | "openai", tokensEntrada: number, tokensSalida: number): number {
  const p = PRECIOS[proveedor];
  return (tokensEntrada / 1_000_000) * p.entrada + (tokensSalida / 1_000_000) * p.salida;
}

// ─── Tope de gasto diario (Paso 3) ─────────────────────────────
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
    console.error("Error verificando presupuesto:", e);
    return { ok: true, gastoHoy: 0, tope: DAILY_CAP_USD };
  }
}

// Herramientas donde un error le cuesta caro al rider (multa, salud,
// plata): si la respuesta primaria las uso, se dispara la comparacion.
const HERRAMIENTAS_CRITICAS = new Set([
  "primeros_auxilios",
  "emergencia_telefonos",
  "asesoria_legal",
  "codigo_transito",
  "consultar_pico_placa",
]);

export type Bloque = { type: string; [k: string]: unknown };
export type Mensaje = { role: string; content: string | Bloque[] };

// Respaldo de HERRAMIENTAS_CRITICAS: si el motor que respondio no llamo
// ninguna herramienta (p.ej. OpenAI en un fallback contesta de memoria
// sin consultar nada), esto igual detecta el tema por palabras clave en
// el mensaje del rider para no perder la comparacion en casos criticos.
const PALABRAS_CRITICAS =
  /accidente|herid[oa]|sangr|primeros auxilios|choqu|me ca[ií]|atropell|ambulanc|emergencia|bomberos|polic[ií]a|codigo de transito|comparendo|multa|infracci[oó]n|abogado|demanda|denuncia|responsabilidad civil|pico y placa|restricci[oó]n vehicular/i;

function esTemaCriticoPorTexto(messages: Mensaje[]): boolean {
  const ultimo = messages[messages.length - 1];
  if (!ultimo || typeof ultimo.content !== "string") return false;
  return PALABRAS_CRITICAS.test(ultimo.content);
}

async function auditarIA(
  phone: string,
  proveedor: string,
  modelo: string,
  tokensEntrada: number,
  tokensSalida: number,
  tipo: "normal" | "fallback" | "comparacion",
  ganoComparacion: string | null,
) {
  try {
    await supabase.from("rita_ai_logs").insert({
      telefono: phone,
      proveedor,
      modelo,
      tokens_entrada: tokensEntrada,
      tokens_salida: tokensSalida,
      costo_usd: estimarCosto(proveedor as "claude" | "openai", tokensEntrada, tokensSalida),
      tipo_consulta: tipo,
      gano_comparacion: ganoComparacion,
    });
  } catch (e) {
    console.error("No se pudo auditar IA:", e);
  }
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
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1024, system, tools: TOOL_SCHEMAS, messages }),
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

// ─── Motor OpenAI (adaptado al mismo formato de bloques que Claude) ─
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
    // Mensajes "user" con tool_result: en OpenAI cada resultado es su
    // propio mensaje de rol "tool".
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
    try { input = JSON.parse(String(fn.arguments ?? "{}")); } catch { /* deja vacio */ }
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

// ─── Loop de tool-use generico: funciona con cualquier proveedor ───
async function ejecutarConversacion(
  proveedor: "claude" | "openai",
  system: string,
  messagesIniciales: Mensaje[],
  phone: string,
  tipoAuditoria: "normal" | "fallback" | "comparacion",
): Promise<{ texto: string; herramientasUsadas: string[] }> {
  const messages: Mensaje[] = [...messagesIniciales];
  const herramientasUsadas: string[] = [];
  let huboHerramientas = false;
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
      await auditarIA(phone, proveedor, modelo, tokensEntrada, tokensSalida, tipoAuditoria, null);
      return { texto: textoDe(bloques), herramientasUsadas };
    }

    huboHerramientas = true;
    const llamadas = bloques.filter(b => b.type === "tool_use");
    llamadas.forEach(b => herramientasUsadas.push(String(b.name)));
    messages.push({ role: "assistant", content: bloques });

    const resultados = await Promise.all(
      llamadas.map(async (llamada) => ({
        type: "tool_result",
        tool_use_id: String(llamada.id),
        content: await ejecutarHerramienta(String(llamada.name), (llamada.input ?? {}) as Record<string, never>, phone),
      })),
    );
    messages.push({ role: "user", content: resultados as Bloque[] });
  }

  await auditarIA(phone, proveedor, modelo, tokensEntrada, tokensSalida, tipoAuditoria, null);
  return { texto: "", herramientasUsadas };
}

// ─── Revisor: elige o funde las dos respuestas en temas criticos ───
async function revisarYFundir(
  borradorA: string,
  borradorB: string,
  phone: string,
): Promise<{ texto: string; ganador: string | null }> {
  const system = `Sos un revisor tecnico de Rita, asistente motera de Ridera. Te paso dos borradores de
respuesta para el mismo mensaje de un rider sobre un tema critico (seguridad, salud, legal
o multas). Elegi el mas correcto y completo, o fundi lo mejor de ambos en una sola respuesta.

Antes de la respuesta final, en la primera linea escribi exactamente una de estas opciones:
"GANADOR: A", "GANADOR: B" o "GANADOR: FUSION". Despues deja una linea en blanco y escribi
SOLO la respuesta final para el rider, en el mismo tono de WhatsApp corto y con emojis si
corresponde. No menciones que hubo dos borradores ni que sos un revisor.`;

  const messages: Mensaje[] = [
    { role: "user", content: `Borrador A:\n${borradorA}\n\nBorrador B:\n${borradorB}` },
  ];

  const dataCruda = await llamarClaudeRaw(system, messages);
  const { bloques, usage } = normalizarClaude(dataCruda);
  await auditarIA(phone, "claude", CLAUDE_MODEL, usage.input_tokens, usage.output_tokens, "comparacion", null);

  const texto = textoDe(bloques);
  const match = texto.match(/^GANADOR:\s*(A|B|FUSION)\s*\n+([\s\S]*)$/i);
  if (!match) return { texto: texto || borradorA, ganador: null };
  return { texto: match[2].trim(), ganador: match[1].toUpperCase() };
}

// ─── Punto de entrada del orquestador ───────────────────────────
// Recibe el system prompt ya armado y el historial + mensaje actual.
// Devuelve el texto final sin que el llamador sepa que proveedor
// respondio ni si hubo comparacion.
export async function responderConOrquestador(
  system: string,
  messages: Mensaje[],
  phone: string,
): Promise<string> {
  let resultado: { texto: string; herramientasUsadas: string[] };
  let proveedorPrimario: "claude" | "openai" = "openai";

  // 1) Intento primario: OpenAI (gpt-4o-mini con Function Calling).
  try {
    if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY no configurada");
    resultado = await ejecutarConversacion("openai", system, messages, phone, "normal");
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error("OpenAI fallo en el orquestador, cae a Claude:", mensaje);
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

  const esCritico = resultado.herramientasUsadas.some(h => HERRAMIENTAS_CRITICAS.has(h))
    || esTemaCriticoPorTexto(messages);
  // Para comparacion critica se necesita Claude como segundo revisor
  if (!esCritico || !ANTHROPIC_KEY) return resultado.texto;

  // 2) Comparacion: solo para temas criticos. Generamos una segunda
  // respuesta con Claude y dejamos que un revisor elija o funda la
  // mejor antes de contestar.
  try {
    const proveedorSecundario: "claude" | "openai" = proveedorPrimario === "openai" ? "claude" : "openai";
    const segundo = await ejecutarConversacion(proveedorSecundario, system, messages, phone, "comparacion");
    if (!segundo.texto) return resultado.texto;

    // borrador A = Claude (para que el revisor (Claude) no se favorezca a si mismo)
    const [borradorA, borradorB] = proveedorSecundario === "claude"
      ? [segundo.texto, resultado.texto]
      : [resultado.texto, segundo.texto];

    const revision = await revisarYFundir(borradorA, borradorB, phone);
    return revision.texto || resultado.texto;
  } catch (e) {
    console.error("Comparacion fallo, uso la respuesta primaria:", e);
    return resultado.texto;
  }
}
