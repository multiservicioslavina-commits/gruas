// ─────────────────────────────────────────────────────────────────
// Tests automatizados de rita-v2/tools.ts (especificacion "Rita AI /
// Ridera", seccion 25: suite de pruebas).
//
// Requieren Deno y las mismas variables de entorno que la funcion real
// (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) porque tools.ts crea el
// cliente de Supabase al importarse, no de forma perezosa -- sin esas
// variables el import mismo revienta, no solo los tests que consultan
// la base. Se corren con:
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno test --allow-net --allow-env supabase/functions/rita-v2/tools.test.ts
//
// No se ejecutaron en este sandbox (no hay Deno CLI disponible) -- ver
// el reporte final para el detalle de que quedo verificado solo por
// lectura de codigo.
//
// Todos los tests contra la base usan datos reales de produccion
// (rita_rutas), verificados por separado con SQL antes de escribir
// estos tests, para no inventar expectativas.
// ─────────────────────────────────────────────────────────────────

import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ejecutarHerramienta, norm } from "./tools.ts";

const TELEFONO_PRUEBA = "573000000000";

const tieneCredenciales = Boolean(Deno.env.get("SUPABASE_URL")) &&
  Boolean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

const supabase = tieneCredenciales
  ? createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  : null;

async function limpiarMemoriaPlanificacion() {
  await supabase?.from("rita_planificacion_contexto").delete().eq("telefono", TELEFONO_PRUEBA);
}

// ─── TEST puro: norm() ───────────────────────────────────────────
// No depende de la base -- corre siempre, incluso sin credenciales.
Deno.test("norm() normaliza mayusculas, tildes y valores vacios", () => {
  assertEquals(norm("Jardín"), "jardin");
  assertEquals(norm("GUATAPÉ"), "guatape");
  assertEquals(norm(""), "");
  // deno-lint-ignore no-explicit-any
  assertEquals(norm(null as any), "");
});

// ─── TEST 9: herramienta inexistente no debe inventar nada ───────
Deno.test({
  name: "ejecutarHerramienta() con un nombre inexistente devuelve error explicito, no un dato inventado",
  ignore: !tieneCredenciales,
  async fn() {
    const resultado = await ejecutarHerramienta("herramienta_que_no_existe", {}, TELEFONO_PRUEBA);
    assertMatch(resultado, /no existe/);
  },
});

// ─── TEST 5/6/7: buscar_ruta trae datos reales y los marca solo-ida ──
Deno.test({
  name: 'buscar_ruta("Jardín") devuelve los 138 km reales de Ridera, marcados explicitamente como solo ida',
  ignore: !tieneCredenciales,
  async fn() {
    const crudo = await ejecutarHerramienta("buscar_ruta", { destino: "Jardín" } as Record<string, never>, TELEFONO_PRUEBA);
    const data = JSON.parse(crudo);
    assert(Array.isArray(data) && data.length > 0, "deberia encontrar al menos la ruta Medellin - Jardin");
    const jardin = data.find((r: Record<string, unknown>) => norm(String(r.destino)) === "jardin");
    assert(jardin, "no aparecio la ruta a Jardin en el resultado");
    assertEquals(jardin.km, 138);
    assertEquals(jardin.km_ida, 138);
    assertMatch(String(jardin.nota_distancia), /SOLO IDA/);
  },
});

// ─── TEST 2: planificar_ruta excluye de verdad, no solo "recuerda" hacerlo ──
Deno.test({
  name: "planificar_ruta() filtra un destino excluido explicitamente y no lo devuelve como candidata",
  ignore: !tieneCredenciales,
  async fn() {
    await limpiarMemoriaPlanificacion();
    try {
      const crudo = await ejecutarHerramienta(
        "planificar_ruta",
        { distancia_max_km: 100, destinos_excluidos: ["Guatapé"] } as Record<string, never>,
        TELEFONO_PRUEBA,
      );
      const data = JSON.parse(crudo);
      assert(data.ok, `se esperaba ok:true, hubo candidatas <=100km sin contar Guatape. data=${crudo}`);
      const candidatas = data.data.candidatas as Record<string, unknown>[];
      assert(candidatas.length > 0, "deberia quedar al menos una candidata <=100km distinta de Guatape");
      assert(
        candidatas.every((r) => norm(String(r.destino)) !== "guatape"),
        "Guatape no debia aparecer entre las candidatas: quedo excluido explicitamente",
      );
      assert(
        (data.data.excluidas_por_peticion_explicita as string[]).some((t) => norm(t).includes("guatape")),
        "Guatape debia listarse en excluidas_por_peticion_explicita",
      );
      assert(candidatas.every((r) => Number(r.km) <= 100), "ninguna candidata deberia superar los 100 km pedidos");
    } finally {
      await limpiarMemoriaPlanificacion();
    }
  },
});

// ─── Memoria estructurada entre turnos (seccion 16 de la especificacion) ──
Deno.test({
  name: "planificar_ruta() recuerda una exclusion de una llamada anterior aunque no se repita",
  ignore: !tieneCredenciales,
  async fn() {
    await limpiarMemoriaPlanificacion();
    try {
      // Turno 1: el rider pide explicitamente no ir a Guatape.
      await ejecutarHerramienta(
        "planificar_ruta",
        { distancia_max_km: 100, destinos_excluidos: ["Guatapé"] } as Record<string, never>,
        TELEFONO_PRUEBA,
      );

      // Turno 2 (misma conversacion, telefono): NO repite la exclusion.
      const crudo = await ejecutarHerramienta(
        "planificar_ruta",
        { distancia_max_km: 100 } as Record<string, never>,
        TELEFONO_PRUEBA,
      );
      const data = JSON.parse(crudo);
      assert(data.ok, `se esperaba ok:true en el segundo turno. data=${crudo}`);
      const candidatas = data.data.candidatas as Record<string, unknown>[];
      assert(
        candidatas.every((r) => norm(String(r.destino)) !== "guatape"),
        "la exclusion de Guatape del turno anterior debia seguir aplicando sin que el rider la repitiera",
      );
      assert(
        "restricciones_recordadas_de_antes" in data.data,
        "debia marcar que se aplico una restriccion recordada de un turno anterior",
      );
    } finally {
      await limpiarMemoriaPlanificacion();
    }
  },
});

// ─── La memoria expira: no debe arrastrar restricciones de sesiones viejas ──
Deno.test({
  name: "planificar_ruta() no aplica una exclusion cuya memoria ya vencio (SESION_VIGENCIA_HORAS)",
  ignore: !tieneCredenciales,
  async fn() {
    await limpiarMemoriaPlanificacion();
    try {
      // Simula una fila de memoria vieja (7 horas), por encima de las 6 horas
      // de vigencia que usa planificar_ruta -- escrita directo a la tabla en
      // vez de por la herramienta, para no depender del reloj real del test.
      const hace7Horas = new Date(Date.now() - 7 * 3600 * 1000).toISOString();
      await supabase!.from("rita_planificacion_contexto").upsert({
        telefono: TELEFONO_PRUEBA,
        destinos_excluidos: ["Guatapé"],
        distancia_max_km: null,
        preferencias: [],
        updated_at: hace7Horas,
      });

      const crudo = await ejecutarHerramienta(
        "planificar_ruta",
        { distancia_max_km: 100 } as Record<string, never>,
        TELEFONO_PRUEBA,
      );
      const data = JSON.parse(crudo);
      assert(data.ok, `data=${crudo}`);
      const candidatas = data.data.candidatas as Record<string, unknown>[];
      assert(
        candidatas.some((r) => norm(String(r.destino)) === "guatape"),
        "una exclusion de hace 7 horas ya vencio (limite: 6h) y no deberia seguir aplicando",
      );
    } finally {
      await limpiarMemoriaPlanificacion();
    }
  },
});
