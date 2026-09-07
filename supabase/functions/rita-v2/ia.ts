// ─── Punto de entrada del orquestador ───────────────────────────
export async function responderConOrquestador(
  system: string,
  messages: Mensaje[],
  phone: string,
): Promise<string> {
  let resultado: { texto: string; herramientasUsadas: string[] };
  let proveedorPrimario: "claude" | "openai" = "openai";

  // 1) Intento primario: OpenAI (gpt-4o-mini)
  try {
    if (!OPENAI_KEY) throw new Error("No hay OPENAI_API_KEY configurada");
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
    } catch { /* auditoria */ }

    if (!ANTHROPIC_KEY) {
      throw new Error("OpenAI fallo y no hay ANTHROPIC_API_KEY configurada para el fallback");
    }
    proveedorPrimario = "claude";
    resultado = await ejecutarConversacion("claude", system, messages, phone, "fallback");
  }

  // Si no hay texto o se agotaron rondas, devolvemos directo lo obtenido
  if (!resultado.texto) return "";

  const esCritico = resultado.herramientasUsadas.some(h => HERRAMIENTAS_CRITICAS.has(h))
    || esTemaCriticoPorTexto(messages);

  // Si es tema crítico pero Claude está sin saldo, devolvemos el resultado de OpenAI directo
  if (!esCritico || !ANTHROPIC_KEY) return resultado.texto;

  // 2) Comparación en temas críticos (opcional)
  try {
    const segundo = await ejecutarConversacion("claude", system, messages, phone, "comparacion");
    if (!segundo.texto) return resultado.texto;

    const revision = await revisarYFundir(resultado.texto, segundo.texto, phone);
    return revision.texto || resultado.texto;
  } catch (e) {
    console.error("Comparacion con Claude omitida por saldo/fallo:", e);
    return resultado.texto;
  }
}
