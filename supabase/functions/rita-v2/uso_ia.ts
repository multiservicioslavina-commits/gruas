// ─────────────────────────────────────────────────────────────────
// Rita v2 — Registro unificado de uso de IA por proveedor (rita_ai_logs)
//
// Antes de esto, solo OpenAI y Claude (el orquestador conversacional de
// ia.ts) quedaban registrados en rita_ai_logs. Gemini -- buscar_web_verificado
// en tools.ts, describirFoto/describirDocumento en vision.ts -- no registraba
// ningun uso, ni tokens ni costo. Eso eran dos problemas, no uno:
//   1. Ninguna metrica por proveedor mostraba el costo real de Gemini.
//   2. Mas grave: verificarPresupuesto() (el tope de gasto diario de IA)
//      suma exactamente esta tabla -- el gasto de Gemini era invisible
//      tambien para el tope, no solo para las metricas.
//
// Modulo separado, no dentro de ia.ts, porque ia.ts ya importa de tools.ts
// (TOOL_SCHEMAS, ejecutarHerramienta) -- si tools.ts necesitara importar
// de ia.ts para registrar el uso de Gemini, se armaria un ciclo. Este
// archivo no importa de tools.ts, ia.ts ni vision.ts, asi que los tres lo
// pueden usar sin ese problema.
// ─────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { logError } from "../_shared/log.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase: SupabaseClient = createClient(SB_URL, SB_KEY);

export type Proveedor = "claude" | "openai" | "gemini";

// USD por millon de tokens. Verificado en septiembre 2026 (fuentes: precios
// publicados de cada proveedor) -- si cambian, actualizar aca nomas, es el
// unico lugar donde vive el precio de cada uno.
const PRECIOS: Record<Proveedor, { entrada: number; salida: number }> = {
  claude: { entrada: 1.0, salida: 5.0 },
  openai: { entrada: 0.15, salida: 0.6 },
  // gemini-2.5-flash: mismo precio de entrada para texto o imagen inline
  // (buscar_web_verificado, describirFoto, describirDocumento usan todos
  // este modelo). Este modelo tiene fecha de retiro anunciada (16 oct
  // 2026) -- si Rita migra a otro modelo de Gemini, actualizar el precio
  // aca tambien.
  gemini: { entrada: 0.30, salida: 2.50 },
};

export function estimarCosto(proveedor: Proveedor, tokensEntrada: number, tokensSalida: number): number {
  const p = PRECIOS[proveedor];
  return (tokensEntrada / 1_000_000) * p.entrada + (tokensSalida / 1_000_000) * p.salida;
}

// Nunca lanza: registrar el uso no puede ser la causa de que una respuesta
// al rider falle. Mismo criterio que _shared/log.ts.
export async function registrarUsoIA(
  phone: string,
  proveedor: Proveedor,
  modelo: string,
  tokensEntrada: number,
  tokensSalida: number,
  tipo: string,
  ganoComparacion: string | null = null,
): Promise<void> {
  try {
    await supabase.from("rita_ai_logs").insert({
      telefono: phone,
      proveedor,
      modelo,
      tokens_entrada: tokensEntrada,
      tokens_salida: tokensSalida,
      costo_usd: estimarCosto(proveedor, tokensEntrada, tokensSalida),
      tipo_consulta: tipo,
      gano_comparacion: ganoComparacion,
    });
  } catch (e) {
    logError("rita-v2/uso_ia", "No se pudo registrar el uso de IA en rita_ai_logs", e, { telefono: phone, proveedor });
  }
}
