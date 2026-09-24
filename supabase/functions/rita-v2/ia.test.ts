// ─────────────────────────────────────────────────────────────────
// TEST 10 de la especificacion "Rita AI / Ridera" (seccion 25):
// "La respuesta de OpenAI contiene un dato falso/no sustentado. Claude
// debe detectarlo." Prueba directa de auditarRespuesta(), el auditor
// que reemplazo el viejo mecanismo de "dos borradores".
//
// Requiere una llamada real a Claude Haiku (ANTHROPIC_API_KEY) y a
// Supabase (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY, porque tools.ts se
// importa transitivamente y crea su cliente al cargar el modulo) --
// sin ANTHROPIC_API_KEY los tests se saltan solos (ignore), pero sin
// las credenciales de Supabase el import del archivo entero revienta.
// No se pudieron ejecutar en este sandbox por falta de Deno CLI; ver
// el reporte final.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
//     deno test --allow-net --allow-env supabase/functions/rita-v2/ia.test.ts
// ─────────────────────────────────────────────────────────────────

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { auditarRespuesta, type Evidencia } from "./ia.ts";

const TELEFONO_PRUEBA = "573000000000";
const tieneAnthropic = Boolean((Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim());

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
