// ─────────────────────────────────────────────────────────────────
// Test de estimarCosto(): valida que el precio por proveedor (USD por
// millon de tokens) siga siendo el que se documento al agregarlo, para
// que un typo futuro en PRECIOS no infle o desinfle silenciosamente el
// costo reportado ni el tope de gasto diario.
//
// uso_ia.ts crea su cliente de Supabase al importarse (mismo patron que
// tools.ts/ia.ts/index.ts), asi que este test requiere SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY para poder importar el modulo, aunque
// estimarCosto() en si es matematica pura sin ninguna llamada a la base.
// No se pudo ejecutar en este sandbox por falta de Deno CLI; correr con:
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno test --allow-net --allow-env supabase/functions/rita-v2/uso_ia.test.ts
// ─────────────────────────────────────────────────────────────────

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { estimarCosto } from "./uso_ia.ts";

const tieneCredenciales = Boolean(Deno.env.get("SUPABASE_URL")) &&
  Boolean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

Deno.test({
  name: "estimarCosto() calcula claude a $1.00/$5.00 por millon de tokens (entrada/salida)",
  ignore: !tieneCredenciales,
  fn() {
    assertEquals(estimarCosto("claude", 1_000_000, 0), 1.0);
    assertEquals(estimarCosto("claude", 0, 1_000_000), 5.0);
  },
});

Deno.test({
  name: "estimarCosto() calcula openai a $0.15/$0.60 por millon de tokens (entrada/salida)",
  ignore: !tieneCredenciales,
  fn() {
    assertEquals(estimarCosto("openai", 1_000_000, 0), 0.15);
    assertEquals(estimarCosto("openai", 0, 1_000_000), 0.6);
  },
});

Deno.test({
  name: "estimarCosto() calcula gemini a $0.30/$2.50 por millon de tokens (entrada/salida)",
  ignore: !tieneCredenciales,
  fn() {
    assertEquals(estimarCosto("gemini", 1_000_000, 0), 0.3);
    assertEquals(estimarCosto("gemini", 0, 1_000_000), 2.5);
  },
});

Deno.test({
  name: "estimarCosto() combina entrada y salida correctamente",
  ignore: !tieneCredenciales,
  fn() {
    // 500 tokens de entrada + 200 de salida en gemini: despreciable pero exacto.
    const costo = estimarCosto("gemini", 500, 200);
    assertEquals(costo, (500 / 1_000_000) * 0.3 + (200 / 1_000_000) * 2.5);
  },
});
