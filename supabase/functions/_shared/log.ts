// ─────────────────────────────────────────────────────────────────
// Logging estructurado y unificado para las edge functions de Ridera.
//
// Antes de esto, cada funcion (y cada archivo dentro de rita-v2)
// inventaba su propio console.log/console.error como string suelto
// ("Rita v2 error:", e) -- no hay dos funciones con el mismo formato,
// y varias (alerta-pico-placa, rita-recordatorios, hoja-vida,
// wp-content-sync) tenian catches que no dejaban rastro en ningun
// lado, ni siquiera en consola. Eso fue justo el tipo de blind spot
// que hizo dificil diagnosticar la falla de los recordatorios de pico
// y placa: un fallo real no se distinguia de que simplemente no habia
// pasado nada.
//
// La solucion NO es una tabla nueva ni un servicio nuevo: Supabase ya
// captura el stdout/stderr de cada funcion como logs consultables
// (query_logs / Logflare), y cuando la linea es JSON valido la indexa
// con sus campos accesibles (log_attributes['campo']) en vez de solo
// como texto plano. El unico cambio real es que TODAS las funciones
// escriban esa unica linea JSON con la misma forma, para poder
// filtrar/correlacionar entre funciones sin adivinar el formato de
// cada una.
//
// No lanza nunca: un logger no puede ser la causa de que algo mas
// falle. Y no hace ninguna llamada a red ni a la base -- es solo
// console.log/error, para no agregar otro punto de falla ni latencia.
// ─────────────────────────────────────────────────────────────────

export type NivelLog = "info" | "warn" | "error";

export interface DetalleLog {
  telefono?: string;
  [campo: string]: unknown;
}

function emitir(nivel: NivelLog, funcion: string, mensaje: string, detalle?: DetalleLog) {
  const linea = { ts: new Date().toISOString(), nivel, funcion, mensaje, ...detalle };
  let texto: string;
  try {
    texto = JSON.stringify(linea);
  } catch {
    // Por si detalle trae algo no serializable (ej. una referencia
    // circular) -- no perder el mensaje principal por eso.
    texto = JSON.stringify({ ts: linea.ts, nivel, funcion, mensaje });
  }
  if (nivel === "error") console.error(texto);
  else if (nivel === "warn") console.warn(texto);
  else console.log(texto);
}

export function log(funcion: string, mensaje: string, detalle?: DetalleLog) {
  emitir("info", funcion, mensaje, detalle);
}

export function logWarn(funcion: string, mensaje: string, detalle?: DetalleLog) {
  emitir("warn", funcion, mensaje, detalle);
}

// error puede ser cualquier cosa: un throw en JS no esta tipado a Error, y
// los errores que devuelve supabase-js (ej. el "error" de una query) son
// objetos planos con .message, no instancias de Error -- String(objeto)
// los convertiria en el inutil "[object Object]". Se normaliza a
// {error, stack} para que quede consultable como campo, no como un objeto
// crudo distinto en cada llamada.
export function logError(funcion: string, mensaje: string, error: unknown, detalle?: DetalleLog) {
  let info: { error: string; stack?: string };
  if (error instanceof Error) {
    info = { error: error.message, stack: error.stack };
  } else if (error && typeof error === "object" && "message" in error) {
    info = { error: String((error as { message: unknown }).message) };
  } else {
    info = { error: String(error) };
  }
  emitir("error", funcion, mensaje, { ...info, ...detalle });
}
