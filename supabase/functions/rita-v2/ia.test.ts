// ─────────────────────────────────────────────────────────────────
// TEST 10 de la especificacion "Rita AI / Ridera" (seccion 25):
// "La respuesta de OpenAI contiene un dato falso/no sustentado. Claude
// debe detectarlo." Prueba directa de auditarRespuesta(), el auditor
// que reemplazo el viejo mecanismo de "dos borradores". Tambien cubre
// clasificarIntent()/extraerConstraints(), las dos funciones puras
// detras del TurnoIA (seccion 20: intent/constraints/evidence/decision/
// validation) que arma responderConOrquestador en cada respuesta.
//
// Requiere Supabase (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY, porque
// tools.ts se importa transitivamente y crea su cliente al cargar el
// modulo) para poder importar el archivo -- clasificarIntent() y
// extraerConstraints() en si son puras, pero el import falla igual sin
// esas credenciales. Los dos tests de auditarRespuesta() ademas
// necesitan ANTHROPIC_API_KEY real y se saltan solos (ignore) sin ella.
// No se pudieron ejecutar en este sandbox por falta de Deno CLI; ver
// el reporte final.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
//     deno test --allow-net --allow-env supabase/functions/rita-v2/ia.test.ts
// ─────────────────────────────────────────────────────────────────

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { auditarRespuesta, clasificarIntent, extraerConstraints, type Evidencia } from "./ia.ts";

const TELEFONO_PRUEBA = "573000000000";
const tieneAnthropic = Boolean((Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim());
const tieneCredenciales = Boolean(Deno.env.get("SUPABASE_URL")) &&
  Boolean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

Deno.test({
  name: "auditarRespuesta() detecta un dato inventado que la evidencia no respalda",
  ignore: !tieneAnthropic,
  async fn() {
    const evidencia: Evidencia[] = [
      {
        herramienta: "buscar_ruta",
        input: { destino: "Jardín" },
        resultado: JSON.stringify([
          { destino: "Jardín", km: 138, km_ida: 138, duracion: "3-3.5 horas", nota_distancia: "km y duracion son SOLO IDA" },
        ]),
      },
    ];
    // La respuesta inventa un dato (peaje) que no aparece en ninguna
    // evidencia -- justo el caso que el auditor debe atrapar.
    const respuesta = "Jardín queda a 138 km de Medellín (unas 3-3.5 horas) y en el camino hay un peaje de $18.000.";

    const auditoria = await auditarRespuesta(
      "¿A cuántos km queda Jardín?",
      respuesta,
      evidencia,
      TELEFONO_PRUEBA,
    );

    assert(
      auditoria.valid === false || auditoria.issues.length > 0,
      `se esperaba que el auditor marcara el peaje inventado como no sustentado. auditoria=${JSON.stringify(auditoria)}`,
    );
  },
});

Deno.test({
  name: "auditarRespuesta() no marca falsos positivos cuando la respuesta solo repite la evidencia",
  ignore: !tieneAnthropic,
  async fn() {
    const evidencia: Evidencia[] = [
      {
        herramienta: "buscar_ruta",
        input: { destino: "Jardín" },
        resultado: JSON.stringify([
          { destino: "Jardín", km: 138, km_ida: 138, duracion: "3-3.5 horas", nota_distancia: "km y duracion son SOLO IDA" },
        ]),
      },
    ];
    const respuesta = "Jardín queda a 138 km de Medellín (ida), unas 3-3.5 horas de viaje.";

    const auditoria = await auditarRespuesta(
      "¿A cuántos km queda Jardín?",
      respuesta,
      evidencia,
      TELEFONO_PRUEBA,
    );

    assert(
      auditoria.requires_revision === false,
      `una respuesta que solo repite la evidencia no deberia requerir revision. auditoria=${JSON.stringify(auditoria)}`,
    );
  },
});

Deno.test({
  name: "clasificarIntent() prioriza tema_critico sobre cualquier herramienta usada",
  ignore: !tieneCredenciales,
  fn() {
    assertEquals(clasificarIntent(["buscar_ruta"], true), "tema_critico");
  },
});

Deno.test({
  name: "clasificarIntent() reconoce planificacion_ruta, pico_placa, y el resto de casos",
  ignore: !tieneCredenciales,
  fn() {
    assertEquals(clasificarIntent(["planificar_ruta"], false), "planificacion_ruta");
    assertEquals(clasificarIntent(["buscar_ruta"], false), "planificacion_ruta");
    assertEquals(clasificarIntent(["consultar_pico_placa"], false), "pico_placa");
    assertEquals(clasificarIntent(["consultar_clima"], false), "consulta_con_herramientas");
    assertEquals(clasificarIntent([], false), "conversacional");
  },
});

Deno.test({
  name: "extraerConstraints() encuentra restricciones_aplicadas en la evidencia de planificar_ruta",
  ignore: !tieneCredenciales,
  fn() {
    const evidencia: Evidencia[] = [
      { herramienta: "buscar_ruta", input: {}, resultado: JSON.stringify([{ destino: "Jardín", km: 138 }]) },
      {
        herramienta: "planificar_ruta",
        input: { distancia_max_km: 100 },
        resultado: JSON.stringify({
          candidatas: [],
          restricciones_aplicadas: { distancia_max_km: 100, destinos_excluidos: ["Guatapé"] },
        }),
      },
    ];
    assertEquals(extraerConstraints(evidencia), { distancia_max_km: 100, destinos_excluidos: ["Guatapé"] });
  },
});

Deno.test({
  name: "extraerConstraints() devuelve null cuando no se llamo planificar_ruta o su resultado no es JSON valido",
  ignore: !tieneCredenciales,
  fn() {
    assertEquals(extraerConstraints([]), null);
    assertEquals(
      extraerConstraints([{ herramienta: "buscar_ruta", input: {}, resultado: JSON.stringify([]) }]),
      null,
    );
    assertEquals(
      extraerConstraints([{ herramienta: "planificar_ruta", input: {}, resultado: "Error: fallo la consulta" }]),
      null,
    );
  },
});
