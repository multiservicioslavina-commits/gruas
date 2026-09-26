// Tests de la tabla de rotacion de pico y placa. Modulo puro: corre sin
// ninguna variable de entorno.
//
//   deno test supabase/functions/_shared/pico_placa.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { diaParaDigito, digitosPorDia, hoyEnBogota, vigenciaRotacion } from "./pico_placa.ts";

const PRIMER_SEMESTRE = { 1: [1, 7], 2: [0, 3], 3: [4, 6], 4: [5, 9], 5: [2, 8] };
const SEGUNDO_SEMESTRE = { 1: [5, 8], 2: [1, 4], 3: [0, 2], 4: [3, 6], 5: [7, 9] };

Deno.test("digitosPorDia() usa la rotacion del primer semestre antes del 3 de agosto de 2026", () => {
  assertEquals(digitosPorDia(new Date("2026-08-02T23:59:00-05:00")), PRIMER_SEMESTRE);
});

Deno.test("digitosPorDia() cambia justo en el corte del 3 de agosto de 2026", () => {
  assertEquals(digitosPorDia(new Date("2026-08-03T00:00:00-05:00")), SEGUNDO_SEMESTRE);
});

Deno.test("la rotacion cubre los 10 digitos, una sola vez cada uno", () => {
  for (const tabla of [PRIMER_SEMESTRE, SEGUNDO_SEMESTRE]) {
    const todos = Object.values(tabla).flat().sort();
    assertEquals(todos, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
});

Deno.test("diaParaDigito(): el 7 es viernes en el segundo semestre (caso real de la prueba del 25 de septiembre)", () => {
  const viernes25 = new Date("2026-09-25T15:00:00-05:00");
  assertEquals(diaParaDigito(7, viernes25), "viernes");
  assertEquals(diaParaDigito(9, viernes25), "viernes");
  assertEquals(diaParaDigito(5, viernes25), "lunes");
});

Deno.test("hoyEnBogota() usa la hora de Colombia, no UTC", () => {
  // 3:30 a.m. UTC del sabado 26 = 10:30 p.m. del viernes 25 en Bogota.
  assertEquals(hoyEnBogota(new Date("2026-09-26T03:30:00Z")), { fecha: "2026-09-25", weekday: 5 });
});

Deno.test("vigenciaRotacion() dice de que rotacion sale el dato", () => {
  assertEquals(
    vigenciaRotacion(new Date("2026-09-25T12:00:00-05:00")),
    "Rotacion del segundo semestre de 2026 (vigente desde el 3 de agosto de 2026)",
  );
});
