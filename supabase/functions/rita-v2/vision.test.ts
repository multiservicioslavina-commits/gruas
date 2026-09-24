// ─────────────────────────────────────────────────────────────────
// Test de mensajeDesdeFoto(): la parte de vision.ts que no toca red
// ni Supabase, asi que corre sin ninguna variable de entorno (a
// diferencia de casi todo el resto de rita-v2, que crea su cliente de
// Supabase al importarse). No se pudo ejecutar en este sandbox por
// falta de Deno CLI; correr con:
//
//   deno test --allow-env supabase/functions/rita-v2/vision.test.ts
//
// Lo que valida es lo que realmente importa aca: que la descripcion de
// Gemini SIEMPRE quede marcada como interpretacion de IA, nunca se
// cuele como si fueran las palabras literales del rider -- ese marcador
// es lo que buildSystemPrompt (index.ts) y el auditor (ia.ts) usan para
// no tratarla como un hecho verificado.
// ─────────────────────────────────────────────────────────────────

import { assertEquals, assertMatch, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mensajeDesdeFoto } from "./vision.ts";

Deno.test("mensajeDesdeFoto() sin caption solo trae el marcador de descripcion de IA", () => {
  const msg = mensajeDesdeFoto("Se ve una moto con la cadena floja y algo de oxido.");
  assertMatch(msg, /^\[Foto adjunta -- descripcion generada por IA de vision \(Gemini\)/);
  assertStringIncludes(msg, "cadena floja");
});

Deno.test("mensajeDesdeFoto() con caption la antepone, separada del marcador", () => {
  const msg = mensajeDesdeFoto("Documento con fecha de vencimiento 2026-11-03.", "mira mi soat, ya vence?");
  const partes = msg.split("\n\n");
  assertEquals(partes[0], "mira mi soat, ya vence?");
  assertMatch(partes[1], /^\[Foto adjunta -- descripcion generada por IA de vision \(Gemini\)/);
});

Deno.test("mensajeDesdeFoto() nunca omite la advertencia 'puede tener errores'", () => {
  const msg = mensajeDesdeFoto("cualquier descripcion");
  assertStringIncludes(msg, "puede tener errores");
});
