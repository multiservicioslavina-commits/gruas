import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// RIDERA — Tablero en vivo. Entrega solicitudes recientes + resumen para el panel admin.
// Protegido con clave admin (lee admin_config.password).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const clave = String(body.clave ?? "");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: cfg } = await supabase.from("admin_config").select("password").eq("id", 1).single();
    if (!cfg || clave !== cfg.password) return json({ ok: false, error: "Clave incorrecta" }, 401);

    // Últimas 80 solicitudes
    const { data: sols } = await supabase.from("solicitudes")
      .select("id, cliente_nombre, cliente_telefono, ubicacion, municipio, estado, gruero_asignado, created_at, asignada_at, llego_at, finalizada_at, calificacion")
      .order("created_at", { ascending: false }).limit(80);

    // Nombres de grueros
    const ids = [...new Set((sols ?? []).map((s: any) => s.gruero_asignado).filter(Boolean))];
    const mapa: Record<string, string> = {};
    if (ids.length) {
      const { data: gs } = await supabase.from("grueros").select("id, nombre").in("id", ids);
      for (const g of (gs ?? [])) mapa[g.id] = g.nombre;
    }

    const hoy = new Date(); hoy.setUTCHours(0, 0, 0, 0);
    let totalHoy = 0, finalizadasHoy = 0, pendientes = 0, enCurso = 0;
    let sumaCal = 0, nCal = 0, sumaAcept = 0, nAcept = 0;
    const lista = (sols ?? []).map((s: any) => {
      const creada = new Date(s.created_at);
      if (creada >= hoy) {
        totalHoy++;
        if (s.estado === "finalizada") finalizadasHoy++;
      }
      if (s.estado === "pendiente") pendientes++;
      if (s.estado === "asignada" || s.estado === "llego") enCurso++;
      if (s.calificacion) { sumaCal += s.calificacion; nCal++; }
      if (s.asignada_at && s.created_at) {
        const secs = (new Date(s.asignada_at).getTime() - creada.getTime()) / 1000;
        if (secs >= 0 && secs < 3600) { sumaAcept += secs; nAcept++; }
      }
      return {
        id: s.id, cliente: s.cliente_nombre, telefono: s.cliente_telefono, ubicacion: s.ubicacion,
        municipio: s.municipio, estado: s.estado, gruero: s.gruero_asignado ? (mapa[s.gruero_asignado] || "—") : null,
        created_at: s.created_at, asignada_at: s.asignada_at, llego_at: s.llego_at,
        finalizada_at: s.finalizada_at, calificacion: s.calificacion,
      };
    });

    // Grueros disponibles ahora
    const { count: gruerosOn } = await supabase.from("grueros").select("*", { count: "exact", head: true }).eq("disponible", true);

    const resumen = {
      total_hoy: totalHoy, finalizadas_hoy: finalizadasHoy, pendientes, en_curso: enCurso,
      grueros_disponibles: gruerosOn ?? 0,
      calificacion_promedio: nCal ? Math.round((sumaCal / nCal) * 10) / 10 : null,
      tiempo_acept_prom_seg: nAcept ? Math.round(sumaAcept / nAcept) : null,
    };
    return json({ ok: true, resumen, solicitudes: lista });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
