// ─────────────────────────────────────────────────────────────────
// Test de regresion para la rotacion de pico y placa por semestre
// (ver PR que reemplazo la tabla DIGITOS_POR_DIA fija por
// digitosPorDia(fecha), y consultar_pico_placa en rita-v2/tools.ts,
// que usa el mismo corte de fecha).
//
// index.ts crea su cliente de Supabase al importarse (igual que
// tools.ts/ia.ts), asi que aunque digitosPorDia() es una funcion pura,
// el import de este archivo igual requiere SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY -- de lo contrario revienta al cargar el
// modulo, no solo al llamar la funcion. No se pudo ejecutar en este
// sandbox por falta de Deno CLI.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno test --allow-net --allow-env supabase/functions/alerta-pico-placa/index.test.ts
// ─────────────────────────────────────────────────────────────────

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { digitosPorDia } from "./index.ts";

Deno.test("digitosPorDia() usa la rotacion del primer semestre 2026 antes del corte del 3 de agosto", () => {
  const antes = new Date("2026-08-02T23:59:00-05:00");
  assertEquals(digitosPorDia(antes), { 1: [1, 7], 2: [0, 3], 3: [4, 6], 4: [5, 9], 5: [2, 8] });
});

Deno.test("digitosPorDia() cambia a la rotacion del segundo semestre justo en el corte del 3 de agosto 2026", () => {
  const corte = new Date("2026-08-03T00:00:00-05:00");
  assertEquals(digitosPorDia(corte), { 1: [5, 8], 2: [1, 4], 3: [0, 2], 4: [3, 6], 5: [7, 9] });
});

Deno.test("digitosPorDia() sigue en la rotacion del segundo semestre bastante despues del corte", () => {
  const muchoDespues = new Date("2027-01-15T08:00:00-05:00");
  assertEquals(digitosPorDia(muchoDespues), { 1: [5, 8], 2: [1, 4], 3: [0, 2], 4: [3, 6], 5: [7, 9] });
});
