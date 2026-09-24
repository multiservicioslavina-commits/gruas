// ─────────────────────────────────────────────────────────────────
// Tests del logger compartido. A diferencia de todo lo demas en
// supabase/functions/, este modulo no toca Supabase ni ninguna red --
// es el unico archivo de toda la carpeta que se puede probar sin
// ninguna variable de entorno. No se pudo ejecutar en este sandbox
// por falta de Deno CLI; correr con:
//
//   deno test --allow-env supabase/functions/_shared/log.test.ts
// ─────────────────────────────────────────────────────────────────

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { log, logError, logWarn } from "./log.ts";

function capturar(fn: () => void, metodo: "log" | "warn" | "error"): unknown {
  const original = console[metodo];
  let capturado = "";
  // deno-lint-ignore no-explicit-any
  console[metodo] = ((...args: any[]) => { capturado = String(args[0]); }) as typeof console.log;
  try {
    fn();
  } finally {
    console[metodo] = original;
  }
  return JSON.parse(capturado);
}

Deno.test("log() emite JSON valido con nivel info por console.log, con los campos base y el detalle", () => {
  const linea = capturar(
    () => log("rita-v2", "mensaje de prueba", { telefono: "573000000000", extra: 42 }),
    "log",
  ) as Record<string, unknown>;
  assertEquals(linea.nivel, "info");
  assertEquals(linea.funcion, "rita-v2");
  assertEquals(linea.mensaje, "mensaje de prueba");
  assertEquals(linea.telefono, "573000000000");
  assertEquals(linea.extra, 42);
  assertExists(linea.ts);
});

Deno.test("logWarn() usa console.warn, no console.log ni console.error", () => {
  const linea = capturar(() => logWarn("rita-v2", "cuidado"), "warn") as Record<string, unknown>;
  assertEquals(linea.nivel, "warn");
  assertEquals(linea.mensaje, "cuidado");
});

Deno.test("logError() normaliza un Error real a {error, stack}", () => {
  const linea = capturar(
    () => logError("rita-v2", "fallo algo", new Error("boom"), { telefono: "573000000000" }),
    "error",
  ) as Record<string, unknown>;
  assertEquals(linea.nivel, "error");
  assertEquals(linea.error, "boom");
  assertExists(linea.stack);
  assertEquals(linea.telefono, "573000000000");
});

// Este es el caso real que motivo el cambio: los errores que devuelve
// supabase-js (ej. el "error" de una query) son objetos planos con
// .message, NO instancias de Error -- sin este caso, String(error) los
// convertia en el inutil "[object Object]" y se perdia el mensaje real.
Deno.test("logError() extrae .message de un error de supabase-js (objeto plano, no instancia de Error)", () => {
  const errorSupabase = { message: "duplicate key value violates unique constraint", code: "23505", details: null, hint: null };
  const linea = capturar(
    () => logError("rita-v2", "fallo guardando", errorSupabase),
    "error",
  ) as Record<string, unknown>;
  assertEquals(linea.error, "duplicate key value violates unique constraint");
});

Deno.test("logError() no revienta con un valor no serializable en detalle (referencia circular)", () => {
  // deno-lint-ignore no-explicit-any
  const circular: any = { a: 1 };
  circular.self = circular;
  const linea = capturar(
    () => logError("rita-v2", "fallo raro", "algo", { circular }),
    "error",
  ) as Record<string, unknown>;
  assertEquals(linea.nivel, "error");
  assertEquals(linea.funcion, "rita-v2");
  assertEquals(linea.mensaje, "fallo raro");
});
